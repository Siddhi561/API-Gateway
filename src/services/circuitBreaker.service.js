import { logger } from './logger.js'
import { env } from '../config/env.js'

const FAILURE_THRESHOLD = parseInt(env.CB_FAILURE_THRESHOLD)
const COOLDOWN_MS = parseInt(env.CB_COOLDOWN_SECONDS) * 1000


const STATE = {
  CLOSED: 'CLOSED',       
  OPEN: 'OPEN',           
  HALF_OPEN: 'HALF_OPEN', 
}


const circuit = {
  state: STATE.CLOSED,
  failures: 0,
  lastFailureTime: null,
  successfulProbe: false,
}

export const canRequest = () => {
  if (circuit.state === STATE.CLOSED) return true

  if (circuit.state === STATE.OPEN) {
    const elapsed = Date.now() - circuit.lastFailureTime
    // Cooldown passed — move to half-open to allow one probe
    if (elapsed >= COOLDOWN_MS) {
      circuit.state = STATE.HALF_OPEN
      logger.warn('circuit breaker half-open — sending probe request', {
        failures: circuit.failures,
        cooldownMs: COOLDOWN_MS,
      })
      return true 
    }
    return false 
  }

  if (circuit.state === STATE.HALF_OPEN) {
    
    return !circuit.successfulProbe
  }

  return false
}


export const recordSuccess = () => {
  if (circuit.state === STATE.HALF_OPEN) {
    logger.info('circuit breaker closed — upstream recovered', {
      previousFailures: circuit.failures,
    })
    circuit.state = STATE.CLOSED
    circuit.failures = 0
    circuit.lastFailureTime = null
    circuit.successfulProbe = false
    return
  }
  
  circuit.failures = 0
}


export const recordFailure  = () => {

  //test
 console.log('FAILURE COUNT:', circuit.failures)

  circuit.failures += 1
  circuit.lastFailureTime = Date.now()

  if (circuit.state === STATE.HALF_OPEN) {
    
    logger.warn('circuit breaker reopened — probe request failed', {
      failures: circuit.failures,
    })
    circuit.state = STATE.OPEN
    circuit.successfulProbe = false
    return
  }

  if (circuit.failures >= FAILURE_THRESHOLD) {
   
    logger.error('circuit breaker opened — failure threshold reached', {
      failures: circuit.failures,
      threshold: FAILURE_THRESHOLD,
    })
    circuit.state = STATE.OPEN
  }
}


export const getCircuitState = () => ({
  state: circuit.state,
  failures: circuit.failures,
  threshold: FAILURE_THRESHOLD,
  cooldownSeconds: parseInt(env.CB_COOLDOWN_SECONDS),
  lastFailureTime: circuit.lastFailureTime
    ? new Date(circuit.lastFailureTime).toISOString()
    : null,
})