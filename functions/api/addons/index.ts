/**
 * /api/addons
 *   GET  → list saved addons in the user's library
 *   POST → add a new saved addon to the library
 */

import { error, json, methodNotAllowed, serverError } from '../_lib/response'
import { serializeSavedAddon } from '../_lib/serializers'
import { newId } from '../_lib/id'
import type { Env, RequestData, SavedAddonRow } from '../_lib/types'

interface SavedAddonInput {
  name?: unknown
  installUrl?: unknown
  manifest?: unknown
  tags?: unknown
  debridConfig?: unknown
  sourceType?: unknown
  sourceAccountId?: unknown
  health?: unknown
  lastUsed?: unknown
}

export const onRequest: PagesFunction<Env, never, RequestData> = async (context) => {
  const { request, env, data } = context

  if (request.method === 'GET') {
    const result = await env.DB.prepare(
      `SELECT id, user_id, name, install_url, manifest, tags, debrid_config,
              source_type, source_account_id, health, created_at, updated_at, last_used
       FROM saved_addons
       WHERE user_id = ?
       ORDER BY created_at ASC`
    )
      .bind(data.userId)
      .all<SavedAddonRow>()

    return json({ addons: (result.results ?? []).map(serializeSavedAddon) })
  }

  if (request.method === 'POST') {
    let body: SavedAddonInput
    try {
      body = (await request.json()) as SavedAddonInput
    } catch {
      return error('Invalid JSON body')
    }

    if (typeof body.name !== 'string' || !body.name.trim()) return error('Addon name is required')
    if (typeof body.installUrl !== 'string' || !body.installUrl)
      return error('installUrl is required')
    if (!body.manifest || typeof body.manifest !== 'object') return error('manifest is required')

    const id = newId()
    const now = Date.now()

    const row: SavedAddonRow = {
      id,
      user_id: data.userId,
      name: body.name.trim(),
      install_url: body.installUrl,
      manifest: JSON.stringify(body.manifest),
      tags: JSON.stringify(Array.isArray(body.tags) ? body.tags : []),
      debrid_config: body.debridConfig ? JSON.stringify(body.debridConfig) : null,
      source_type: typeof body.sourceType === 'string' ? body.sourceType : 'manual',
      source_account_id: typeof body.sourceAccountId === 'string' ? body.sourceAccountId : null,
      health: body.health ? JSON.stringify(body.health) : null,
      created_at: now,
      updated_at: now,
      last_used: typeof body.lastUsed === 'number' ? body.lastUsed : null,
    }

    try {
      await env.DB.prepare(
        `INSERT INTO saved_addons
           (id, user_id, name, install_url, manifest, tags, debrid_config,
            source_type, source_account_id, health, created_at, updated_at, last_used)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          row.id,
          row.user_id,
          row.name,
          row.install_url,
          row.manifest,
          row.tags,
          row.debrid_config,
          row.source_type,
          row.source_account_id,
          row.health,
          row.created_at,
          row.updated_at,
          row.last_used
        )
        .run()
    } catch (e) {
      console.error('addons POST failed', e)
      return serverError('Failed to create addon')
    }

    return json({ addon: serializeSavedAddon(row) }, { status: 201 })
  }

  return methodNotAllowed(['GET', 'POST'])
}
