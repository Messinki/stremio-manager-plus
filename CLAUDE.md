# Stremio Manager Plus - Claude Code Guide

## Project Overview

A client-side React SPA for managing Stremio addons across multiple user accounts. All data is stored locally with AES-256-GCM encrypted credentials (no cloud backend). The app allows installing, removing, syncing, and organizing addons via a reusable library system.

**Live deployment:** https://stremio-account-manager.pages.dev/

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite
- **State:** Zustand 5
- **Styling:** Tailwind CSS, shadcn/ui, Radix UI
- **Storage:** LocalForage (IndexedDB)
- **Encryption:** Web Crypto API (AES-256-GCM, PBKDF2-SHA256)
- **HTTP:** Axios
- **Validation:** Zod

## Key Architecture

### Directory Layout

- `src/api/` - Stremio API client (auth, addon CRUD)
- `src/store/` - Zustand stores (accountStore, addonStore, authStore, uiStore)
- `src/types/` - TypeScript interfaces (account, addon, saved-addon, cinemeta)
- `src/lib/` - Utilities (crypto, addon-merger, addon-storage, addon-health)
- `src/components/` - React components organized by feature
- `src/pages/` - Page-level components
- `src/hooks/` - Custom React hooks

### Core Data Flow

1. Accounts hold encrypted Stremio auth keys + current addon list
2. Addons are saved to a reusable library (addon store)
3. Library addons can be bulk-applied to accounts using merge strategies
4. All persistence goes through LocalForage (IndexedDB)

### Important Files

| Purpose | File |
|---------|------|
| Account CRUD & sync | `src/store/accountStore.ts` |
| Addon library & bulk ops | `src/store/addonStore.ts` |
| Stremio API calls | `src/api/stremio-client.ts` |
| Merge logic | `src/lib/addon-merger.ts` |
| Storage persistence | `src/lib/addon-storage.ts` |
| Type definitions | `src/types/saved-addon.ts`, `src/types/addon.ts` |
| Encryption | `src/lib/crypto.ts` |

## Current Feature Work

See [plan.md](plan.md) for the current long-term and short-term plan.

### Reference Documents

- [plan.md](plan.md) - Always-updated project plan (long-term and short-term)
- [docs/api-key-formats.md](docs/api-key-formats.md) - Complete catalog of how each Stremio addon stores debrid API keys
- [manifest_examples.js](manifest_examples.js) - Example addon URLs showing API key formats (DO NOT COMMIT - contains real keys)

### Backend / D1 Migration (in progress — see Phase 1+ in plan.md)

- [wrangler.toml](wrangler.toml) - Cloudflare Pages config + D1 binding (`DB`). `database_id` is filled in after `npx wrangler d1 create stremio-manager`.
- [schema.sql](schema.sql) - D1 schema: 5 tables (`users`, `sessions`, `accounts`, `saved_addons`, `account_addon_states`) with FK cascades on `user_id`. All timestamps are INTEGER unix-ms; JSON-shaped fields are TEXT.
- Backend routes will live under `/functions/api/` (Cloudflare Pages Functions).

## Workflow Rules

### Git Commits

- **Only commit when explicitly asked** - never auto-commit (overrides global handoff auto-commit)
- simple git commit style, use as checkpoints, save the entire project
- Never commit files containing API keys or secrets

### General

- Read files before modifying them
- Prefer editing existing files over creating new ones
- `manifest_examples.js` is in `.gitignore` - it contains real API keys for reference only

## RealDebrid API Key Injection - Key Context

Full research in [docs/api-key-formats.md](docs/api-key-formats.md). Two extractable formats:

### Format 1: `plaintext-url` (Torrentio)
```
https://torrentio.strem.fun/...options...|realdebrid=API_KEY_HERE/manifest.json
```
- Pipe-delimited key=value pairs in URL path before `/manifest.json`
- Debrid fields: `realdebrid=`, `alldebrid=`, `premiumize=`, `debridlink=`, `offcloud=`, `putio=`

### Format 2: `base64-json` (Comet, Jackettio, Annatar, Debrid Search)
```
https://addon.host/<base64_encoded_json>/manifest.json
```
- Path segment is base64-encoded JSON config
- Key field names vary by addon: `debridApiKey`, `debrid_api_key`, `DebridApiKey`
- Service field names vary: `debridService`, `debridId`, `debrid_service`, `DebridProvider`

### Not Extractable (save as-is)
- **MediaFusion, AIOStreams** - Server-side encrypted configs, cannot decode client-side
- **TorBox, Deflix, StremThru** - Keys stored server-side, not in URL

### Detection Strategy

1. Check URL path for plain-text debrid patterns (`realdebrid=`, etc.)
2. Try base64 decode → JSON parse → look for known debrid key field names
3. If neither matches → addon either doesn't use debrid or uses server-side encryption → save as-is
