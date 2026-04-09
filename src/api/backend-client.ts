/**
 * Typed fetch wrapper for the Cloudflare Pages Functions backend.
 *
 * - All requests send credentials so the HttpOnly session cookie rides along.
 * - 401 responses are surfaced as `UnauthorizedError` so callers (e.g. the
 *   auth store) can clear local state and bounce the user back to the auth
 *   page.
 * - JSON encode/decode lives here so route code stays small.
 * - Domain-specific helpers (`accountsApi`, `savedAddonsApi`, `addonStatesApi`)
 *   wrap the raw client and translate the wire shape (numbers for timestamps,
 *   plain JSON) into the frontend's `Date`-bearing models.
 *
 * Routes are relative (`/api/...`); in dev a Vite proxy rewrites them to
 * the wrangler dev server (see `vite.config.ts`). In production they're
 * served by the same Cloudflare Pages project, so no base URL is needed.
 */

import type { AddonDescriptor } from '@/types/addon'
import type { AccountStatus, StremioAccount } from '@/types/account'
import type {
  AccountAddonState,
  DebridConfig,
  InstalledAddon,
  SavedAddon,
} from '@/types/saved-addon'

export class BackendError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'BackendError'
    this.status = status
  }
}

export class UnauthorizedError extends BackendError {
  constructor(message = 'Unauthorized') {
    super(401, message)
    this.name = 'UnauthorizedError'
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface RequestOptions {
  method?: Method
  body?: unknown
  /** When false, a 401 will NOT throw UnauthorizedError — useful for `me()`
   *  on startup, where 401 just means "not logged in yet". */
  throwOn401?: boolean
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, throwOn401 = true } = options

  const init: RequestInit = {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }

  let res: Response
  try {
    res = await fetch(path, init)
  } catch (err) {
    throw new BackendError(0, err instanceof Error ? err.message : 'Network error')
  }

  // 204 No Content (and similar empty bodies) — return undefined cast.
  if (res.status === 204) {
    return undefined as T
  }

  let data: unknown = null
  const contentType = res.headers.get('Content-Type') || ''
  if (contentType.includes('application/json')) {
    try {
      data = await res.json()
    } catch {
      // ignore parse errors; treat as null
    }
  }

  if (!res.ok) {
    const message =
      (data &&
      typeof data === 'object' &&
      'error' in data &&
      typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : null) || `Request failed (${res.status})`

    if (res.status === 401) {
      if (throwOn401) throw new UnauthorizedError(message)
      // fall through and return data so the caller can detect "not logged in"
      return data as T
    }

    throw new BackendError(res.status, message)
  }

  return data as T
}

export const backendClient = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'PUT', body }),
  delete: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'DELETE' }),
}

// ---- Auth-specific helpers ---------------------------------------------------

export interface AuthUser {
  id: string
  email: string
}

interface AuthResponse {
  user: AuthUser
}

export const authApi = {
  /**
   * Restore the session on app startup. Returns null when there is no valid
   * session — does NOT throw on 401.
   */
  me: async (): Promise<AuthUser | null> => {
    const data = await request<AuthResponse | { error: string }>('/api/auth/me', {
      method: 'GET',
      throwOn401: false,
    })
    if (data && typeof data === 'object' && 'user' in data) {
      return (data as AuthResponse).user
    }
    return null
  },

  login: async (email: string, password: string): Promise<AuthUser> => {
    const data = await backendClient.post<AuthResponse>('/api/auth/login', { email, password })
    return data.user
  },

  register: async (email: string, password: string): Promise<AuthUser> => {
    const data = await backendClient.post<AuthResponse>('/api/auth/register', { email, password })
    return data.user
  },

  logout: async (): Promise<void> => {
    await backendClient.post('/api/auth/logout')
  },
}

// ---- Accounts ---------------------------------------------------------------

interface ApiAccount {
  id: string
  name: string
  email?: string
  authKey: string
  password?: string
  debridKeys?: Record<string, string>
  addons: AddonDescriptor[]
  lastSync: number | null
  status: AccountStatus
  createdAt: number
  updatedAt: number
}

export interface AccountWriteInput {
  name?: string
  email?: string | null
  authKey?: string
  password?: string | null
  debridKeys?: Record<string, string> | null
  addons?: AddonDescriptor[]
  lastSync?: Date | number | null
  status?: AccountStatus
}

function deserializeAccount(api: ApiAccount): StremioAccount {
  return {
    id: api.id,
    name: api.name,
    email: api.email,
    authKey: api.authKey,
    password: api.password,
    debridKeys: api.debridKeys,
    addons: api.addons ?? [],
    lastSync: api.lastSync != null ? new Date(api.lastSync) : new Date(0),
    status: api.status,
  }
}

function encodeAccountWrite(input: AccountWriteInput) {
  const body: Record<string, unknown> = {}
  if (input.name !== undefined) body.name = input.name
  if (input.email !== undefined) body.email = input.email
  if (input.authKey !== undefined) body.authKey = input.authKey
  if (input.password !== undefined) body.password = input.password
  if (input.debridKeys !== undefined) body.debridKeys = input.debridKeys
  if (input.addons !== undefined) body.addons = input.addons
  if (input.status !== undefined) body.status = input.status
  if (input.lastSync !== undefined) {
    body.lastSync =
      input.lastSync === null
        ? null
        : input.lastSync instanceof Date
          ? input.lastSync.getTime()
          : input.lastSync
  }
  return body
}

