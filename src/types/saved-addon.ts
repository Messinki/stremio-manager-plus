import { AddonManifest } from './addon'

/**
 * Debrid config format types
 * - plaintext-url: Torrentio-style pipe-delimited params in URL path (e.g., |realdebrid=KEY|)
 * - base64-json: Base64-encoded JSON config in URL path (Comet, Jackettio, Annatar, Debrid Search)
 */
export type DebridFormat = 'plaintext-url' | 'base64-json'

/**
 * Debrid configuration metadata for API key templating.
 * When present, the addon's installUrl is a template with the API key stripped out.
 */
export interface DebridConfig {
  format: DebridFormat
  keyField: string // Field name where the API key was found (e.g., 'realdebrid', 'debridApiKey')
  serviceField?: string // Field name for the debrid service type (e.g., 'debridService')
  serviceType: string // The debrid service (e.g., 'realdebrid', 'alldebrid')
}

/**
 * Saved Addon - A reusable addon configuration
 *
 * Core building block of the addon-forward architecture.
 * Saved addons can be tagged, organized, and applied to accounts individually or in bulk.
 *
 * When debridConfig is present, installUrl is a template URL with the API key
 * replaced by a placeholder token. Use injectDebridApiKey() to produce a working URL.
 */
export interface SavedAddon {
  id: string // UUID
  name: string // User-defined name (e.g., "Torrentio - RD+AD")
  installUrl: string // Template URL (key stripped) or full URL if no debrid config
  manifest: AddonManifest // Cached manifest data
  tags: string[] // User-defined tags for organization
  createdAt: Date
  updatedAt: Date
  lastUsed?: Date

  // Debrid API key templating
  debridConfig?: DebridConfig

  // Tracking
  sourceType: 'manual' | 'cloned-from-account'
  sourceAccountId?: string // If cloned from an account

  // Health monitoring
  health?: {
    isOnline: boolean
    lastChecked: number // timestamp
  }
}

/**
 * Account Addon State - Tracks which saved addons are installed on which accounts
 */
export interface AccountAddonState {
  accountId: string
  installedAddons: InstalledAddon[]
  lastSync: Date
}

export interface InstalledAddon {
  savedAddonId: string | null // Null if manually installed outside library
  addonId: string // The manifest.id from Stremio
  installUrl: string // Current URL on account
  installedAt: Date
  installedVia: 'saved-addon' | 'tag' | 'manual'
  appliedTags?: string[] // Tags that were used to apply this addon
}

/**
 * Merge Strategies for applying saved addons to accounts
 */
export type MergeStrategy = 'replace-matching' | 'add-only'

/**
 * Result of a merge operation
 */
export interface MergeResult {
  added: Array<{
    addonId: string
    name: string
    installUrl: string
  }>
  updated: Array<{
    addonId: string
    oldUrl: string
    newUrl: string
  }>
  skipped: Array<{
    addonId: string
    reason: 'already-exists' | 'protected' | 'fetch-failed'
  }>
  protected: Array<{
    addonId: string
    name: string
  }>
}

/**
 * Result of bulk operations
 */
export interface BulkResult {
  success: number
  failed: number
  errors: Array<{ accountId: string; error: string }>
  details: Array<{ accountId: string; result: MergeResult }>
}

/**
 * Storage keys for LocalForage
 */
export const STORAGE_KEYS = {
  ADDON_LIBRARY: 'stremio-manager:addon-library',
  ACCOUNT_ADDONS: 'stremio-manager:account-addons',
  ACCOUNTS: 'stremio-manager:accounts',
} as const
