/**
 * GET /api/auth/me
 *
 * Returns the authenticated user. The frontend calls this on startup to
 * restore the session from the HttpOnly cookie. Middleware has already
 * validated the session by the time we get here.
 */

import { json, methodNotAllowed, notFound } from '../_lib/response'
import type { Env, RequestData, UserRow } from '../_lib/types'

export const onRequest: PagesFunction<Env, never, RequestData> = async (context) => {
  if (context.request.method !== 'GET') return methodNotAllowed(['GET'])

  const user = await context.env.DB.prepare('SELECT id, email FROM users WHERE id = ?')
    .bind(context.data.userId)
    .first<Pick<UserRow, 'id' | 'email'>>()

  if (!user) return notFound('User not found')
  return json({ user })
}
