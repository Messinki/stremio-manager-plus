/**
 * Shared types for Cloudflare Pages Functions.
 *
 * `Env` is the bindings object configured in wrangler.toml / Pages dashboard.
 * `RequestData` is what middleware attaches to `context.data` so route handlers
 * can read the authenticated user without re-querying.
 */

export interface Env {
  DB: D1Database
}

export interface RequestData extends Record<string, unknown> {
  userId: string
}

/** Row shapes returned by D1 — match the columns in schema.sql exactly. */

export interface UserRow {
  id: string
  email: string
  password_hash: string
  password_salt: string
  created_at: number
}

export interface SessionRow {
  token: string
  user_id: string
  expires_at: number
  created_at: number
}

export interface AccountRow {
  id: string
  user_id: string
  name: string
  email: string | null
  auth_key: string
  password: string | null
  debrid_keys: string | null
  addons: string
  last_sync: number | null
  status: string
  created_at: number
  updated_at: number
}

export interface SavedAddonRow {
  id: string
  user_id: string
  name: string
  install_url: string
  manifest: string
  tags: string
  debrid_config: string | null
  source_type: string
  source_account_id: string | null
  health: string | null
  created_at: number
  updated_at: number
  last_used: number | null
}

export interface AccountAddonStateRow {
  id: string
  user_id: string
  account_id: string
  installed_addons: string
  last_sync: number | null
}
