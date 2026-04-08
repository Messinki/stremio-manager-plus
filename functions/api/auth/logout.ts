/**
 * POST /api/auth/logout
 *
 * Deletes the session row and clears the cookie. Idempotent — calling without
 * a session is fine.
 */

import { buildClearSessionCookie, deleteSession, getSessionCookie } from '../_lib/session'
import { json, methodNotAllowed } from '../_lib/response'
import type { Env } from '../_lib/types'

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== 'POST') return methodNotAllowed(['POST'])

  const token = getSessionCookie(context.request)
  if (token) {
    await deleteSession(context.env, token)
  }

  return json({ ok: true }, { headers: { 'Set-Cookie': buildClearSessionCookie() } })
}
