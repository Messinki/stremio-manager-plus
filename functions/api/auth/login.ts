/**
 * POST /api/auth/login
 *
 * Body: { email, password }
 * Verifies credentials, opens a session, sets HttpOnly cookie, returns { user }.
 */

import { verifyPassword } from '../_lib/password'
import { buildSessionCookie, createSession } from '../_lib/session'
import { error, json, methodNotAllowed, unauthorized } from '../_lib/response'
import type { Env, UserRow } from '../_lib/types'

interface LoginBody {
  email?: unknown
  password?: unknown
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== 'POST') return methodNotAllowed(['POST'])

  let body: LoginBody
  try {
    body = (await context.request.json()) as LoginBody
  } catch {
    return error('Invalid JSON body')
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!email || !password) return error('Email and password are required')

  const user = await context.env.DB.prepare(
    'SELECT id, email, password_hash, password_salt, created_at FROM users WHERE email = ?'
  )
    .bind(email)
    .first<UserRow>()

  if (!user) return unauthorized('Invalid email or password')

  const ok = await verifyPassword(password, user.password_hash, user.password_salt)
  if (!ok) return unauthorized('Invalid email or password')

  const token = await createSession(context.env, user.id)

  return json(
    { user: { id: user.id, email: user.email } },
    { headers: { 'Set-Cookie': buildSessionCookie(token) } }
  )
}