export const accountsApi = {
  list: async (): Promise<StremioAccount[]> => {
    const data = await backendClient.get<{ accounts: ApiAccount[] }>('/api/accounts')
    return (data.accounts ?? []).map(deserializeAccount)
  },

  create: async (input: AccountWriteInput): Promise<StremioAccount> => {
    const data = await backendClient.post<{ account: ApiAccount }>(
      '/api/accounts',
      encodeAccountWrite(input)
    )
    return deserializeAccount(data.account)
  },

  update: async (id: string, input: AccountWriteInput): Promise<StremioAccount> => {
    const data = await backendClient.put<{ account: ApiAccount }>(
      `/api/accounts/${encodeURIComponent(id)}`,
      encodeAccountWrite(input)
    )
    return deserializeAccount(data.account)
  },

  remove: async (id: string): Promise<void> => {
    await backendClient.delete(`/api/accounts/${encodeURIComponent(id)}`)
  },
}

// ---- Saved addons -----------------------------------------------------------

interface ApiSavedAddon {
  id: string
  name: string
  installUrl: string
  manifest: SavedAddon['manifest']
  tags: string[]
  debridConfig?: DebridConfig
  sourceType: SavedAddon['sourceType']
  sourceAccountId?: string
  health?: SavedAddon['health']
  createdAt: number
  updatedAt: number
  lastUsed?: number | null
}

export interface SavedAddonWriteInput {
  name?: string
  installUrl?: string
  manifest?: SavedAddon['manifest']
  tags?: string[]
  debridConfig?: DebridConfig | null
  sourceType?: SavedAddon['sourceType']
  sourceAccountId?: string | null
  health?: SavedAddon['health'] | null
  lastUsed?: Date | number | null
}

function deserializeSavedAddon(api: ApiSavedAddon): SavedAddon {
  return {
    id: api.id,
    name: api.name,
    installUrl: api.installUrl,
    manifest: api.manifest,
    tags: api.tags ?? [],
    debridConfig: api.debridConfig,
    sourceType: api.sourceType,
    sourceAccountId: api.sourceAccountId,
    health: api.health,
    createdAt: new Date(api.createdAt),
    updatedAt: new Date(api.updatedAt),
    lastUsed: api.lastUsed != null ? new Date(api.lastUsed) : undefined,
  }
}

function encodeSavedAddonWrite(input: SavedAddonWriteInput) {
  const body: Record<string, unknown> = {}
  if (input.name !== undefined) body.name = input.name
  if (input.installUrl !== undefined) body.installUrl = input.installUrl
  if (input.manifest !== undefined) body.manifest = input.manifest
  if (input.tags !== undefined) body.tags = input.tags
  if (input.debridConfig !== undefined) body.debridConfig = input.debridConfig
  if (input.sourceType !== undefined) body.sourceType = input.sourceType
  if (input.sourceAccountId !== undefined) body.sourceAccountId = input.sourceAccountId
  if (input.health !== undefined) body.health = input.health
  if (input.lastUsed !== undefined) {
    body.lastUsed =
      input.lastUsed === null
        ? null
        : input.lastUsed instanceof Date
          ? input.lastUsed.getTime()
          : input.lastUsed
  }
  return body
}

export const savedAddonsApi = {
  list: async (): Promise<SavedAddon[]> => {
    const data = await backendClient.get<{ addons: ApiSavedAddon[] }>('/api/addons')
    return (data.addons ?? []).map(deserializeSavedAddon)
  },

  create: async (input: SavedAddonWriteInput): Promise<SavedAddon> => {
    const data = await backendClient.post<{ addon: ApiSavedAddon }>(
      '/api/addons',
      encodeSavedAddonWrite(input)
    )
    return deserializeSavedAddon(data.addon)
  },

  update: async (id: string, input: SavedAddonWriteInput): Promise<SavedAddon> => {
    const data = await backendClient.put<{ addon: ApiSavedAddon }>(
      `/api/addons/${encodeURIComponent(id)}`,
      encodeSavedAddonWrite(input)
    )
    return deserializeSavedAddon(data.addon)
  },

  remove: async (id: string): Promise<void> => {
    await backendClient.delete(`/api/addons/${encodeURIComponent(id)}`)
  },
}

// ---- Account addon states --------------------------------------------------

interface ApiInstalledAddon extends Omit<InstalledAddon, 'installedAt'> {
  installedAt: number
}

interface ApiAccountAddonState {
  accountId: string
  installedAddons: ApiInstalledAddon[]
  lastSync: number
}

function deserializeInstalledAddon(api: ApiInstalledAddon): InstalledAddon {
  return { ...api, installedAt: new Date(api.installedAt) }
}

function deserializeAccountAddonState(api: ApiAccountAddonState): AccountAddonState {
  return {
    accountId: api.accountId,
    installedAddons: (api.installedAddons ?? []).map(deserializeInstalledAddon),
    lastSync: new Date(api.lastSync),
  }
}

function encodeInstalledAddon(addon: InstalledAddon): ApiInstalledAddon {
  return {
    ...addon,
    installedAt:
      addon.installedAt instanceof Date ? addon.installedAt.getTime() : addon.installedAt,
  }
}

export const addonStatesApi = {
  list: async (): Promise<AccountAddonState[]> => {
    const data = await backendClient.get<{ states: ApiAccountAddonState[] }>('/api/addon-states')
    return (data.states ?? []).map(deserializeAccountAddonState)
  },

  upsert: async (state: AccountAddonState): Promise<AccountAddonState> => {
    const body = {
      accountId: state.accountId,
      installedAddons: state.installedAddons.map(encodeInstalledAddon),
      lastSync: state.lastSync instanceof Date ? state.lastSync.getTime() : state.lastSync,
    }
    const data = await backendClient.put<{ state: ApiAccountAddonState }>('/api/addon-states', body)
    return deserializeAccountAddonState(data.state)
  },
}
