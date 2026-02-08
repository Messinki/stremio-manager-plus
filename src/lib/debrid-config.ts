import { AddonDescriptor } from '@/types/addon'
import { DebridConfig, DebridFormat } from '@/types/saved-addon'

/** Placeholder token used in template URLs where the API key was stripped */
export const DEBRID_KEY_PLACEHOLDER = '{{DEBRID_API_KEY}}'

// --- Known field names across addon ecosystems ---

/** Fields that contain the debrid API key in base64-JSON configs */
const DEBRID_KEY_FIELDS = ['debridApiKey', 'debrid_api_key', 'DebridApiKey'] as const

/** Fields that indicate which debrid service is being used */
const DEBRID_SERVICE_FIELDS = [
  'debridService',
  'debridId',
  'debrid_service',
  'DebridProvider',
] as const

/** Plain-text debrid key patterns in Torrentio-style URLs */
const PLAINTEXT_DEBRID_KEYS = [
  'realdebrid',
  'alldebrid',
  'premiumize',
  'debridlink',
  'offcloud',
  'putio',
] as const

// --- Result types ---

export interface StripResult {
  templateUrl: string
  debridConfig: DebridConfig
  strippedKey: string
}

// --- Detection & Stripping ---

/**
 * Detect and strip a debrid API key from an addon install URL.
 * Returns null if no debrid key is found (addon doesn't use debrid or uses server-side encryption).
 */
export function stripDebridApiKey(installUrl: string): StripResult | null {
  // Try plaintext-url format first (Torrentio)
  const plaintextResult = tryStripPlaintextUrl(installUrl)
  if (plaintextResult) return plaintextResult

  // Try base64-json format (Comet, Jackettio, Annatar, Debrid Search)
  const base64Result = tryStripBase64Json(installUrl)
  if (base64Result) return base64Result

  return null
}

/**
 * Inject a debrid API key into a template URL to produce a working addon URL.
 */
export function injectDebridApiKey(
  templateUrl: string,
  debridConfig: DebridConfig,
  apiKey: string
): string {
  if (debridConfig.format === 'plaintext-url') {
    return templateUrl.replace(DEBRID_KEY_PLACEHOLDER, apiKey)
  }

  if (debridConfig.format === 'base64-json') {
    return injectBase64Json(templateUrl, debridConfig, apiKey)
  }

  return templateUrl
}

// --- Plain-text URL format (Torrentio) ---

function tryStripPlaintextUrl(installUrl: string): StripResult | null {
  try {
    const url = new URL(installUrl)
    const path = url.pathname

    for (const debridKey of PLAINTEXT_DEBRID_KEYS) {
      // Match patterns like |realdebrid=VALUE| or |realdebrid=VALUE/
      const regex = new RegExp(`(\\|?)${debridKey}=([^|/]+)`)
      const match = path.match(regex)

      if (match) {
        const strippedKey = match[2]
        const templatePath = path.replace(
          `${debridKey}=${strippedKey}`,
          `${debridKey}=${DEBRID_KEY_PLACEHOLDER}`
        )
        const templateUrl = installUrl.replace(path, templatePath)

        return {
          templateUrl,
          debridConfig: {
            format: 'plaintext-url' as DebridFormat,
            keyField: debridKey,
            serviceType: debridKey,
          },
          strippedKey,
        }
      }
    }
  } catch {
    // Invalid URL, skip
  }

  return null
}

// --- Base64-JSON format (Comet, Jackettio, Annatar, Debrid Search) ---

function tryStripBase64Json(installUrl: string): StripResult | null {
  try {
    const url = new URL(installUrl)
    const pathParts = url.pathname.split('/')

    // Find the base64 config segment - typically the path segment before /manifest.json
    // Look for segments that could be base64-encoded JSON
    for (let i = 1; i < pathParts.length; i++) {
      const segment = pathParts[i]
      if (!segment || segment === 'manifest.json' || segment.endsWith('.json')) continue

      // Try to decode as base64
      let decoded: string
      try {
        decoded = atob(segment)
      } catch {
        continue
      }

      // Try to parse as JSON
      let config: Record<string, unknown>
      try {
        config = JSON.parse(decoded)
      } catch {
        continue
      }

      // Look for known debrid key fields
      for (const keyField of DEBRID_KEY_FIELDS) {
        if (typeof config[keyField] === 'string' && config[keyField]) {
          const strippedKey = config[keyField] as string

          // Find the service type
          let serviceType = 'realdebrid' // default
          let serviceField: string | undefined
          for (const sf of DEBRID_SERVICE_FIELDS) {
            if (typeof config[sf] === 'string' && config[sf]) {
              serviceType = normalizeServiceType(config[sf] as string)
              serviceField = sf
              break
            }
          }

          // Replace the key with placeholder in config and re-encode
          const templateConfig = { ...config, [keyField]: DEBRID_KEY_PLACEHOLDER }
          const templateSegment = btoa(JSON.stringify(templateConfig))

          const templateParts = [...pathParts]
          templateParts[i] = templateSegment
          const templatePath = templateParts.join('/')
          const templateUrl = installUrl.replace(url.pathname, templatePath)

          return {
            templateUrl,
            debridConfig: {
              format: 'base64-json' as DebridFormat,
              keyField,
              serviceField,
              serviceType,
            },
            strippedKey,
          }
        }
      }
    }
  } catch {
    // Invalid URL, skip
  }

  return null
}

