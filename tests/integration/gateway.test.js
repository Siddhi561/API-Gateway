
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  vi,
} from 'vitest'

vi.mock('../../src/services/redis.js', () => ({
  redis: {
    ping: vi.fn().mockResolvedValue('PONG'),
  },
  connectRedis: vi.fn(),
}))

import request from 'supertest'
import { createApp } from '../../src/app.js'
import { signToken } from '../../src/utils/jwt.js'
import { createCircuitBreaker } from '../../src/services/circuitBreaker.service.js'
import {
  CircuitOpenError,
  UpstreamTimeoutError,
} from '../../src/utils/error.js'
import { redis as upstashRedis } from '../../src/services/redis.js'

// ── Helpers ──────────────────────────────────────────────────────

const token = (role = 'user') =>
  signToken({ sub: 'test-user', role })

const bearer = (role = 'user') =>
  `Bearer ${token(role)}`

// Fake proxy service that returns a fixed response
const fakeProxy = (
  status = 200,
  data = { ok: true },
  duration = 1,
) => ({
  forwardRequest: async () => ({ status, data, duration }),
})

// ── GET /health ──────────────────────────────────────────────────

describe('GET /health', () => {
  const app = createApp({ proxyService: fakeProxy() })

  beforeEach(() => {
    vi.spyOn(upstashRedis, 'ping').mockResolvedValue('PONG')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })

  it('includes circuit breaker state in dependencies', async () => {
    const res = await request(app).get('/health')

    expect(res.body.dependencies.upstream.state).toBe('CLOSED')
  })

  it('does not require authentication', async () => {
    const res = await request(app).get('/health')

    expect(res.status).not.toBe(401)
  })

  it('echoes x-request-id as a response header', async () => {
    const res = await request(app).get('/health')

    expect(res.headers['x-request-id']).toBeDefined()
  })

  it('forwards a client-supplied x-request-id unchanged', async () => {
    const id = 'my-trace-id-12345'

    const res = await request(app)
      .get('/health')
      .set('x-request-id', id)

    expect(res.headers['x-request-id']).toBe(id)
  })
})

// ── POST /auth/token ─────────────────────────────────────────────

describe('POST /auth/token', () => {
  const app = createApp({ proxyService: fakeProxy() })

  it('issues a JWT when username is provided', async () => {
    const res = await request(app)
      .post('/auth/token')
      .send({ username: 'alice', role: 'user' })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
    expect(res.body.expiresIn).toBe('1h')
    expect(res.body.authMethod).toBe('jwt')
  })

  it('returns 400 when username is missing', async () => {
    const res = await request(app)
      .post('/auth/token')
      .send({ role: 'user' })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe('username is required')
  })

  it('defaults role to user when not provided', async () => {
    const res = await request(app)
      .post('/auth/token')
      .send({ username: 'alice' })

    const { default: jwt } = await import('jsonwebtoken')
    const payload = jwt.decode(res.body.token)

    expect(payload.role).toBe('user')
  })

  it('is reachable without authentication credentials', async () => {
    const res = await request(app)
      .post('/auth/token')
      .send({ username: 'alice' })

    expect(res.status).not.toBe(401)
  })

  it('400 response includes requestId', async () => {
    const res = await request(app)
      .post('/auth/token')
      .send({})

    expect(res.body.error.requestId).toBeDefined()
  })
})

// ── Authentication on protected routes ──────────────────────────

describe('Authentication', () => {
  const app = createApp({ proxyService: fakeProxy() })

  it('returns 401 with no credentials', async () => {
    const res = await request(app).get('/api/posts')

    expect(res.status).toBe(401)
    expect(res.body.error.message).toBe('No credentials provided')
  })

  it('returns 401 for a tampered JWT', async () => {
    const res = await request(app)
      .get('/api/posts')
      .set('Authorization', 'Bearer tampered.jwt.token')

    expect(res.status).toBe(401)
  })

  it('returns 401 for a wrong API key', async () => {
    const res = await request(app)
      .get('/api/posts')
      .set('x-api-key', 'completely-wrong-key-here')

    expect(res.status).toBe(401)
  })

  it('accepts a valid JWT and returns 200', async () => {
    const res = await request(app)
      .get('/api/posts')
      .set('Authorization', bearer())

    expect(res.status).toBe(200)
  })

  it('accepts a valid API key and returns 200', async () => {
    const res = await request(app)
      .get('/api/posts')
      .set('x-api-key', 'test-api-key-for-testing-1234')

    expect(res.status).toBe(200)
  })

  it('401 response includes requestId for tracing', async () => {
    const res = await request(app).get('/api/posts')

    expect(res.body.error.requestId).toBeDefined()
  })

  it('sets x-request-id header even on auth failures', async () => {
    const res = await request(app).get('/api/posts')

    expect(res.headers['x-request-id']).toBeDefined()
  })

  it('returns 401 for an expired token', async () => {
    const { default: jwt } = await import('jsonwebtoken')

    const secret = 'test-secret-key-for-testing-purposes-only-32chars'
    const expired = jwt.sign(
      { sub: 'alice' },
      secret,
      { expiresIn: -1 },
    )

    const res = await request(app)
      .get('/api/posts')
      .set('Authorization', `Bearer ${expired}`)

    expect(res.status).toBe(401)
  })
})

