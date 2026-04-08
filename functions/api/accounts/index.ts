/**
 * /api/accounts
 *   GET  → list all accounts owned by the current user
 *   POST → create a new account
 *
 * The frontend sends camelCase models; we map to snake_case columns here.
 * JSON-shaped fields (addons, debridKeys) are stringified before insert.
 */

import { error, json, methodNotAllowed, serverError } from '../_lib/response'
import { serializeAccount } from '../_lib/serializers'
import { newId } from '../_lib/id'
import type { AccountRow, Env, RequestData } from '../_lib/types'

interface AccountInput {
  name?: unknown
  email?: unknown
  authKey?: unknown
  password?: unknown
  debridKeys?: unknown
  addons?: unknown
  lastSync?: unknown
  status?: unknown
}

export const onRequest: PagesFunction<Env, never, RequestData> = async (context) => {
  const { request, env, data } = context

  if (request.method === 'GET') {
    const result = await env.DB.prepare(
      `SELECT id, user_id, name, email, auth_key, password, debrid_keys, addons,
              last_sync, status, created_at, updated_at
       FROM accounts
       WHERE user_id = ?
       ORDER BY created_at ASC`
    )
      .bind(data.userId)
      .all<AccountRow>()

    return json({ accounts: (result.results ?? []).map(serializeAccount) })
  }

  if (request.method === 'POST') {
    let body: AccountInput
    try {
      body = (await request.json()) as AccountInput
    } catch {
      return error('Invalid JSON body')
    }

    if (typeof body.name !== 'string' || !body.name.trim()) return error('Account name is required')
    if (typeof body.authKey !== 'string' || !body.authKey) return error('authKey is required')

    const id = newId()
    const now = Date.now()

    const row: AccountRow = {
      id,
      user_id: data.userId,
      name: body.name.trim(),
      email: typeof body.email === 'string' ? body.email : null,
      auth_key: body.authKey,
      password: typeof body.password === 'string' ? body.password : null,
      debrid_keys: body.debridKeys ? JSON.stringify(body.debridKeys) : null,
      addons: JSON.stringify(Array.isArray(body.addons) ? body.addons : []),
      last_sync: typeof body.lastSync === 'number' ? body.lastSync : null,
      status: typeof body.status === 'string' ? body.status : 'active',
      created_at: now,
      updated_at: now,
    }

    try {
      await env.DB.prepare(
        `INSERT INTO accounts
           (id, user_id, name, email, auth_key, password, debrid_keys, addons,
            last_sync, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          row.id,
          row.user_id,
          row.name,
          row.email,
          row.auth_key,
          row.password,
          row.debrid_keys,
          row.addons,
          row.last_sync,
          row.status,
          row.created_at,
          row.updated_at
        )
        .run()
    } catch (e) {
      console.error('accounts POST failed', e)
      return serverError('Failed to create account')
    }

    return json({ account: serializeAccount(row) }, { status: 201 })
  }

  return methodNotAllowed(['GET', 'POST'])
}
