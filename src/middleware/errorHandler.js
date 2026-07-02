import { logger, captureException } from '../services/logger.js'

export const errorHandler = (err, req, res, next) => {
  const status = err.status ?? 500


  if (status >= 500) {
    captureException(err, {
      requestId: req.id,
      userId: req.user?.id,
      method: req.method,
      path: req.path,
    })
  }

  logger.error('request error', {
    requestId: req.id,
    status,
    message: err.message,
    name: err.name,
    // Only log stack in development as stacks in prod logs are noisy
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  })

  res.status(status).json({
    error: {
      message: err.message ?? 'Internal server error',
      requestId: req.id,
    }
  })
}