import { checkRateLimit } from '../services/rateLimiter.services.js';
import { logger } from '../services/logger.js';

class RateLimitError extends Error {
    constructor(resetAt) {
        super('Too many requests')
        this.status = 429
        this.resetAt = resetAt
    }
}

export const rateLimiter = async (req, res, next) => {
    try {
        const result = await checkRateLimit(req.user.id)

        res.setHeader('x-RateLimit-Limit', result.limit)
        res.setHeader('x-RateLimit-Remaining', result.remaining)
        res.setHeader('x-RateLimit-Reset', result.resetAt)

        if (!result.allowed) {
            logger.warn('rate limit exceeded', {
                requestId: req.id,
                userId: req.user.id,
                count: result.count,
                limit: result.limit,
            })
            return next(new RateLimitError(result.resetAt))
        }
        logger.debug('rate limit check passed', {
            requestId: req.id,
            userId: req.user.id,
            remaining: req.remaining,
        })

        next();

    } catch (error) {
        logger.error('rate limiter failed - failing open', {
            requestId: req.id,
            error: error.message,
        })

        next()
    }
}