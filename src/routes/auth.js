import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {issueToken} from '../controller/auth.controller.js';
import {rateLimiter} from '../middleware/rateLimiter.js';

const router = Router();

router.post('/auth/token', issueToken);

export default router;