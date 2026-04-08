/**
 * POST /api/auth/register
 *
 * Body: { email, password }
 * Creates a new user, opens a session, sets HttpOnly cookie, returns { user }.
 */

import { hashPassword } from '../_lib/password'
import { buildSessionCookie, createSession } from '../_lib/session'
import { error, json, methodNotAllowed } from '../_lib/response'
import { newId } from '../_lib/id'
import type { Env, UserRow } from '../_lib/types'

interface RegisterBody {
  email?: unknown
  password?: unknown
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== 'POST') return methodNotAllowed(['POST'])

  let body: RegisterBody
  try {
    body = (await context.request.json()) as RegisterBody
  } catch {
    return error('Invalid JSON body')
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!email || !email.includes('@')) return error('Valid email is required')
  if (password.length < 8) return error('Password must be at least 8 characters')

  const existing = await context.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first<Pick<UserRow, 'id'>>()
  if (existing) return error('An account with that email already exists', 409)

  const { hash, salt } = await hashPassword(password)
  const id = newId()
  const now = Date.now()

  await context.env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(id, email, hash, salt, now)
    .run()

  const token = await createSession(context.env, id)

  return json(
    { user: { id, email } },
    {
      status: 201,
      headers: { 'Set-Cookie': buildSessionCookie(token) },
    }
  )
}
