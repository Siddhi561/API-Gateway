import winston from 'winston'
import * as Sentry from '@sentry/node'
import { env } from '../config/env.js'

if(env.SENTRY_DSN){
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    sampleRate: 1.0,

  })
}

export const captureException = (err, context = {}) => {
  if (env.SENTRY_DSN) {
    Sentry.withScope((scope) => {
      scope.setExtras(context) // attach requestId, userId etc to every Sentry event
      Sentry.captureException(err)
    })
  }
}


const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const extras = Object.keys(meta).length ? JSON.stringify(meta) : ''
    return `${timestamp} [${level}] ${message} ${extras}`
  })
)

const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json() 
)

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: env.NODE_ENV === 'production' ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console(),
  ],
})