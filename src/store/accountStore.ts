import {
  installAddon as apiInstallAddon,
  removeAddon as apiRemoveAddon,
  getAddons,
  updateAddons,
} from '@/api/addons'
import { loginWithCredentials } from '@/api/auth'
import { accountsApi, savedAddonsApi } from '@/api/backend-client'
import { accountExportSchema } from '@/lib/validation'
import { extractDebridKeysFromAddons, getDebridServiceLabel } from '@/lib/debrid-config'
import { updateLatestVersions as updateLatestVersionsCoordinator } from '@/lib/store-coordinator'
import { toast } from '@/hooks/use-toast'
import { AccountExport, StremioAccount } from '@/types/account'
import { AddonDescriptor } from '@/types/addon'
import { create } from 'zustand'

// Helper function to sanitize addon manifests by converting null to undefined
const sanitizeAddonManifest = (manifest: AddonDescriptor['manifest']) => {
  return {
    ...manifest,
    logo: manifest.logo ?? undefined,
    background: manifest.background ?? undefined,
    idPrefixes: manifest.idPrefixes ?? undefined,
  }
}

const sanitizeAddons = (addons: AddonDescriptor[]) =>
  addons.map((addon) => ({ ...addon, manifest: sanitizeAddonManifest(addon.manifest) }))

interface AccountStore {
  accounts: StremioAccount[]
  loading: boolean
  error: string | null

  // Actions
  initialize: () => Promise<void>
  updateLatestVersions: (versions: Record<string, string>) => void
  addAccountByAuthKey: (authKey: string, name: string) => Promise<void>
  addAccountByCredentials: (email: string, password: string, name: string) => Promise<void>
  removeAccount: (id: string) => Promise<void>
  syncAccount: (id: string) => Promise<void>
  syncAllAccounts: () => Promise<void>
  installAddonToAccount: (accountId: string, addonUrl: string) => Promise<void>
  removeAddonFromAccount: (accountId: string, addonId: string) => Promise<void>
  reorderAddons: (accountId: string, newOrder: AddonDescriptor[]) => Promise<void>
  exportAccounts: (includeCredentials: boolean) => Promise<string>
  importAccounts: (json: string) => Promise<void>
  updateAccount: (
    id: string,
    data: { name: string; authKey?: string; email?: string; password?: string }
  ) => Promise<void>
  setDebridKey: (accountId: string, serviceType: string, apiKey: string) => Promise<void>
  removeDebridKey: (accountId: string, serviceType: string) => Promise<void>
  clearError: () => void
  reset: () => void
}

