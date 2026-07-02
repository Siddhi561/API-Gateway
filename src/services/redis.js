import { Redis } from "@upstash/redis";
import { env } from '../config/env.js';
import { logger } from './logger.js';

export const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
})

export const connectRedis = async () => {

    console.log('URL:', env.UPSTASH_REDIS_REST_URL)
    console.log('TOKEN EXISTS:', !!env.UPSTASH_REDIS_REST_TOKEN)
    
    try {
        await redis.ping()
        console.log('Connected')
    } catch (err) {
        console.error(err)
    }
}