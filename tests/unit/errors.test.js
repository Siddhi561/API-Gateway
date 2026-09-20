import { describe, it, expect } from 'vitest'
import {
  UnauthorizedError, ForbiddenError, NotFoundError,
  RateLimitError, CircuitOpenError, UpstreamTimeoutError,
} from '../../src/utils/error.js'

describe('Custom error classes', () => {
  const cases = [
    { Cls: UnauthorizedError,   status: 401, name: 'UnauthorizedError',   defaultMsg: 'Unauthorized' },
    { Cls: ForbiddenError,      status: 403, name: 'ForbiddenError',      defaultMsg: 'Forbidden' },
    { Cls: NotFoundError,       status: 404, name: 'NotFoundError',       defaultMsg: 'Not found' },
    { Cls: CircuitOpenError,    status: 503, name: 'CircuitOpenError',    defaultMsg: 'circuit breaker' },
    { Cls: UpstreamTimeoutError,status: 504, name: 'UpstreamTimeoutError',defaultMsg: 'timed out' },
  ]

  cases.forEach(({ Cls, status, name, defaultMsg }) => {
    describe(name, () => {
      it(`has status ${status}`, () => {
        expect(new Cls().status).toBe(status)
      })

      it(`has name "${name}"`, () => {
        expect(new Cls().name).toBe(name)
      })

      it('is an instance of Error', () => {
        expect(new Cls()).toBeInstanceOf(Error)
      })

      it(`default message contains "${defaultMsg}"`, () => {
        expect(new Cls().message.toLowerCase()).toContain(defaultMsg.toLowerCase())
      })
    })
  })

  it('UnauthorizedError accepts custom message', () => {
    const err = new UnauthorizedError('Invalid API key')
    expect(err.message).toBe('Invalid API key')
    expect(err.status).toBe(401)
  })

  it('RateLimitError stores the resetAt timestamp', () => {
    const ts  = Math.floor(Date.now() / 1000) + 60
    const err = new RateLimitError(ts)
    expect(err.status).toBe(429)
    expect(err.resetAt).toBe(ts)
  })
})
