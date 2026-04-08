/**
 * /api/accounts/:id
 *   GET    → fetch one account
 *   PUT    → update mutable fields (partial; only provided fields are written)
 *   DELETE → remove
 *
 * Every query is scoped by `user_id` so users cannot touch each other's rows
 * even if they guess an id.
 */

import { error, json, methodNotAllowed, notFound, serverError } from '../_lib/response'
import { serializeAccount } from '../_lib/serializers'
import type { AccountRow, Env, RequestData } from '../_lib/types'

interface AccountUpdate {
  name?: unknown
  email?: unknown
  authKey?: unknown
  password?: unknown
  debridKeys?: unknown
  addons?: unknown
  lastSync?: unknown
  status?: unknown
}

const SELECT_ACCOUNT = `
  SELECT id, user_id, name, email, auth_key, password, debrid_keys, addons,
         last_sync, status, created_at, updated_at
  FROM accounts
  WHERE id = ? AND user_id = ?
`

export const onRequest: PagesFunction<Env, 'id', RequestData> = async (context) => {
  const { request, env, data, params } = context
  const id = params.id as string

  const existing = await env.DB.prepare(SELECT_ACCOUNT).bind(id, data.userId).first<AccountRow>()
  if (!existing) return notFound('Account not found')

  if (request.method === 'GET') {
    return json({ account: serializeAccount(existing) })
  }

  if (request.method === 'PUT') {
    let body: AccountUpdate
    try {
      body = (await request.json()) as AccountUpdate
    } catch {
      return error('Invalid JSON body')
    }

    // Build a partial update — only fields the client sent get touched.
    const sets: string[] = []
    const values: (string | number | null)[] = []

    if (typeof body.name === 'string') {
      sets.push('name = ?')
      values.push(body.name.trim())
    }
    if (body.email !== undefined) {
      sets.push('email = ?')
      values.push(typeof body.email === 'string' ? body.email : null)
    }
    if (typeof body.authKey === 'string') {
      sets.push('auth_key = ?')
      values.push(body.authKey)
    }
    if (body.password !== undefined) {
      sets.push('password = ?')
      values.push(typeof body.password === 'string' ? body.password : null)
    }
    if (body.debridKeys !== undefined) {
      sets.push('debrid_keys = ?')
      values.push(body.debridKeys ? JSON.stringify(body.debridKeys) : null)
    }
    if (body.addons !== undefined) {
      sets.push('addons = ?')
      values.push(JSON.stringify(Array.isArray(body.addons) ? body.addons : []))
    }
    if (body.lastSync !== undefined) {
      sets.push('last_sync = ?')
      values.push(typeof body.lastSync === 'number' ? body.lastSync : null)
    }
    if (typeof body.status === 'string') {
      sets.push('status = ?')
      values.push(body.status)
    }

    if (sets.length === 0) return error('No updatable fields provided')

    const now = Date.now()
    sets.push('updated_at = ?')
    values.push(now)

    try {
      await env.DB.prepare(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`)
        .bind(...values, id, data.userId)
        .run()
    } catch (e) {
      console.error('accounts PUT failed', e)
      return serverError('Failed to update account')
    }

    const updated = await env.DB.prepare(SELECT_ACCOUNT).bind(id, data.userId).first<AccountRow>()
    if (!updated) return notFound('Account not found')
    return json({ account: serializeAccount(updated) })
  }

  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?')
      .bind(id, data.userId)
      .run()
    return json({ ok: true })
  }

  return methodNotAllowed(['GET', 'PUT', 'DELETE'])
}
