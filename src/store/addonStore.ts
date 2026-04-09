import {
  getAddons,
  reinstallAddon as reinstallAddonApi,
  updateAddons,
  fetchAddonManifest,
} from '@/api/addons'
import { addonStatesApi, savedAddonsApi } from '@/api/backend-client'
import { checkAllAddonsHealth } from '@/lib/addon-health'
import { mergeAddons, removeAddons } from '@/lib/addon-merger'
import { findSavedAddonByUrl } from '@/lib/addon-url'
import { normalizeTagName } from '@/lib/addon-validator'
import { stripDebridApiKey, injectDebridApiKey, DEBRID_KEY_PLACEHOLDER } from '@/lib/debrid-config'
import { AddonManifest } from '@/types/addon'
import {
  AccountAddonState,
  BulkResult,
  InstalledAddon,
  MergeResult,
  MergeStrategy,
  SavedAddon,
} from '@/types/saved-addon'
import { create } from 'zustand'

/**
 * Inject account-scoped debrid API keys into addon install URLs.
 * Both `savedAddons` and `debridKeys` are now plain text (no decryption step
 * since the backend stores them in plain D1 columns).
 */
function resolveAddonsWithKeys(
  savedAddons: SavedAddon[],
  debridKeys: Record<string, string>
): SavedAddon[] {
  return savedAddons.map((addon) => {
    if (!addon.debridConfig) return addon

    const apiKey = debridKeys[addon.debridConfig.serviceType]
    if (!apiKey) return addon

    return {
      ...addon,
      installUrl: injectDebridApiKey(addon.installUrl, addon.debridConfig, apiKey),
    }
  })
}

interface AddonStore {
  // State
  library: Record<string, SavedAddon>
  latestVersions: Record<string, string>
  accountStates: Record<string, AccountAddonState>
  loading: boolean
  error: string | null
  checkingHealth: boolean

  // Initialization
  initialize: () => Promise<void>

  // === Update Management ===
  updateLatestVersions: (versions: Record<string, string>) => void
  getLatestVersion: (manifestId: string) => string | undefined

  // === Saved Addon Management ===
  createSavedAddon: (
    name: string,
    installUrl: string,
    tags?: string[],
    existingManifest?: AddonManifest
  ) => Promise<string>
  updateSavedAddon: (
    id: string,
    updates: Partial<Pick<SavedAddon, 'name' | 'tags' | 'installUrl'>>
  ) => Promise<void>
  updateSavedAddonManifest: (id: string) => Promise<void>
  deleteSavedAddon: (id: string) => Promise<void>
  getSavedAddon: (id: string) => SavedAddon | null

  // === Tag Management ===
  getSavedAddonsByTag: (tag: string) => SavedAddon[]
  getAllTags: () => string[]
  renameTag: (oldTag: string, newTag: string) => Promise<void>

  // === Application (Single Saved Addon) ===
  applySavedAddonToAccount: (
    savedAddonId: string,
    accountId: string,
    accountAuthKey: string,
    strategy?: MergeStrategy,
    debridKeys?: Record<string, string>
  ) => Promise<MergeResult>
  applySavedAddonToAccounts: (
    savedAddonId: string,
    accountIds: Array<{ id: string; authKey: string; debridKeys?: Record<string, string> }>,
    strategy?: MergeStrategy
  ) => Promise<BulkResult>

  // === Application (Tag-based) ===
  applyTagToAccount: (
    tag: string,
    accountId: string,
    accountAuthKey: string,
    strategy?: MergeStrategy,
    debridKeys?: Record<string, string>
  ) => Promise<MergeResult>
  applyTagToAccounts: (
    tag: string,
    accountIds: Array<{ id: string; authKey: string; debridKeys?: Record<string, string> }>,
    strategy?: MergeStrategy
  ) => Promise<BulkResult>

