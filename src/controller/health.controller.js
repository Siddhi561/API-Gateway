import { redis } from '../services/redis.js'
import { getCircuitState } from '../services/circuitBreaker.service.js'
import { env } from '../config/env.js'

export const getHealth = async (req, res) => {
  
  let redisStatus = 'ok'
  try {
    await redis.ping()
  } catch {
    redisStatus = 'unreachable'
  }

  const circuit = getCircuitState()
  const allHealthy = redisStatus === 'ok' && circuit.state === 'CLOSED'

  // Return 200 only if everything is healthy
  // Return 503 if any dependency is down — load balancers use this to route around broken instances
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ok' : 'degraded',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    dependencies: {
      redis: redisStatus,
      upstream: {
        circuitBreaker: circuit.state,
        failures: circuit.failures,
        threshold: circuit.threshold,
        lastFailure: circuit.lastFailureTime,
      },
    },
  })
}