function injectBase64Json(templateUrl: string, debridConfig: DebridConfig, apiKey: string): string {
  try {
    const url = new URL(templateUrl)
    const pathParts = url.pathname.split('/')

    for (let i = 1; i < pathParts.length; i++) {
      const segment = pathParts[i]
      if (!segment || segment === 'manifest.json' || segment.endsWith('.json')) continue

      let decoded: string
      try {
        decoded = atob(segment)
      } catch {
        continue
      }

      let config: Record<string, unknown>
      try {
        config = JSON.parse(decoded)
      } catch {
        continue
      }

      // Found the config segment - inject the API key
      if (config[debridConfig.keyField] === DEBRID_KEY_PLACEHOLDER) {
        config[debridConfig.keyField] = apiKey
        const newSegment = btoa(JSON.stringify(config))
        const newParts = [...pathParts]
        newParts[i] = newSegment
        const newPath = newParts.join('/')
        return templateUrl.replace(url.pathname, newPath)
      }
    }
  } catch {
    // Fallback: simple string replacement
  }

  // Fallback: direct placeholder replacement
  return templateUrl.replace(DEBRID_KEY_PLACEHOLDER, apiKey)
}

/** Normalize various service type strings to a consistent format */
function normalizeServiceType(raw: string): string {
  const lower = raw.toLowerCase().replace(/[_\s-]/g, '')
  if (lower === 'realdebrid' || lower === 'rd') return 'realdebrid'
  if (lower === 'alldebrid' || lower === 'ad') return 'alldebrid'
  if (lower === 'premiumize' || lower === 'pm') return 'premiumize'
  if (lower === 'debridlink' || lower === 'dl') return 'debridlink'
  if (lower === 'offcloud') return 'offcloud'
  if (lower === 'putio' || lower === 'put.io') return 'putio'
  if (lower === 'torbox') return 'torbox'
  return raw.toLowerCase()
}

/** Get a human-readable label for a debrid service type */
export function getDebridServiceLabel(serviceType: string): string {
  const labels: Record<string, string> = {
    realdebrid: 'RealDebrid',
    alldebrid: 'AllDebrid',
    premiumize: 'Premiumize',
    debridlink: 'DebridLink',
    offcloud: 'Offcloud',
    putio: 'Put.io',
    torbox: 'TorBox',
  }
  return labels[serviceType] || serviceType
}

/** Get all supported debrid service types for UI dropdowns */
export const SUPPORTED_DEBRID_SERVICES = [
  { value: 'realdebrid', label: 'RealDebrid' },
  { value: 'alldebrid', label: 'AllDebrid' },
  { value: 'premiumize', label: 'Premiumize' },
  { value: 'debridlink', label: 'DebridLink' },
  { value: 'offcloud', label: 'Offcloud' },
  { value: 'putio', label: 'Put.io' },
] as const

/**
 * Scan an array of addon descriptors and extract any debrid API keys found in their URLs.
 * Returns one entry per unique service type (first key found wins).
 */
export function extractDebridKeysFromAddons(
  addons: AddonDescriptor[]
): Array<{ serviceType: string; apiKey: string; addonName: string }> {
  const found = new Map<string, { apiKey: string; addonName: string }>()

  for (const addon of addons) {
    const result = stripDebridApiKey(addon.transportUrl)
    if (result && !found.has(result.debridConfig.serviceType)) {
      found.set(result.debridConfig.serviceType, {
        apiKey: result.strippedKey,
        addonName: addon.manifest.name,
      })
    }
  }

  return Array.from(found.entries()).map(([serviceType, { apiKey, addonName }]) => ({
    serviceType,
    apiKey,
    addonName,
  }))
}
