/**
 * Row → API shape converters.
 *
 * D1 stores snake_case columns and JSON-as-TEXT. The frontend stores models
 * we want to leave untouched here, so we convert to camelCase + parsed JSON
 * at the API boundary. Keeping this in one file makes it easy to keep all
 * routes consistent.
 */

import type { AccountAddonStateRow, AccountRow, SavedAddonRow } from './types'

function safeParse<T>(text: string | null, fallback: T): T {
  if (text == null) return fallback
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

export function serializeAccount(row: AccountRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? undefined,
    authKey: row.auth_key,
    password: row.password ?? undefined,
    debridKeys: safeParse<Record<string, string> | undefined>(row.debrid_keys, undefined),
    addons: safeParse<unknown[]>(row.addons, []),
    lastSync: row.last_sync,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function serializeSavedAddon(row: SavedAddonRow) {
  return {
    id: row.id,
    name: row.name,
    installUrl: row.install_url,
    manifest: safeParse<Record<string, unknown>>(row.manifest, {}),
    tags: safeParse<string[]>(row.tags, []),
    debridConfig: safeParse<Record<string, unknown> | undefined>(row.debrid_config, undefined),
    sourceType: row.source_type,
    sourceAccountId: row.source_account_id ?? undefined,
    health: safeParse<Record<string, unknown> | undefined>(row.health, undefined),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsed: row.last_used ?? undefined,
  }
}

export function serializeAccountAddonState(row: AccountAddonStateRow) {
  return {
    accountId: row.account_id,
    installedAddons: safeParse<unknown[]>(row.installed_addons, []),
    lastSync: row.last_sync,
  }
}
