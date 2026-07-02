import jwt from 'jsonwebtoken'
import {env} from '../config/env.js'
import { UnauthorizedError } from './error.js'

export const signToken = (payload) =>{
    return jwt.sign(payload, env.JWT_SECRET, {expiresIn:'1h'})
}

export const verifyToken = (token) =>{
    try {
        return jwt.verify(token, env.JWT_SECRET)
    } catch (error) {
        throw new UnauthorizedError('Invalid or expired token')
    }
}