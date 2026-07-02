import { Router } from 'express'
import { proxyRequest } from '../controller/proxy.controller.js'

const router = Router()


router.all('/api/*', proxyRequest)

export default router