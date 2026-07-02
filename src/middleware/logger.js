import {logger} from '../services/logger.js';

export const requestLogger = (req, res, next) =>{
    const start = Date.now()

    res.on('finish', () =>{
        const duration = Date.now() - start
        logger.info('request completed', {
            requestId: req.id,
            method:req.method,
            path: req.path,
            status: res.statusCode,
            duration: `${duration}ms`,
        })
    })
    next()
}