# Stremio Manager Plus - Project Plan

**Last updated:** 2026-02-07

---

## Long-Term Vision

Transform the addon library from storing account-specific addon URLs into a **universal addon template system** where saved addons are API-key-agnostic. Each user account stores its own debrid API keys, and addons are dynamically populated with the correct key at install time.

---

## Short-Term Plan (Current Sprint)

### Phase 1: Research & Data Modeling — COMPLETE

#### 1.1 Document API Key Formats
- [x] Researched all major addon formats
- [x] Documented in `docs/api-key-formats.md`
- [x] Two extractable formats: `plaintext-url` (Torrentio) and `base64-json` (Comet, Jackettio, Annatar, Debrid Search)
- [x] Encrypted/server-side addons cannot be templated (save as-is)

#### 1.2 Data Model Changes
- [x] Added `DebridConfig` interface and `debridConfig?` field to `SavedAddon` type
- [x] Added `debridKeys?: Record<string, string>` (encrypted, per-service) to `StremioAccount` type
- [x] `installUrl` on SavedAddon now stores template URL when debrid key is stripped

### Phase 2: API Key Detection & Stripping — COMPLETE

- [x] Built `src/lib/debrid-config.ts` with `stripDebridApiKey()` and `injectDebridApiKey()`
- [x] Supports `plaintext-url` format (Torrentio pipe-delimited)
- [x] Supports `base64-json` format (Comet, Jackettio, Annatar, Debrid Search)
- [x] Placeholder token: `{{DEBRID_API_KEY}}`
- [x] Integrated stripping into `createSavedAddon()` in addonStore
- [x] Save dialog shows detection notice when debrid key is found

### Phase 3: Per-Account API Key Management — COMPLETE

- [x] `setDebridKey()` and `removeDebridKey()` actions in accountStore
- [x] Keys encrypted with AES-256-GCM (same as auth keys)
- [x] Account edit dialog has debrid key section with service selector
- [x] Masked input with reveal toggle
- [x] Shows which keys are already saved per account

### Phase 4: Key Injection on Install — COMPLETE

- [x] `applySavedAddonToAccount()` resolves debrid keys before merging
- [x] `applyTagToAccount()` resolves debrid keys before merging
- [x] `bulkApplySavedAddons()` resolves per-account debrid keys
- [x] All apply/install UI components pass `debridKeys` from account
- [x] `resolveAddonsWithKeys()` helper decrypts and injects keys

### Phase 5: UI Polish — PARTIAL

- [x] Debrid badge (RD) shown on saved addon cards in library
- [x] Debrid badge shown in install dialog addon list
- [x] Detection notice in "Save to Library" dialog
- [ ] Handle migration of existing saved addons (offer to detect and strip keys from old saves)
- [ ] Export/import: include `debridConfig` in exports, handle on import
- [ ] Warning when installing debrid addon to account with no matching key
- [ ] Auto-detect debrid key from account's existing addons on sync

---

## Future Ideas (Backlog)

- Auto-detect debrid API key from a user's existing addon URLs when adding an account
- Support for multiple debrid services per account (already supported in data model)
- Addon "profiles" - predefined sets of addons with config templates
- Debrid key rotation - update all accounts when a user's key changes
- Health check templated addons by injecting a test key
- Merge logic: match by manifest ID instead of exact URL for templated addons

---

## Completed

- [x] Initial research of Torrentio URL format (plain text `realdebrid=KEY` in pipe-delimited path)
- [x] Initial research of Comet URL format (base64-encoded JSON with `debridApiKey` field)
- [x] Created CLAUDE.md and plan.md
- [x] Full research of all major debrid addon formats
- [x] Created `docs/api-key-formats.md` with complete format catalog
- [x] Built debrid detection engine (`src/lib/debrid-config.ts`)
- [x] Updated `SavedAddon` type with `debridConfig` field
- [x] Updated `StremioAccount` type with `debridKeys` field
- [x] Integrated key stripping into save-to-library flow
- [x] Integrated key injection into all install/apply flows
- [x] Added per-account debrid key management UI
- [x] Added debrid badges to library and install dialogs
- [x] TypeScript compiles clean, Vite build passes
