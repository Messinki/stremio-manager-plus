/**
 * /api/addons/:id
 *   PUT    → partial update of a saved addon
 *   DELETE → remove from the library
 */

import { error, json, methodNotAllowed, notFound, serverError } from '../_lib/response'
import { serializeSavedAddon } from '../_lib/serializers'
import type { Env, RequestData, SavedAddonRow } from '../_lib/types'

interface SavedAddonUpdate {
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

const SELECT_ADDON = `
  SELECT id, user_id, name, install_url, manifest, tags, debrid_config,
         source_type, source_account_id, health, created_at, updated_at, last_used
  FROM saved_addons
  WHERE id = ? AND user_id = ?
`

export const onRequest: PagesFunction<Env, 'id', RequestData> = async (context) => {
  const { request, env, data, params } = context
  const id = params.id as string

  const existing = await env.DB.prepare(SELECT_ADDON).bind(id, data.userId).first<SavedAddonRow>()
  if (!existing) return notFound('Addon not found')

  if (request.method === 'PUT') {
    let body: SavedAddonUpdate
    try {
      body = (await request.json()) as SavedAddonUpdate
    } catch {
      return error('Invalid JSON body')
    }

    const sets: string[] = []
    const values: (string | number | null)[] = []

    if (typeof body.name === 'string') {
      sets.push('name = ?')
      values.push(body.name.trim())
    }
    if (typeof body.installUrl === 'string') {
      sets.push('install_url = ?')
      values.push(body.installUrl)
    }
    if (
      body.manifest !== undefined &&
      body.manifest !== null &&
      typeof body.manifest === 'object'
    ) {
      sets.push('manifest = ?')
      values.push(JSON.stringify(body.manifest))
    }
    if (body.tags !== undefined) {
      sets.push('tags = ?')
      values.push(JSON.stringify(Array.isArray(body.tags) ? body.tags : []))
    }
    if (body.debridConfig !== undefined) {
      sets.push('debrid_config = ?')
      values.push(body.debridConfig ? JSON.stringify(body.debridConfig) : null)
    }
    if (typeof body.sourceType === 'string') {
      sets.push('source_type = ?')
      values.push(body.sourceType)
    }
    if (body.sourceAccountId !== undefined) {
      sets.push('source_account_id = ?')
      values.push(typeof body.sourceAccountId === 'string' ? body.sourceAccountId : null)
    }
    if (body.health !== undefined) {
      sets.push('health = ?')
      values.push(body.health ? JSON.stringify(body.health) : null)
    }
    if (body.lastUsed !== undefined) {
      sets.push('last_used = ?')
      values.push(typeof body.lastUsed === 'number' ? body.lastUsed : null)
    }

    if (sets.length === 0) return error('No updatable fields provided')

    sets.push('updated_at = ?')
    values.push(Date.now())

    try {
      await env.DB.prepare(
        `UPDATE saved_addons SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`
      )
        .bind(...values, id, data.userId)
        .run()
    } catch (e) {
      console.error('addons PUT failed', e)
      return serverError('Failed to update addon')
    }

    const updated = await env.DB.prepare(SELECT_ADDON).bind(id, data.userId).first<SavedAddonRow>()
    if (!updated) return notFound('Addon not found')
    return json({ addon: serializeSavedAddon(updated) })
  }

  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM saved_addons WHERE id = ? AND user_id = ?')
      .bind(id, data.userId)
      .run()
    return json({ ok: true })
  }

  return methodNotAllowed(['PUT', 'DELETE'])
}
