import { redis } from './redis.js';
import { env } from '../config/env.js';
import { request } from 'express';

const MAX = parseInt(env.RATE_LIMIT_MAX);
const WINDOW = parseInt(env.RATE_LIMIT_WINDOW_SECONDS);

export const checkRateLimit = async (userId) => {
    const now = Date.now()
    const windowStart = now - WINDOW * 1000
    const key = `ratelimit: ${userId}`

    const pipepline = redis.pipeline()

    pipepline.zremrangebyscore(key, 0, windowStart)
    pipepline.zadd(key, { score: now, member: `${now}` })
    pipepline.zcount(key, windowStart, now)
    pipepline.expire(key, WINDOW)

    const result = await pipepline.exec()

    //current position
    const requestCount = result[2]

    return {
        allowed: requestCount <= MAX,
        count: requestCount,
        remaining: Math.max(0, MAX - requestCount),
        resetAt: Math.ceil((now + WINDOW * 1000) / 1000), //unix timestamp
        limit: MAX,
    }
}