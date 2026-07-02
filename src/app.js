import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { env } from './config/env.js'
import { logger } from './services/logger.js'
import { connectRedis } from './services/redis.js'
import { requestId } from './middleware/requestId.js'
import { requestLogger } from './middleware/logger.js'
import { errorHandler } from './middleware/errorHandler.js'
import { authenticate } from './middleware/auth.js'
import { rateLimiter } from './middleware/rateLimiter.js'
import healthRouter from './routes/health.js'
import authRouter from './routes/auth.js'
import proxyRouter from './routes/proxy.js'


const __dirname = dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(express.json())

app.use(express.static(join(__dirname, '../public')))


//middleware pipeline
app.use(requestId) 
app.use(requestLogger) 


app.use(healthRouter) 
app.use(authRouter)

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, '../public/index.html'))

})

app.use(authenticate)
app.use(rateLimiter)

//protcted routes
app.use(proxyRouter) 


app.use(errorHandler) 

const start = async() =>{
    await connectRedis()
    app.listen(env.PORT, () =>{
        logger.info('gateway started', {port:env.PORT, env: env.NODE_ENV})
    })
}

start()