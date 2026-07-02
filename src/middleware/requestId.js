import { v4 as uuidv4 } from 'uuid'


export const requestId = (req, res, next) => {
  const id = req.headers['x-request-id'] ?? uuidv4()
  req.id = id
  res.setHeader('x-request-id', id) 
  next()
}