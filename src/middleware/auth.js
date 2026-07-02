import { verifyToken } from '../utils/jwt.js';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../utils/error.js';
import { logger } from '../services/logger.js';
import { timingSafeEqual } from 'crypto';



const safeCompare = (a, b) => {
    try {
        return timingSafeEqual(Buffer.from(a), Buffer.from(b))
    } catch (error) {
        return false
    }
}

export const authenticate = (req, res, next) => {
    try {
        const authHeader = req.headers['authorization']
        const apiKey = req.headers['x-api-key']

        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.slice(7) //remove bearer prefix
            const payload = verifyToken(token)

            req.user = {
                id: payload.sub,
                role: payload.role ?? 'user',
                authMethod: 'jwt',
            }
            logger.debug('jwt auth successful', { requestId: req.id, userId: req.user.id })
            return next();
        }
        if (apiKey) {
            const isValid = safeCompare(apiKey, env.API_KEY)

            if (!isValid) {
                throw new UnauthorizedError('Invalid API Key')
            }

            req.user = {
                id: 'api-client',
                role: 'service',
                authMethod: 'apikey',
            }

            logger.debug('api key auth successful', { requestId: req.id })
            return next()
        }


        //neither header present
        throw new UnauthorizedError('No credentials provided')
    } catch (error) {
        next(error); //passed to errorHandler
    }
}