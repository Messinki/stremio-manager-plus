import { AddonDescriptor } from './addon'
import { SavedAddon } from './saved-addon'

export type AccountStatus = 'active' | 'error'

export interface StremioAccount {
  id: string
  name: string
  email?: string
  authKey: string // Encrypted
  password?: string // Encrypted (optional)
  debridKeys?: Record<string, string> // Encrypted debrid API keys, keyed by service type (e.g., 'realdebrid')
  addons: AddonDescriptor[]
  lastSync: Date
  status: AccountStatus
}

export interface AccountCredentials {
  email: string
  password: string
}

export interface SavedAddonExport extends Omit<SavedAddon, 'createdAt' | 'updatedAt' | 'lastUsed'> {
  createdAt: string
  updatedAt: string
  lastUsed?: string
}

export interface AccountExport {
  version: string
  exportedAt: string
  accounts: Array<{
    name: string
    email?: string
    authKey?: string // User decides whether to include
    password?: string // User decides whether to include
    addons: AddonDescriptor[]
  }>
  savedAddons?: SavedAddonExport[]
}
