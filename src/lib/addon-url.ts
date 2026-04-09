import { SavedAddon } from '@/types/saved-addon'

/**
 * Normalize URL for comparison.
 * Removes trailing slashes, lowercases the result, and sorts query params so
 * URLs that are semantically identical compare equal.
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)

    const params = new URLSearchParams(parsed.search)
    const sortedParams = new URLSearchParams(
      Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b))
    )

    parsed.search = sortedParams.toString()
    let normalized = parsed.toString()

    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1)
    }

    return normalized.toLowerCase()
  } catch {
    return url.toLowerCase().replace(/\/$/, '')
  }
}

/**
 * Find a saved addon in the library whose installUrl matches `url` (after
 * normalization). Used by the account-state sync to auto-link addons that the
 * user installed manually but happen to match a library entry.
 */
export function findSavedAddonByUrl(
  library: Record<string, SavedAddon>,
  url: string
): SavedAddon | null {
  const normalizedUrl = normalizeUrl(url)

  for (const savedAddon of Object.values(library)) {
    if (normalizeUrl(savedAddon.installUrl) === normalizedUrl) {
      return savedAddon
    }
  }

  return null
}