  // === Bulk Operations (Account-First Workflow) ===
  bulkApplySavedAddons: (
    savedAddonIds: string[],
    accountIds: Array<{ id: string; authKey: string; debridKeys?: Record<string, string> }>,
    strategy?: MergeStrategy
  ) => Promise<BulkResult>
  bulkApplyTag: (
    tag: string,
    accountIds: Array<{ id: string; authKey: string; debridKeys?: Record<string, string> }>,
    strategy?: MergeStrategy
  ) => Promise<BulkResult>
  bulkRemoveAddons: (
    addonIds: string[],
    accountIds: Array<{ id: string; authKey: string }>
  ) => Promise<BulkResult>
  bulkRemoveByTag: (
    tag: string,
    accountIds: Array<{ id: string; authKey: string }>
  ) => Promise<BulkResult>
  bulkReinstallAddons: (
    addonIds: string[],
    accountIds: Array<{ id: string; authKey: string }>
  ) => Promise<BulkResult>

  // === Sync ===
  syncAccountState: (accountId: string, accountAuthKey: string) => Promise<void>
  syncAllAccountStates: (accounts: Array<{ id: string; authKey: string }>) => Promise<void>

  // === Import/Export ===
  exportLibrary: () => string
  importLibrary: (json: string, merge: boolean) => Promise<void>

  // === Health Checking ===
  checkAllHealth: () => Promise<void>

  // Utility
  clearError: () => void
  reset: () => void
}

const libraryToRecord = (addons: SavedAddon[]): Record<string, SavedAddon> => {
  const record: Record<string, SavedAddon> = {}
  for (const addon of addons) {
    record[addon.id] = addon
  }
  return record
}

const statesToRecord = (states: AccountAddonState[]): Record<string, AccountAddonState> => {
  const record: Record<string, AccountAddonState> = {}
  for (const state of states) {
    record[state.accountId] = state
  }
  return record
}