// ── Rate Limiting ────────────────────────────────────────────────
// Uses local ioredis, e.g. Redis started by Docker in CI.

describe('Rate Limiting', () => {
  const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

  let localRedis
  let app

  beforeAll(async () => {
    try {
      const { default: Redis } = await import('ioredis')

      localRedis = new Redis(REDIS_URL, {
        lazyConnect: true,
        connectTimeout: 2000,
      })

      await localRedis.connect()
      await localRedis.ping()
    } catch {
      localRedis = null
    }
  })

  beforeEach(async () => {
    if (!localRedis) return

    await localRedis.flushdb()

    const { createRateLimiter } = await import(
      '../../src/services/rateLimiter.service.js'
    )

    const limiter = createRateLimiter(localRedis, {
      max: 3,
      window: 60,
    })

    app = createApp({
      rateLimiterService: limiter,
      proxyService: fakeProxy(),
    })
  })

  afterAll(async () => {
    if (localRedis) {
      await localRedis.quit()
    }
  })

  const skip = () => !localRedis

  it('allows requests up to the configured limit', async () => {
    if (skip()) return

    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .get('/api/posts')
        .set('Authorization', bearer())

      expect(res.status).toBe(200)
    }
  })

  it('returns 429 on the request that exceeds the limit', async () => {
    if (skip()) return

    for (let i = 0; i < 3; i++) {
      await request(app)
        .get('/api/posts')
        .set('Authorization', bearer())
    }

    const res = await request(app)
      .get('/api/posts')
      .set('Authorization', bearer())

    expect(res.status).toBe(429)
    expect(res.body.error.message).toBe('Too many requests')
  })

  it('X-RateLimit-Remaining counts down with each request', async () => {
    if (skip()) return

    const r1 = await request(app)
      .get('/api/posts')
      .set('Authorization', bearer())

    const r2 = await request(app)
      .get('/api/posts')
      .set('Authorization', bearer())

    expect(Number(r1.headers['x-ratelimit-remaining']))
      .toBeGreaterThan(Number(r2.headers['x-ratelimit-remaining']))
  })

  it('X-RateLimit-Limit header matches configured limit', async () => {
    if (skip()) return

    const res = await request(app)
      .get('/api/posts')
      .set('Authorization', bearer())

    expect(res.headers['x-ratelimit-limit']).toBe('3')
  })

  it('X-RateLimit-Reset is a future unix timestamp', async () => {
    if (skip()) return

    const res = await request(app)
      .get('/api/posts')
      .set('Authorization', bearer())

    const reset = Number(res.headers['x-ratelimit-reset'])

    expect(reset).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('two different users have separate rate limit counters', async () => {
    if (skip()) return

    const tokenA = `Bearer ${signToken({ sub: 'user-a', role: 'user' })}`

    for (let i = 0; i < 3; i++) {
      await request(app)
        .get('/api/posts')
        .set('Authorization', tokenA)
    }

    const limitedA = await request(app)
      .get('/api/posts')
      .set('Authorization', tokenA)

    expect(limitedA.status).toBe(429)

    const tokenB = `Bearer ${signToken({ sub: 'user-b', role: 'user' })}`

    const resB = await request(app)
      .get('/api/posts')
      .set('Authorization', tokenB)

    expect(resB.status).toBe(200)
    expect(resB.headers['x-ratelimit-remaining']).toBe('2')
  })

  it('API key client has its own counter separate from JWT users', async () => {
    if (skip()) return

    for (let i = 0; i < 3; i++) {
      await request(app)
        .get('/api/posts')
        .set('Authorization', bearer())
    }

    const jwtLimited = await request(app)
      .get('/api/posts')
      .set('Authorization', bearer())

    expect(jwtLimited.status).toBe(429)

    const apiRes = await request(app)
      .get('/api/posts')
      .set('x-api-key', 'test-api-key-for-testing-1234')

    expect(apiRes.status).toBe(200)
  })
})

// ── Circuit Breaker ──────────────────────────────────────────────

describe('Circuit Breaker', () => {
  it('forwards requests normally when CLOSED', async () => {
    const proxy = fakeProxy(200, { posts: [] })
    const app = createApp({ proxyService: proxy })

    const res = await request(app)
      .get('/api/posts')
      .set('Authorization', bearer())

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ posts: [] })
  })

  it('returns 503 when circuit is OPEN and makes zero upstream calls', async () => {
    let callCount = 0

    const cb = createCircuitBreaker({
      failureThreshold: 2,
      cooldownSeconds: 30,
    })

    const proxy = {
      forwardRequest: async () => {
        if (!cb.canRequest()) {
          throw new CircuitOpenError()
        }

        callCount++
        cb.recordFailure()

        throw new Error('upstream down')
      },
    }

    const app = createApp({ proxyService: proxy })

    await request(app)
      .get('/api/posts')
      .set('Authorization', bearer())

    await request(app)
      .get('/api/posts')
      .set('Authorization', bearer())

    expect(cb.getState().state).toBe('OPEN')

    const countBeforeBlockedCall = callCount

    const res = await request(app)
      .get('/api/posts')
      .set('Authorization', bearer())

    expect(res.status).toBe(503)
    expect(callCount).toBe(countBeforeBlockedCall)
  })

  it('returns 504 when upstream times out', async () => {
    const proxy = {
      forwardRequest: async () => {
        throw new UpstreamTimeoutError()
      },
    }

    const app = createApp({ proxyService: proxy })

    const res = await request(app)
      .get('/api/posts')
      .set('Authorization', bearer())

    expect(res.status).toBe(504)
  })

  it('circuit recovers after cooldown — OPEN → HALF_OPEN → CLOSED', async () => {
    const cb = createCircuitBreaker({
      failureThreshold: 2,
      cooldownSeconds: 30,
    })

    let shouldFail = true

    const proxy = {
      forwardRequest: async () => {
        if (!cb.canRequest()) {
          throw new CircuitOpenError()
        }

        if (shouldFail) {
          cb.recordFailure()
          throw new Error('down')
        }

        cb.recordSuccess()

        return {
          status: 200,
          data: { recovered: true },
          duration: 1,
        }
      },
    }

    const app = createApp({ proxyService: proxy })

    await request(app)
      .get('/api/posts')
      .set('Authorization', bearer())

    await request(app)
      .get('/api/posts')
      .set('Authorization', bearer())

    expect(cb.getState().state).toBe('OPEN')

    cb._circuit.lastFailureTime = Date.now() - 31_000
    shouldFail = false

    const res = await request(app)
      .get('/api/posts')
      .set('Authorization', bearer())

    expect(res.status).toBe(200)
    expect(cb.getState().state).toBe('CLOSED')
  })
})

