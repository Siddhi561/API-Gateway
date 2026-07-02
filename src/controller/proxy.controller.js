import { forwardRequest } from '../services/proxy.service.js'
import { logger } from '../services/logger.js'

export const proxyRequest = async (req, res, next) => {
  try {
    
    const upstreamPath = `/${req.params[0]}`

    const result = await forwardRequest({
      method: req.method,
      path: upstreamPath,
      headers: req.headers,
      body: req.body,
      requestId: req.id,
    })

    res.setHeader('x-gateway', 'true')
    res.setHeader('x-upstream-duration', result.duration)

    res.status(result.status).json(result.data)

  } catch (err) {
    logger.error('proxy request failed', {
      requestId: req.id,
      userId: req.user?.id,
      error: err.message,
    })
    next(err)
  }
}