import { describe, it, expect, vi } from 'vitest'
import { authenticate } from '../../src/middleware/auth.js'
import { signToken } from '../../src/utils/jwt.js'
import { UnauthorizedError } from '../../src/utils/error.js'
import jwt from 'jsonwebtoken'

const SECRET = 'test-secret-key-for-testing-purposes-only-32chars'

// Lightweight req/res/next fakes — no need for Express
const req  = (headers = {}) => ({ headers, id: 'test-uuid' })
const next = ()              => vi.fn()

describe('authenticate — Bearer JWT', () => {
  it('sets req.user when token is valid', () => {
    const token = signToken({ sub: 'alice', role: 'admin' })
    const r     = req({ authorization: `Bearer ${token}` })
    const n     = next()

    authenticate(r, {}, n)

    expect(n).toHaveBeenCalledWith()                     // next() with no args = success
    expect(r.user).toMatchObject({ id: 'alice', role: 'admin', authMethod: 'jwt' })
  })

  it('calls next(UnauthorizedError) for a tampered token', () => {
    const r = req({ authorization: 'Bearer totally.fake.token' })
    const n = next()

    authenticate(r, {}, n)

    expect(n).toHaveBeenCalledWith(expect.any(UnauthorizedError))
  })

  it('calls next(UnauthorizedError) for an expired token', () => {
    const token = jwt.sign({ sub: 'alice' }, SECRET, { expiresIn: -1 })
    const r     = req({ authorization: `Bearer ${token}` })
    const n     = next()

    authenticate(r, {}, n)

    expect(n).toHaveBeenCalledWith(expect.any(UnauthorizedError))
  })

  it('defaults role to "user" when the token has no role claim', () => {
    const token = signToken({ sub: 'bob' })    // no role field
    const r     = req({ authorization: `Bearer ${token}` })
    const n     = next()

    authenticate(r, {}, n)

    expect(r.user.role).toBe('user')
  })

  it('status on UnauthorizedError is 401', () => {
    const r = req({ authorization: 'Bearer bad.token' })
    const n = next()

    authenticate(r, {}, n)

    const err = n.mock.calls[0][0]
    expect(err.status).toBe(401)
  })
})

describe('authenticate — API key', () => {
  it('sets req.user when API key matches env', () => {
    const r = req({ 'x-api-key': 'test-api-key-for-testing-1234' })
    const n = next()

    authenticate(r, {}, n)

    expect(n).toHaveBeenCalledWith()
    expect(r.user).toMatchObject({ id: 'api-client', role: 'service', authMethod: 'apikey' })
  })

  it('calls next(UnauthorizedError) when key is wrong', () => {
    const r = req({ 'x-api-key': 'completely-wrong-key' })
    const n = next()

    authenticate(r, {}, n)

    expect(n).toHaveBeenCalledWith(expect.any(UnauthorizedError))
  })

  it('calls next(UnauthorizedError) when key is empty string', () => {
    const r = req({ 'x-api-key': '' })
    const n = next()

    authenticate(r, {}, n)

    expect(n).toHaveBeenCalledWith(expect.any(UnauthorizedError))
  })
})

describe('authenticate — no credentials', () => {
  it('calls next(UnauthorizedError) when no headers are present', () => {
    const r = req({})
    const n = next()

    authenticate(r, {}, n)

    const err = n.mock.calls[0][0]
    expect(err).toBeInstanceOf(UnauthorizedError)
    expect(err.message).toBe('No credentials provided')
    expect(err.status).toBe(401)
  })

  it('JWT takes priority when both headers are present', () => {
    const token = signToken({ sub: 'alice', role: 'user' })
    const r     = req({
      authorization: `Bearer ${token}`,
      'x-api-key':   'test-api-key-for-testing-1234',
    })
    const n = next()

    authenticate(r, {}, n)

    expect(r.user.authMethod).toBe('jwt')
    expect(r.user.id).toBe('alice')
  })
})
