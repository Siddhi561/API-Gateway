import { describe, it, expect } from 'vitest'
import jwt from 'jsonwebtoken'
import { signToken, verifyToken } from '../../src/utils/jwt.js'
import { UnauthorizedError } from '../../src/utils/error.js'

const SECRET = 'test-secret-key-for-testing-purposes-only-32chars'

describe('signToken', () => {
  it('returns a 3-part dot-separated string', () => {
    const token = signToken({ sub: 'alice', role: 'user' })
    expect(typeof token).toBe('string')
    expect(token.split('.')).toHaveLength(3)
  })

  it('embeds sub and role in the payload', () => {
    const token   = signToken({ sub: 'alice', role: 'admin' })
    const payload = jwt.decode(token)
    expect(payload.sub).toBe('alice')
    expect(payload.role).toBe('admin')
  })

  it('sets an expiry of exactly 1 hour', () => {
    const token   = signToken({ sub: 'alice' })
    const payload = jwt.decode(token)
    expect(payload.exp - payload.iat).toBe(3600)
  })
})

describe('verifyToken', () => {
  it('returns decoded payload for a valid token', () => {
    const token   = signToken({ sub: 'alice', role: 'user' })
    const payload = verifyToken(token)
    expect(payload.sub).toBe('alice')
    expect(payload.role).toBe('user')
  })

  it('throws UnauthorizedError for a tampered token', () => {
    const token    = signToken({ sub: 'alice' })
    const tampered = token.slice(0, -4) + 'xxxx'
    expect(() => verifyToken(tampered)).toThrow(UnauthorizedError)
  })

  it('throws UnauthorizedError for an expired token', () => {
    const token = jwt.sign({ sub: 'alice' }, SECRET, { expiresIn: -1 })
    expect(() => verifyToken(token)).toThrow(UnauthorizedError)
  })

  it('throws UnauthorizedError for a completely fake string', () => {
    expect(() => verifyToken('totally.fake.token')).toThrow(UnauthorizedError)
  })

  it('error message is identical for expired vs tampered — no info leak', () => {
    const expired  = jwt.sign({ sub: 'x' }, SECRET, { expiresIn: -1 })
    let expiredMsg, tamperedMsg
    try { verifyToken(expired) }          catch (e) { expiredMsg  = e.message }
    try { verifyToken('bad.token.here') } catch (e) { tamperedMsg = e.message }
    expect(expiredMsg).toBe(tamperedMsg)
  })
})
