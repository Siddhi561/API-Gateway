import { describe, it, expect } from 'vitest'
import { createCircuitBreaker, STATE } from '../../src/services/circuitBreaker.service.js'

const OPTS = { failureThreshold: 3, cooldownSeconds: 30 }

// Trip the circuit and return the instance
function trippedCircuit() {
  const cb = createCircuitBreaker(OPTS)
  cb.recordFailure(); cb.recordFailure(); cb.recordFailure()
  return cb
}

// Put the circuit into HALF_OPEN by winding back lastFailureTime
function halfOpenCircuit() {
  const cb = trippedCircuit()
  cb._circuit.lastFailureTime = Date.now() - 31_000   // past cooldown
  cb.canRequest()                                       // triggers OPEN → HALF_OPEN
  return cb
}

// ── CLOSED ────────────────────────────────────────────────────────
describe('CLOSED state', () => {
  it('starts CLOSED', () => {
    expect(createCircuitBreaker(OPTS).getState().state).toBe(STATE.CLOSED)
  })

  it('allows requests when CLOSED', () => {
    expect(createCircuitBreaker(OPTS).canRequest()).toBe(true)
  })

  it('stays CLOSED after isolated successes', () => {
    const cb = createCircuitBreaker(OPTS)
    cb.recordSuccess(); cb.recordSuccess()
    expect(cb.getState().state).toBe(STATE.CLOSED)
  })

  it('stays CLOSED when failures are below the threshold', () => {
    const cb = createCircuitBreaker(OPTS)
    cb.recordFailure(); cb.recordFailure()   // 2 of 3 — not tripped
    expect(cb.getState().state).toBe(STATE.CLOSED)
    expect(cb.canRequest()).toBe(true)
  })

  it('tracks failure count correctly', () => {
    const cb = createCircuitBreaker(OPTS)
    cb.recordFailure(); cb.recordFailure()
    expect(cb.getState().failures).toBe(2)
  })

  it('resets failure count to 0 on success', () => {
    const cb = createCircuitBreaker(OPTS)
    cb.recordFailure(); cb.recordFailure()
    cb.recordSuccess()
    expect(cb.getState().failures).toBe(0)
  })
})

// ── CLOSED → OPEN ─────────────────────────────────────────────────
describe('CLOSED → OPEN', () => {
  it('trips to OPEN on the 3rd consecutive failure', () => {
    expect(trippedCircuit().getState().state).toBe(STATE.OPEN)
  })

  it('blocks all requests immediately after tripping', () => {
    const cb = trippedCircuit()
    expect(cb.canRequest()).toBe(false)
    expect(cb.canRequest()).toBe(false)
  })

  it('records lastFailureTime when tripping', () => {
    expect(trippedCircuit().getState().lastFailureTime).not.toBeNull()
  })
})

// ── OPEN → HALF_OPEN ──────────────────────────────────────────────
describe('OPEN → HALF_OPEN', () => {
  it('stays OPEN when only 29 s have elapsed (1 s before cooldown)', () => {
    const cb = trippedCircuit()
    cb._circuit.lastFailureTime = Date.now() - 29_000
    expect(cb.canRequest()).toBe(false)
    expect(cb.getState().state).toBe(STATE.OPEN)
  })

  it('transitions to HALF_OPEN after 31 s (past cooldown)', () => {
    const cb = trippedCircuit()
    cb._circuit.lastFailureTime = Date.now() - 31_000
    expect(cb.canRequest()).toBe(true)
    expect(cb.getState().state).toBe(STATE.HALF_OPEN)
  })

  it('allows exactly one probe — second request in HALF_OPEN is blocked', () => {
    const cb = trippedCircuit()
    cb._circuit.lastFailureTime = Date.now() - 31_000

    const first  = cb.canRequest()   // OPEN → HALF_OPEN, probe slot claimed
    const second = cb.canRequest()   // HALF_OPEN, probe in flight → blocked

    expect(first).toBe(true)
    expect(second).toBe(false)
  })
})

// ── HALF_OPEN → CLOSED ────────────────────────────────────────────
describe('HALF_OPEN → CLOSED (probe succeeds)', () => {
  it('closes the circuit when the probe succeeds', () => {
    const cb = halfOpenCircuit()
    cb.recordSuccess()
    expect(cb.getState().state).toBe(STATE.CLOSED)
    expect(cb.getState().failures).toBe(0)
  })

  it('allows subsequent requests normally after recovery', () => {
    const cb = halfOpenCircuit()
    cb.recordSuccess()
    expect(cb.canRequest()).toBe(true)
    expect(cb.canRequest()).toBe(true)
  })
})

// ── HALF_OPEN → OPEN ──────────────────────────────────────────────
describe('HALF_OPEN → OPEN (probe fails)', () => {
  it('reopens the circuit when the probe fails', () => {
    const cb = halfOpenCircuit()
    cb.recordFailure()
    expect(cb.getState().state).toBe(STATE.OPEN)
  })

  it('restarts the cooldown — blocks immediately after probe failure', () => {
    const cb = halfOpenCircuit()
    cb.recordFailure()   // back to OPEN, lastFailureTime = now()
    // 0 s into new cooldown — must be blocked
    expect(cb.canRequest()).toBe(false)
  })
})

// ── reset ─────────────────────────────────────────────────────────
describe('reset', () => {
  it('fully resets to CLOSED with zero failures', () => {
    const cb = trippedCircuit()
    cb.reset()
    expect(cb.getState().state).toBe(STATE.CLOSED)
    expect(cb.getState().failures).toBe(0)
    expect(cb.getState().lastFailureTime).toBeNull()
  })

  it('allows requests again after reset', () => {
    const cb = trippedCircuit()
    cb.reset()
    expect(cb.canRequest()).toBe(true)
  })
})
