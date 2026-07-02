import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();


const schema = z.object({
    PORT: z.string().default('3000'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    UPSTREAM_URL: z.string().url(), //the service we're proxying to
    JWT_SECRET: z.string().min(32),
    API_KEY: z.string().min(20),
    UPSTASH_REDIS_REST_URL: z.string().url(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
    RATE_LIMIT_MAX: z.string().default('30'),
    RATE_LIMIT_WINDOW_SECONDS: z.string().default('60'),
    SENTRY_DSN: z.string().url().optional(),
    CB_FAILURE_THRESHOLD: z.string().default('3'),   // failures before tripping
    CB_COOLDOWN_SECONDS: z.string().default('30'),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1)
}

export const env = parsed.data;