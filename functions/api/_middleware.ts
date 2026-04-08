/**
 * Session middleware — runs before every /api/* route.
 *
 * Public routes (login/register) pass through. Everything else needs a valid
 * session cookie; the resolved user_id is attached to context.data so route
 * handlers don't need to re-query.
 */

import { getSession, getSessionCookie } from './_lib/session'
import { unauthorized } from './_lib/response'
import type { Env, RequestData } from './_lib/types'

const PUBLIC_PATHS = new Set(['/api/auth/login', '/api/auth/register'])

export const onRequest: PagesFunction<Env, never, RequestData> = async (context) => {
  const url = new URL(context.request.url)

  if (PUBLIC_PATHS.has(url.pathname)) {
    return context.next()
  }

  const token = getSessionCookie(context.request)
  if (!token) return unauthorized()

  const session = await getSession(context.env, token)
  if (!session) return unauthorized()

  context.data.userId = session.user_id
  return context.next()
}
