/**
 * /api/addon-states
 *   GET → list all account_addon_states rows for the current user
 *   PUT → upsert a single state row { accountId, installedAddons, lastSync? }
 *
 * One row per account (UNIQUE constraint on account_id), so PUT uses
 * INSERT ... ON CONFLICT to keep the call site simple — frontends just
 * "save the latest state" without caring whether it existed before.
 */

import { error, json, methodNotAllowed, notFound, serverError } from '../_lib/response'
import { serializeAccountAddonState } from '../_lib/serializers'
import { newId } from '../_lib/id'
import type { AccountAddonStateRow, Env, RequestData } from '../_lib/types'

interface AddonStateInput {
  accountId?: unknown
  installedAddons?: unknown
  lastSync?: unknown
}

export const onRequest: PagesFunction<Env, never, RequestData> = async (context) => {
  const { request, env, data } = context

  if (request.method === 'GET') {
    const result = await env.DB.prepare(
      `SELECT id, user_id, account_id, installed_addons, last_sync
       FROM account_addon_states
       WHERE user_id = ?`
    )
      .bind(data.userId)
      .all<AccountAddonStateRow>()

    return json({ states: (result.results ?? []).map(serializeAccountAddonState) })
  }

  if (request.method === 'PUT') {
    let body: AddonStateInput
    try {
      body = (await request.json()) as AddonStateInput
    } catch {
      return error('Invalid JSON body')
    }

    if (typeof body.accountId !== 'string' || !body.accountId) return error('accountId is required')
    if (!Array.isArray(body.installedAddons)) return error('installedAddons must be an array')

    // Make sure the account belongs to this user — otherwise a malicious caller
    // could write state rows referencing someone else's account_id.
    const owns = await env.DB.prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?')
      .bind(body.accountId, data.userId)
      .first<{ id: string }>()
    if (!owns) return notFound('Account not found')

    const installedJson = JSON.stringify(body.installedAddons)
    const lastSync = typeof body.lastSync === 'number' ? body.lastSync : Date.now()
    const id = newId()

    try {
      await env.DB.prepare(
        `INSERT INTO account_addon_states (id, user_id, account_id, installed_addons, last_sync)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET
           installed_addons = excluded.installed_addons,
           last_sync = excluded.last_sync`
      )
        .bind(id, data.userId, body.accountId, installedJson, lastSync)
        .run()
    } catch (e) {
      console.error('addon-states PUT failed', e)
      return serverError('Failed to save addon state')
    }

    const updated = await env.DB.prepare(
      `SELECT id, user_id, account_id, installed_addons, last_sync
       FROM account_addon_states
       WHERE account_id = ? AND user_id = ?`
    )
      .bind(body.accountId, data.userId)
      .first<AccountAddonStateRow>()

    if (!updated) return serverError('Failed to read back addon state')
    return json({ state: serializeAccountAddonState(updated) })
  }

  return methodNotAllowed(['GET', 'PUT'])
}