// ── Proxy Routing ────────────────────────────────────────────────

describe('Proxy routing', () => {
  it('sets x-gateway: true on all proxied responses', async () => {
    const app = createApp({
      proxyService: fakeProxy(200, { id: 1 }),
    })

    const res = await request(app)
      .get('/api/posts/1')
      .set('Authorization', bearer())

    expect(res.headers['x-gateway']).toBe('true')
  })

  it('sets x-upstream-duration header', async () => {
    const app = createApp({
      proxyService: fakeProxy(200, {}, 42),
    })

    const res = await request(app)
      .get('/api/posts/1')
      .set('Authorization', bearer())

    expect(res.headers['x-upstream-duration']).toBe('42')
  })

  it('forwards the upstream status code to the client', async () => {
    const app = createApp({
      proxyService: fakeProxy(404, { error: 'not found' }),
    })

    const res = await request(app)
      .get('/api/posts/99999')
      .set('Authorization', bearer())

    expect(res.status).toBe(404)
  })

  it('forwards the upstream response body unchanged', async () => {
    const body = {
      id: 5,
      title: 'test',
      body: 'content',
    }

    const app = createApp({
      proxyService: fakeProxy(200, body),
    })

    const res = await request(app)
      .get('/api/posts/5')
      .set('Authorization', bearer())

    expect(res.body).toEqual(body)
  })

  it('handles POST with a body and forwards it upstream', async () => {
    let receivedBody

    const proxy = {
      forwardRequest: async ({ body }) => {
        receivedBody = body

        return {
          status: 201,
          data: { id: 101, ...body },
          duration: 1,
        }
      },
    }

    const app = createApp({ proxyService: proxy })

    await request(app)
      .post('/api/posts')
      .set('Authorization', bearer())
      .send({ title: 'hello', userId: 1 })

    expect(receivedBody).toMatchObject({
      title: 'hello',
      userId: 1,
    })
  })

  it('error response always includes requestId', async () => {
    const app = createApp({ proxyService: fakeProxy() })

    const res = await request(app).get('/api/posts')

    expect(res.body.error.requestId).toBeDefined()
  })

  it('every response includes x-request-id header', async () => {
    const app = createApp({ proxyService: fakeProxy() })

    const res = await request(app)
      .get('/api/posts')
      .set('Authorization', bearer())

    expect(res.headers['x-request-id']).toBeDefined()
  })
})