export const useAddonStore = create<AddonStore>((set, get) => ({
  library: {},
  latestVersions: {},
  accountStates: {},
  loading: false,
  error: null,
  checkingHealth: false,

  initialize: async () => {
    try {
      const [libraryList, statesList] = await Promise.all([
        savedAddonsApi.list(),
        addonStatesApi.list(),
      ])

      set({
        library: libraryToRecord(libraryList),
        accountStates: statesToRecord(statesList),
        // latestVersions is an in-memory cache only — no longer persisted.
        latestVersions: {},
      })
    } catch (error) {
      console.error('Failed to initialize addon store:', error)
      set({ error: 'Failed to load addon data' })
    }
  },

  updateLatestVersions: (versions) => {
    set({ latestVersions: { ...get().latestVersions, ...versions } })
  },

  getLatestVersion: (manifestId) => {
    return get().latestVersions[manifestId]
  },

  // === Saved Addon Management ===

  createSavedAddon: async (name, installUrl, tags = [], existingManifest) => {
    set({ loading: true, error: null })
    try {
      let manifest = existingManifest

      if (!manifest) {
        const addonDescriptor = await fetchAddonManifest(installUrl)
        manifest = addonDescriptor.manifest
      }

      const normalizedTags = tags.map(normalizeTagName).filter(Boolean)
      const addonName = name.trim() || manifest.name

      // Detect and strip debrid API key from the URL
      const stripResult = stripDebridApiKey(installUrl)

      const created = await savedAddonsApi.create({
        name: addonName,
        installUrl: stripResult ? stripResult.templateUrl : installUrl,
        manifest,
        tags: normalizedTags,
        sourceType: 'manual',
        debridConfig: stripResult?.debridConfig,
      })

      set({ library: { ...get().library, [created.id]: created } })
      return created.id
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create saved addon'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  updateSavedAddon: async (id, updates) => {
    set({ loading: true, error: null })
    try {
      const savedAddon = get().library[id]
      if (!savedAddon) {
        throw new Error('Saved addon not found')
      }

      const payload: Parameters<typeof savedAddonsApi.update>[1] = {}
      if (updates.name !== undefined) payload.name = updates.name.trim()
      if (updates.tags !== undefined) {
        payload.tags = updates.tags.map(normalizeTagName).filter(Boolean)
      }
      if (updates.installUrl !== undefined) payload.installUrl = updates.installUrl

      const updated = await savedAddonsApi.update(id, payload)
      set({ library: { ...get().library, [id]: updated } })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update saved addon'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  updateSavedAddonManifest: async (id) => {
    const savedAddon = get().library[id]
    if (!savedAddon) {
      throw new Error('Saved addon not found')
    }

    const previousVersion = savedAddon.manifest.version

    // Fetch fresh manifest from the install URL
    const addonDescriptor = await fetchAddonManifest(savedAddon.installUrl)
    const freshManifest = addonDescriptor.manifest

    // Verify manifest ID matches (prevent replacing with wrong addon)
    if (freshManifest.id !== savedAddon.manifest.id) {
      throw new Error('Addon ID mismatch - this may be a different addon')
    }

    const updated = await savedAddonsApi.update(id, { manifest: freshManifest })
    set({ library: { ...get().library, [id]: updated } })

    // Clear the update badge for this manifest id.
    set({
      latestVersions: { ...get().latestVersions, [freshManifest.id]: freshManifest.version },
    })

    console.log(
      `Updated saved addon "${savedAddon.name}" from v${previousVersion} to v${freshManifest.version}`
    )
  },

  deleteSavedAddon: async (id) => {
    await savedAddonsApi.remove(id)
    const library = { ...get().library }
    delete library[id]
    set({ library })
  },

  getSavedAddon: (id) => {
    return get().library[id] || null
  },

  // === Tag Management ===

  getSavedAddonsByTag: (tag) => {
    const normalizedTag = normalizeTagName(tag)
    return Object.values(get().library).filter((savedAddon) =>
      savedAddon.tags.some((t) => normalizeTagName(t) === normalizedTag)
    )
  },

  getAllTags: () => {
    const tagsSet = new Set<string>()
    Object.values(get().library).forEach((savedAddon) => {
      savedAddon.tags.forEach((tag) => tagsSet.add(tag))
    })
    return Array.from(tagsSet).sort()
  },

  renameTag: async (oldTag, newTag) => {
    const normalizedOld = normalizeTagName(oldTag)
    const normalizedNew = normalizeTagName(newTag)

    if (!normalizedNew) {
      throw new Error('Invalid new tag name')
    }

    const updatedLibrary = { ...get().library }

    for (const savedAddon of Object.values(get().library)) {
      const tagIndex = savedAddon.tags.findIndex((t) => normalizeTagName(t) === normalizedOld)
      if (tagIndex < 0) continue

      const newTags = [...savedAddon.tags]
      newTags[tagIndex] = normalizedNew

      const updated = await savedAddonsApi.update(savedAddon.id, { tags: newTags })
      updatedLibrary[savedAddon.id] = updated
    }

    set({ library: updatedLibrary })
  },

  // === Application (Single Saved Addon) ===

  applySavedAddonToAccount: async (
    savedAddonId,
    accountId,
    accountAuthKey,
    strategy = 'replace-matching',
    debridKeys
  ) => {
    set({ loading: true, error: null })
    try {
      const savedAddon = get().library[savedAddonId]
      if (!savedAddon) {
        throw new Error('Saved addon not found')
      }

      // Get current addons from account
      const currentAddons = await getAddons(accountAuthKey)

      // Inject account debrid keys into addon templates
      let resolvedAddons = [savedAddon]
      if (debridKeys) {
        resolvedAddons = resolveAddonsWithKeys([savedAddon], debridKeys)
      }

      // Safety: block if debrid placeholder is still present
      if (resolvedAddons[0].installUrl.includes(DEBRID_KEY_PLACEHOLDER)) {
        throw new Error(
          `Cannot install "${savedAddon.name}": this addon requires a ${savedAddon.debridConfig?.serviceType || 'debrid'} key not configured on this account`
        )
      }

      const { addons: updatedAddons, result } = await mergeAddons(
        currentAddons,
        resolvedAddons,
        strategy
      )

      await updateAddons(accountAuthKey, updatedAddons)

      // Update saved addon lastUsed
      const updated = await savedAddonsApi.update(savedAddonId, { lastUsed: new Date() })
      set({ library: { ...get().library, [savedAddonId]: updated } })

      // Sync account state
      await get().syncAccountState(accountId, accountAuthKey)

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to apply saved addon'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  applySavedAddonToAccounts: async (savedAddonId, accountIds, strategy = 'replace-matching') => {
    const savedAddon = get().library[savedAddonId]
    if (!savedAddon) {
      throw new Error('Saved addon not found')
    }

    return get().bulkApplySavedAddons([savedAddonId], accountIds, strategy)
  },

  // === Application (Tag-based) ===

  applyTagToAccount: async (
    tag,
    accountId,
    accountAuthKey,
    strategy = 'replace-matching',
    debridKeys
  ) => {
    const savedAddons = get().getSavedAddonsByTag(tag)
    if (savedAddons.length === 0) {
      throw new Error(`No saved addons found with tag: ${tag}`)
    }

    set({ loading: true, error: null })
    try {
      const currentAddons = await getAddons(accountAuthKey)

      let resolvedAddons = savedAddons
      if (debridKeys) {
        resolvedAddons = resolveAddonsWithKeys(savedAddons, debridKeys)
      }

      // Filter out addons that still have a debrid placeholder
      // (account is missing the required debrid key).
      const safeAddons = resolvedAddons.filter((addon) => {
        if (addon.installUrl.includes(DEBRID_KEY_PLACEHOLDER)) {
          console.warn(
            `Skipping addon "${addon.name}": debrid key not available for ${addon.debridConfig?.serviceType}`
          )
          return false
        }
        return true
      })

      const { addons: updatedAddons, result } = await mergeAddons(
        currentAddons,
        safeAddons,
        strategy
      )

      await updateAddons(accountAuthKey, updatedAddons)

      // Bump lastUsed for every applied saved addon (one PUT each).
      const nextLibrary = { ...get().library }
      for (const savedAddon of savedAddons) {
        const updated = await savedAddonsApi.update(savedAddon.id, { lastUsed: new Date() })
        nextLibrary[savedAddon.id] = updated
      }
      set({ library: nextLibrary })

      // Sync account state
      await get().syncAccountState(accountId, accountAuthKey)

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to apply tag'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  applyTagToAccounts: async (tag, accountIds, strategy = 'replace-matching') => {
    return get().bulkApplyTag(tag, accountIds, strategy)
  },

  // === Bulk Operations ===

  bulkApplySavedAddons: async (savedAddonIds, accountIds, strategy = 'replace-matching') => {
    set({ loading: true, error: null })
    try {
      const savedAddons = savedAddonIds
        .map((id) => get().library[id])
        .filter(Boolean) as SavedAddon[]

      if (savedAddons.length === 0) {
        throw new Error('No valid saved addons found')
      }

      const result: BulkResult = {
        success: 0,
        failed: 0,
        errors: [],
        details: [],
      }

      for (const { id: accountId, authKey: accountAuthKey, debridKeys } of accountIds) {
        try {
          const currentAddons = await getAddons(accountAuthKey)

          let resolvedAddons = savedAddons
          if (debridKeys) {
            resolvedAddons = resolveAddonsWithKeys(savedAddons, debridKeys)
          }

          const safeAddons = resolvedAddons.filter((addon) => {
            if (addon.installUrl.includes(DEBRID_KEY_PLACEHOLDER)) {
              console.warn(
                `Skipping addon "${addon.name}" for account ${accountId}: debrid key not available for ${addon.debridConfig?.serviceType}`
              )
              return false
            }
            return true
          })

          if (safeAddons.length === 0 && resolvedAddons.length > 0) {
            throw new Error(
              'All selected addons require debrid keys not configured on this account'
            )
          }

          const { addons: updatedAddons, result: mergeResult } = await mergeAddons(
            currentAddons,
            safeAddons,
            strategy
          )

          await updateAddons(accountAuthKey, updatedAddons)

          result.success++
          result.details.push({ accountId, result: mergeResult })

          // Sync account state
          await get().syncAccountState(accountId, accountAuthKey)
        } catch (error) {
          result.failed++
          result.errors.push({
            accountId,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      // Bump lastUsed for every applied saved addon.
      const nextLibrary = { ...get().library }
      for (const savedAddon of savedAddons) {
        try {
          const updated = await savedAddonsApi.update(savedAddon.id, { lastUsed: new Date() })
          nextLibrary[savedAddon.id] = updated
        } catch (e) {
          console.warn(`Failed to bump lastUsed for ${savedAddon.id}`, e)
        }
      }
      set({ library: nextLibrary })

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to apply saved addons'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  bulkApplyTag: async (tag, accountIds, strategy = 'replace-matching') => {
    const savedAddons = get().getSavedAddonsByTag(tag)
    if (savedAddons.length === 0) {
      throw new Error(`No saved addons found with tag: ${tag}`)
    }

    return get().bulkApplySavedAddons(
      savedAddons.map((s) => s.id),
      accountIds,
      strategy
    )
  },

  bulkRemoveAddons: async (addonIds, accountIds) => {
    set({ loading: true, error: null })
    try {
      const result: BulkResult = {
        success: 0,
        failed: 0,
        errors: [],
        details: [],
      }

      for (const { id: accountId, authKey: accountAuthKey } of accountIds) {
        try {
          const currentAddons = await getAddons(accountAuthKey)

          const { addons: updatedAddons, protectedAddons } = removeAddons(currentAddons, addonIds)

          await updateAddons(accountAuthKey, updatedAddons)

          result.success++
          result.details.push({
            accountId,
            result: {
              added: [],
              updated: [],
              skipped: [],
              protected: protectedAddons.map((id) => ({
                addonId: id,
                name: currentAddons.find((a) => a.manifest.id === id)?.manifest.name || id,
              })),
            },
          })

          // Sync account state
          await get().syncAccountState(accountId, accountAuthKey)
        } catch (error) {
          result.failed++
          result.errors.push({
            accountId,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove addons'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  bulkRemoveByTag: async (tag, accountIds) => {
    const savedAddons = get().getSavedAddonsByTag(tag)
    if (savedAddons.length === 0) {
      throw new Error(`No saved addons found with tag: ${tag}`)
    }

    const addonIds = savedAddons.map((s) => s.manifest.id)
    return get().bulkRemoveAddons(addonIds, accountIds)
  },

  bulkReinstallAddons: async (addonIds, accountIds) => {
    set({ loading: true, error: null })
    try {
      const result: BulkResult = {
        success: 0,
        failed: 0,
        errors: [],
        details: [],
      }

      for (const { id: accountId, authKey: accountAuthKey } of accountIds) {
        try {
          // Reinstall each addon in place to preserve ordering
          const updateResults: Array<{
            addonId: string
            previousVersion?: string
            newVersion?: string
          }> = []

          for (const addonId of addonIds) {
            try {
              const reinstallResult = await reinstallAddonApi(accountAuthKey, addonId)
              if (reinstallResult.updatedAddon) {
                updateResults.push({
                  addonId,
                  previousVersion: reinstallResult.previousVersion,
                  newVersion: reinstallResult.newVersion,
                })
              }
            } catch (error) {
              console.warn(`Failed to reinstall addon ${addonId} on account ${accountId}:`, error)
            }
          }

          result.success++
          result.details.push({
            accountId,
            result: {
              added: [],
              updated: updateResults.map((r) => ({
                addonId: r.addonId,
                oldUrl: '',
                newUrl: '',
                previousVersion: r.previousVersion,
                newVersion: r.newVersion,
              })),
              skipped: [],
              protected: [],
            },
          })

          // Sync account state
          await get().syncAccountState(accountId, accountAuthKey)
        } catch (error) {
          result.failed++
          result.errors.push({
            accountId,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reinstall addons'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  // === Sync ===

  syncAccountState: async (accountId, accountAuthKey) => {
    try {
      const currentAddons = await getAddons(accountAuthKey)

      const existingState = get().accountStates[accountId]
      const installedAddons: InstalledAddon[] = []

      for (const addon of currentAddons) {
        const existing = existingState?.installedAddons.find((a) => a.addonId === addon.manifest.id)

        if (existing) {
          installedAddons.push({
            ...existing,
            installUrl: addon.transportUrl,
          })
        } else {
          // New addon - try to auto-link to a saved addon by URL
          const matchingSavedAddon = findSavedAddonByUrl(get().library, addon.transportUrl)

          installedAddons.push({
            savedAddonId: matchingSavedAddon?.id || null,
            addonId: addon.manifest.id,
            installUrl: addon.transportUrl,
            installedAt: new Date(),
            installedVia: matchingSavedAddon ? 'saved-addon' : 'manual',
            appliedTags: matchingSavedAddon?.tags,
          })
        }
      }

      const persisted = await addonStatesApi.upsert({
        accountId,
        installedAddons,
        lastSync: new Date(),
      })

      set({
        accountStates: { ...get().accountStates, [accountId]: persisted },
      })
    } catch (error) {
      console.error('Failed to sync account state:', error)
      throw error
    }
  },

  syncAllAccountStates: async (accounts) => {
    for (const account of accounts) {
      try {
        await get().syncAccountState(account.id, account.authKey)
      } catch (error) {
        console.error(`Failed to sync account ${account.id}:`, error)
      }
    }
  },

  // === Import/Export ===

  exportLibrary: () => {
    const library = get().library
    return JSON.stringify(
      {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        savedAddons: Object.values(library),
      },
      null,
      2
    )
  },

  importLibrary: async (json, merge) => {
    set({ loading: true, error: null })
    try {
      const data = JSON.parse(json)

      // Support both old 'templates' and new 'savedAddons' format
      const savedAddons = data.savedAddons || data.templates

      if (!savedAddons || !Array.isArray(savedAddons)) {
        throw new Error('Invalid export format')
      }

      // If not merging, wipe the existing library on the backend first.
      if (!merge) {
        const existing = Object.values(get().library)
        for (const addon of existing) {
          try {
            await savedAddonsApi.remove(addon.id)
          } catch (e) {
            console.warn(`Failed to delete existing saved addon ${addon.id}`, e)
          }
        }
        set({ library: {} })
      }

      const nextLibrary: Record<string, SavedAddon> = merge ? { ...get().library } : {}

      for (const savedAddon of savedAddons) {
        const created = await savedAddonsApi.create({
          name: savedAddon.name,
          installUrl: savedAddon.installUrl,
          manifest: savedAddon.manifest,
          tags: savedAddon.tags ?? [],
          debridConfig: savedAddon.debridConfig,
          sourceType: savedAddon.sourceType ?? 'manual',
          sourceAccountId: savedAddon.sourceAccountId,
          health: savedAddon.health,
          lastUsed: savedAddon.lastUsed ? new Date(savedAddon.lastUsed) : undefined,
        })
        nextLibrary[created.id] = created
      }

      set({ library: nextLibrary })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import library'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  // === Health Checking ===

  checkAllHealth: async () => {
    set({ checkingHealth: true })
    try {
      const addons = Object.values(get().library)
      const updatedAddons = await checkAllAddonsHealth(addons)

      // Persist health for each addon individually.
      const nextLibrary = { ...get().library }
      for (const addon of updatedAddons) {
        try {
          const updated = await savedAddonsApi.update(addon.id, { health: addon.health })
          nextLibrary[addon.id] = updated
        } catch (e) {
          console.warn(`Failed to persist health for ${addon.id}`, e)
          nextLibrary[addon.id] = addon
        }
      }

      set({ library: nextLibrary })
    } catch (error) {
      console.error('Failed to check addon health:', error)
    } finally {
      set({ checkingHealth: false })
    }
  },

  clearError: () => set({ error: null }),

  reset: () => {
    set({
      library: {},
      latestVersions: {},
      accountStates: {},
      loading: false,
      error: null,
      checkingHealth: false,
    })
  },
}))