export const useAccountStore = create<AccountStore>((set, get) => ({
  accounts: [],
  loading: false,
  error: null,

  initialize: async () => {
    try {
      const accounts = await accountsApi.list()
      set({ accounts, error: null })
    } catch (error) {
      console.error('Failed to load accounts from backend:', error)
      set({ error: 'Failed to load accounts' })
    }
  },

  updateLatestVersions: (versions) => {
    updateLatestVersionsCoordinator(versions)
  },

  addAccountByAuthKey: async (authKey, name) => {
    set({ loading: true, error: null })
    try {
      // Validate auth key by fetching addons
      const addons = await getAddons(authKey)
      const normalizedAddons = sanitizeAddons(addons)

      const created = await accountsApi.create({
        name,
        authKey,
        addons: normalizedAddons,
        lastSync: new Date(),
        status: 'active',
      })

      set({ accounts: [...get().accounts, created] })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add account'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  addAccountByCredentials: async (email, password, name) => {
    set({ loading: true, error: null })
    try {
      const response = await loginWithCredentials(email, password)
      const addons = await getAddons(response.authKey)
      const normalizedAddons = sanitizeAddons(addons)

      const created = await accountsApi.create({
        name: name || email,
        email,
        authKey: response.authKey,
        password,
        addons: normalizedAddons,
        lastSync: new Date(),
        status: 'active',
      })

      set({ accounts: [...get().accounts, created] })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add account'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  removeAccount: async (id) => {
    await accountsApi.remove(id)
    const accounts = get().accounts.filter((acc) => acc.id !== id)
    set({ accounts })
  },

  syncAccount: async (id) => {
    set({ loading: true, error: null })
    try {
      const account = get().accounts.find((acc) => acc.id === id)
      if (!account) {
        throw new Error('Account not found')
      }

      const addons = await getAddons(account.authKey)
      const normalizedAddons = sanitizeAddons(addons)

      // Auto-detect debrid keys from addon URLs
      const detectedKeys = extractDebridKeysFromAddons(normalizedAddons)
      let debridKeys = account.debridKeys ? { ...account.debridKeys } : undefined
      const newlyDetected: Array<{ serviceType: string; addonName: string }> = []

      for (const { serviceType, apiKey, addonName } of detectedKeys) {
        if (!debridKeys || !debridKeys[serviceType]) {
          if (!debridKeys) debridKeys = {}
          debridKeys[serviceType] = apiKey
          newlyDetected.push({ serviceType, addonName })
        }
      }

      const updated = await accountsApi.update(id, {
        addons: normalizedAddons,
        debridKeys,
        lastSync: new Date(),
        status: 'active',
      })

      const accounts = get().accounts.map((acc) => (acc.id === id ? updated : acc))
      set({ accounts })

      if (newlyDetected.length > 0) {
        const keyList = newlyDetected
          .map((k) => `${getDebridServiceLabel(k.serviceType)} (from ${k.addonName})`)
          .join(', ')
        toast({
          title: 'Debrid Keys Detected',
          description: `Auto-saved ${newlyDetected.length} debrid key${newlyDetected.length !== 1 ? 's' : ''} for "${account.name}": ${keyList}`,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sync account'
      const account = get().accounts.find((acc) => acc.id === id)

      // Mark account as error (best-effort: persist via API too)
      try {
        if (account) {
          const updated = await accountsApi.update(id, { status: 'error' })
          const accounts = get().accounts.map((acc) => (acc.id === id ? updated : acc))
          set({ accounts })
        }
      } catch {
        // ignore — local update below still happens
      }

      set((state) => ({
        accounts: state.accounts.map((acc) =>
          acc.id === id ? { ...acc, status: 'error' as const } : acc
        ),
        error: message,
      }))

      toast({
        variant: 'destructive',
        title: 'Sync Failed',
        description: `Unable to sync "${account?.name}". Please check your credentials.`,
      })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  syncAllAccounts: async () => {
    set({ loading: true, error: null })
    const accounts = get().accounts

    for (const account of accounts) {
      try {
        const addons = await getAddons(account.authKey)
        const normalizedAddons = sanitizeAddons(addons)

        // Auto-detect debrid keys from addon URLs
        const detectedKeys = extractDebridKeysFromAddons(normalizedAddons)
        let debridKeys = account.debridKeys ? { ...account.debridKeys } : undefined
        const newlyDetected: Array<{ serviceType: string; addonName: string }> = []

        for (const { serviceType, apiKey, addonName } of detectedKeys) {
          if (!debridKeys || !debridKeys[serviceType]) {
            if (!debridKeys) debridKeys = {}
            debridKeys[serviceType] = apiKey
            newlyDetected.push({ serviceType, addonName })
          }
        }

        const updated = await accountsApi.update(account.id, {
          addons: normalizedAddons,
          debridKeys,
          lastSync: new Date(),
          status: 'active',
        })

        set({
          accounts: get().accounts.map((acc) => (acc.id === account.id ? updated : acc)),
        })

        if (newlyDetected.length > 0) {
          const keyList = newlyDetected
            .map((k) => `${getDebridServiceLabel(k.serviceType)} (from ${k.addonName})`)
            .join(', ')
          toast({
            title: 'Debrid Keys Detected',
            description: `Auto-saved ${newlyDetected.length} debrid key${newlyDetected.length !== 1 ? 's' : ''} for "${account.name}": ${keyList}`,
          })
        }
      } catch (error) {
        try {
          const updated = await accountsApi.update(account.id, { status: 'error' })
          set({
            accounts: get().accounts.map((acc) => (acc.id === account.id ? updated : acc)),
          })
        } catch {
          set({
            accounts: get().accounts.map((acc) =>
              acc.id === account.id ? { ...acc, status: 'error' as const } : acc
            ),
          })
        }

        toast({
          variant: 'destructive',
          title: 'Sync Failed',
          description: `Unable to sync "${account.name}". Please check your credentials.`,
        })
      }
    }

    set({ loading: false })
  },

  installAddonToAccount: async (accountId, addonUrl) => {
    set({ loading: true, error: null })
    try {
      const account = get().accounts.find((acc) => acc.id === accountId)
      if (!account) {
        throw new Error('Account not found')
      }

      const updatedAddons = await apiInstallAddon(account.authKey, addonUrl)
      const normalizedAddons = sanitizeAddons(updatedAddons)

      const updated = await accountsApi.update(accountId, {
        addons: normalizedAddons,
        lastSync: new Date(),
      })

      set({
        accounts: get().accounts.map((acc) => (acc.id === accountId ? updated : acc)),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to install addon'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  removeAddonFromAccount: async (accountId, addonId) => {
    set({ loading: true, error: null })
    try {
      const account = get().accounts.find((acc) => acc.id === accountId)
      if (!account) {
        throw new Error('Account not found')
      }

      const updatedAddons = await apiRemoveAddon(account.authKey, addonId)
      const normalizedAddons = sanitizeAddons(updatedAddons)

      const updated = await accountsApi.update(accountId, {
        addons: normalizedAddons,
        lastSync: new Date(),
      })

      set({
        accounts: get().accounts.map((acc) => (acc.id === accountId ? updated : acc)),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove addon'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  reorderAddons: async (accountId, newOrder) => {
    set({ loading: true, error: null })
    try {
      const account = get().accounts.find((acc) => acc.id === accountId)
      if (!account) {
        throw new Error('Account not found')
      }

      await updateAddons(account.authKey, newOrder)

      const updated = await accountsApi.update(accountId, {
        addons: newOrder,
        lastSync: new Date(),
      })

      set({
        accounts: get().accounts.map((acc) => (acc.id === accountId ? updated : acc)),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reorder addons'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  exportAccounts: async (includeCredentials) => {
    // Pull the saved-addon library from the backend so the export bundles both
    // accounts and the user's library — matches the previous local-only behavior.
    let savedAddonsExport: AccountExport['savedAddons'] = undefined
    try {
      const library = await savedAddonsApi.list()
      if (library.length > 0) {
        savedAddonsExport = library.map((addon) => ({
          ...addon,
          manifest: sanitizeAddonManifest(addon.manifest),
          createdAt: addon.createdAt.toISOString(),
          updatedAt: addon.updatedAt.toISOString(),
          lastUsed: addon.lastUsed?.toISOString(),
        }))
      }
    } catch (error) {
      console.error('Failed to load addon library during export:', error)
    }

    const data: AccountExport = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      accounts: get().accounts.map((acc) => ({
        name: acc.name,
        email: acc.email,
        authKey: includeCredentials ? acc.authKey : undefined,
        password: includeCredentials ? acc.password : undefined,
        addons: sanitizeAddons(acc.addons),
      })),
      savedAddons: savedAddonsExport,
    }

    return JSON.stringify(data, null, 2)
  },

  importAccounts: async (json) => {
    set({ loading: true, error: null })
    try {
      const data = JSON.parse(json)
      const validated = accountExportSchema.parse(data)

      // Create each account on the backend, collect what came back so the
      // store has the canonical (with id, timestamps) row.
      const created: StremioAccount[] = []
      for (const acc of validated.accounts) {
        const newAccount = await accountsApi.create({
          name: acc.name,
          email: acc.email,
          authKey: acc.authKey ?? '',
          password: acc.password,
          addons: sanitizeAddons(acc.addons),
          lastSync: new Date(),
          status: 'active',
        })
        created.push(newAccount)
      }

      set({ accounts: [...get().accounts, ...created] })

      // Import saved addons if present (also via the backend).
      if (validated.savedAddons && validated.savedAddons.length > 0) {
        try {
          for (const savedAddon of validated.savedAddons) {
            await savedAddonsApi.create({
              name: savedAddon.name,
              installUrl: savedAddon.installUrl,
              manifest: sanitizeAddonManifest(savedAddon.manifest),
              tags: savedAddon.tags,
              debridConfig: savedAddon.debridConfig,
              sourceType: savedAddon.sourceType,
              sourceAccountId: savedAddon.sourceAccountId,
              health: savedAddon.health,
              lastUsed: savedAddon.lastUsed ? new Date(savedAddon.lastUsed) : undefined,
            })
          }
        } catch (error) {
          console.error('Failed to import saved addons:', error)
          toast({
            variant: 'destructive',
            title: 'Warning',
            description: 'Accounts imported successfully, but saved addons failed to import.',
          })
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import accounts'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  updateAccount: async (id, data) => {
    set({ loading: true, error: null })
    try {
      const account = get().accounts.find((acc) => acc.id === id)
      if (!account) {
        throw new Error('Account not found')
      }

      const writePayload: Parameters<typeof accountsApi.update>[1] = { name: data.name }

      // If credentials changed, re-validate
      if (data.authKey || (data.email && data.password)) {
        let authKey = ''

        if (data.authKey) {
          authKey = data.authKey
          writePayload.authKey = authKey
        } else if (data.email && data.password) {
          const response = await loginWithCredentials(data.email, data.password)
          authKey = response.authKey
          writePayload.email = data.email
          writePayload.password = data.password
          writePayload.authKey = authKey
        }

        const addons = await getAddons(authKey)
        writePayload.addons = sanitizeAddons(addons)
        writePayload.status = 'active'
        writePayload.lastSync = new Date()
      }

      const updated = await accountsApi.update(id, writePayload)

      set({
        accounts: get().accounts.map((acc) => (acc.id === id ? updated : acc)),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update account'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  setDebridKey: async (accountId, serviceType, apiKey) => {
    const account = get().accounts.find((acc) => acc.id === accountId)
    if (!account) throw new Error('Account not found')

    const debridKeys = { ...account.debridKeys, [serviceType]: apiKey }
    const updated = await accountsApi.update(accountId, { debridKeys })

    set({
      accounts: get().accounts.map((acc) => (acc.id === accountId ? updated : acc)),
    })
  },

  removeDebridKey: async (accountId, serviceType) => {
    const account = get().accounts.find((acc) => acc.id === accountId)
    if (!account) throw new Error('Account not found')

    const debridKeys = { ...account.debridKeys }
    delete debridKeys[serviceType]
    const nextDebridKeys = Object.keys(debridKeys).length > 0 ? debridKeys : null

    const updated = await accountsApi.update(accountId, { debridKeys: nextDebridKeys })

    set({
      accounts: get().accounts.map((acc) => (acc.id === accountId ? updated : acc)),
    })
  },

  clearError: () => {
    set({ error: null })
  },

  reset: () => {
    set({ accounts: [], loading: false, error: null })
  },
}))
