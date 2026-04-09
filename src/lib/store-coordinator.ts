/**
 * Store Coordinator
 *
 * Handles coordination between multiple stores without creating circular dependencies.
 * This module can import all stores, but stores should NOT import this module.
 */

import { useAddonStore } from '@/store/addonStore'

/**
 * Update latest addon versions across relevant stores
 * Called when account sync detects new addon versions
 */
export function updateLatestVersions(versions: Record<string, string>): void {
  useAddonStore.getState().updateLatestVersions(versions)
}
