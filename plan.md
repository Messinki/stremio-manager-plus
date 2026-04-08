# Stremio Manager Plus - Project Plan

**Last updated:** 2026-02-20

---

## Direction Change

The app is being migrated from a purely client-side SPA (browser IndexedDB storage) to a multi-user web app with a real persistent backend. Data will live in a Cloudflare D1 (SQLite) database, accessible from any device.

**Stack:**
- Frontend: React SPA on Cloudflare Pages (unchanged)
- Backend: Cloudflare Pages Functions (Workers) at `/functions/api/`
- Database: Cloudflare D1 (SQLite)
- Auth: Email + password, JWT (HMAC-SHA256)
- Encryption: **Removed for now** — HTTPS + auth is sufficient for a personal tool

---

## Architecture

```
React SPA (Cloudflare Pages)
  └── fetch('/api/...') with JWT token
        └── Cloudflare Pages Functions (/functions/api/)
              └── Cloudflare D1 (SQLite database)
```

---

## Phase 1: Database Schema & Cloudflare Config — TODO

- [ ] Create `wrangler.toml` with D1 binding
- [ ] Create `schema.sql` with 4 tables: `users`, `accounts`, `saved_addons`, `account_addon_states`
- [ ] Run `wrangler d1 create stremio-manager` to provision the database
- [ ] Apply schema: `wrangler d1 execute stremio-manager --file=schema.sql`

### D1 Schema (outline)
```sql
users               — id, email, password_hash, password_salt, created_at
accounts            — id, user_id, name, email, auth_key, password, debrid_keys (JSON), addons (JSON), last_sync, status, created_at, updated_at
saved_addons        — id, user_id, name, install_url, manifest (JSON), tags (JSON), debrid_config (JSON), source_type, health (JSON), created_at, updated_at, last_used
account_addon_states — id, user_id, account_id, installed_addons (JSON), last_sync
```

---

## Phase 2: Cloudflare Pages Functions (Backend API) — TODO

New files to create under `/functions/api/`:

```
functions/api/
  _middleware.ts          ← JWT verification (protects all /api/* routes)
  _types.ts               ← Shared Env type (DB: D1Database, JWT_SECRET: string)
  auth/
    login.ts              ← POST /api/auth/login
    register.ts           ← POST /api/auth/register
  accounts/
    index.ts              ← GET /api/accounts, POST /api/accounts
    [id].ts               ← GET/PUT/DELETE /api/accounts/:id
  addons/
    index.ts              ← GET /api/addons, POST /api/addons
    [id].ts               ← PUT/DELETE /api/addons/:id
  addon-states/
    index.ts              ← GET/PUT /api/addon-states
```

JWT: use `@tsndr/cloudflare-worker-jwt` (Workers-compatible). Sign with `JWT_SECRET` Worker secret. 30-day expiry.

Password hashing: PBKDF2-SHA256 via Web Crypto (built into Workers runtime).

---

## Phase 3: Frontend — Auth Layer — TODO

- [ ] Create `src/pages/AuthPage.tsx` — login/signup form
- [ ] Create `src/api/backend-client.ts` — typed fetch wrapper with JWT attachment + 401 handling
- [ ] Rewrite `src/store/authStore.ts`:
  - Remove: master password, PBKDF2 key derivation, lock/unlock, CryptoKey state
  - Add: `user`, `token`, `login()`, `register()`, `logout()`, `initialize()` (reads token from localStorage)
- [ ] Update `src/App.tsx`: replace master-password gate with `token ? <App> : <AuthPage>`
- [ ] Delete `src/components/auth/MasterPasswordSetup.tsx`
- [ ] Delete `src/components/auth/UnlockDialog.tsx`
- [ ] Delete `src/components/auth/ForgotPasswordFlow.tsx`

---

## Phase 4: Frontend — Replace LocalForage with API Calls — TODO

### accountStore.ts
Replace all `localforage.getItem/setItem` with `backendClient` calls. Remove all `encrypt()`/`decrypt()` calls — authKey, password, debridKeys stored as plain text.

| Old | New |
|-----|-----|
| `localforage.getItem('stremio-manager:accounts')` | `GET /api/accounts` |
| `localforage.setItem(...)` per account | `POST /api/accounts` or `PUT /api/accounts/:id` |
| `deleteAccount()` (local only) | `DELETE /api/accounts/:id` |

### addonStore.ts
Replace all `loadAddonLibrary()`/`saveAddonLibrary()` with API calls.

| Old | New |
|-----|-----|
| `loadAddonLibrary()` | `GET /api/addons` |
| `saveAddonLibrary(library)` | `POST /api/addons` or `PUT /api/addons/:id` |
| `loadAccountAddonStates()` | `GET /api/addon-states` |
| `saveAccountAddonStates(states)` | `PUT /api/addon-states` |

### Files to delete
- `src/lib/crypto.ts`
- `src/lib/addon-storage.ts`
- `src/lib/storage-reset.ts`

### Packages to remove
- `localforage`
- `crypto-js`

### Packages to add
- `wrangler` (dev dep)
- `@tsndr/cloudflare-worker-jwt`

---

## Phase 5: Debrid Key Simplification — TODO

Keys are now plain text in D1 — no decrypt step needed before injection.

- [ ] Update `src/store/addonStore.ts` — remove decrypt step from `resolveAddonsWithKeys()` and all apply/bulk-apply actions
- [ ] Remove `encryptionKey` param from `applySavedAddonToAccount()`, `applyTagToAccount()`, `bulkApplySavedAddons()`
- [ ] Remove `encryptionKey` prop from UI components: `AddonInstaller.tsx`, `BulkApplyDialog.tsx`
- [ ] `src/lib/debrid-config.ts` — no changes needed (inject logic unchanged)

---

## Phase 6: Export/Import Migration Path — TODO

No code changes needed. Users migrate via existing export/import:
1. Export data from old browser app (downloads JSON)
2. Register account in new app
3. Import JSON → stores call `POST /api/accounts` + `POST /api/addons` per item

Verify the import path works correctly end-to-end after store migration.

---

## Phase 7: Dev Setup & Deployment — TODO

```bash
# Install wrangler
npm install -D wrangler

# Create D1 database (run once)
npx wrangler d1 create stremio-manager

# Set JWT secret
npx wrangler secret put JWT_SECRET

# Local dev with D1
npx wrangler pages dev dist --d1=DB
```

Production:
- D1 database binding added in Cloudflare Pages dashboard settings
- `JWT_SECRET` set as Pages encrypted environment variable
- Deploy as normal (push to GitHub → auto-deploy)

---

## Previous Work (Completed Before Direction Change)

The debrid API key templating system was fully built and is still valid — the data model and injection logic carry over unchanged. Only the persistence layer and auth are being replaced.

- [x] Researched all major addon debrid key formats (see `docs/api-key-formats.md`)
- [x] Built debrid detection engine (`src/lib/debrid-config.ts`)
- [x] Per-account debrid key management UI
- [x] Key injection on install/apply
- [x] Export/import with debrid config
- [x] Auto-detect debrid keys on sync
- [x] Warning when installing debrid addon without matching key
