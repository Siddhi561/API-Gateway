import fetch from 'node-fetch'
import { env } from '../config/env.js'
import { logger } from './logger.js'
import { canRequest, recordSuccess, recordFailure } from './circuitBreaker.service.js'
import { CircuitOpenError } from '../utils/error.js'

export const forwardRequest = async ({ method, path, headers, body, requestId }) => {
  
  if (!canRequest()) {
    logger.warn('circuit breaker blocked request', { requestId, path })
    throw new CircuitOpenError()
  }

  const upstreamUrl = `${env.UPSTREAM_URL}${path}`

  
  const forwardHeaders = {
    'content-type': headers['content-type'] ?? 'application/json',
    'x-request-id': requestId,      
    'x-forwarded-by': 'api-gateway', 
  }

  const start = Date.now()

  logger.debug('forwarding request to upstream', {
    requestId,
    method,
    upstreamUrl,
  })

  try {
    const response = await fetch(upstreamUrl, {
      method,
      headers: forwardHeaders,
      body: ['POST', 'PUT', 'PATCH'].includes(method) ? JSON.stringify(body) : undefined,
      // Always set a timeout — without this, a slow upstream hangs your gateway forever
      signal: AbortSignal.timeout(8000), // 8 second max wait
    })

    const duration = Date.now() - start

    // Treating 5xx from upstream as failures
    if (response.status >= 500) {
      recordFailure()
      logger.warn('upstream returned server error', {
        requestId,
        status: response.status,
        duration: `${duration}ms`,
      })
    } else {
      recordSuccess()
      logger.info('upstream responded', {
        requestId,
        upstreamUrl,
        status: response.status,
        duration: `${duration}ms`,
      })
    }

    const data = await response.json()
    return { status: response.status, data, duration }

  } catch (err) {
    // Network error, timeout, DNS failure etc.
    recordFailure()
    logger.error('upstream request failed', {
      requestId,
      upstreamUrl,
      error: err.message,
    })
    throw err
  }
}