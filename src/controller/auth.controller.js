import { signToken } from '../utils/jwt.js'

export const issueToken = (req, res) => {
  const { username, role } = req.body

  if (!username) {
    return res.status(400).json({
      error: { message: 'username is required' }
    })
  }

  const token = signToken({
    sub: username,
    role: role ?? 'user',
  })

  res.json({
    token,
    expiresIn: '1h',
    authMethod: 'jwt',
  })
}