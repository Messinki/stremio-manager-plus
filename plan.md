# Stremio Manager Plus - Project Plan

**Last updated:** 2026-04-08 (Phases 1–7 code-side complete. Phase 5 audit clean. Phase 6 export/import verified by code review. Phase 7 dashboard ops still pending — D1 binding + WAF rate-limit rule need to be set in the Cloudflare dashboard before going live.)

---

## Direction Change

The app is being migrated from a purely client-side SPA (browser IndexedDB storage) to a multi-user web app with a real persistent backend. Data will live in a Cloudflare D1 (SQLite) database, accessible from any device.

**Stack:**

- Frontend: React SPA on Cloudflare Pages (unchanged)
- Backend: Cloudflare Pages Functions (Workers) at `/functions/api/`
- Database: Cloudflare D1 (SQLite)
- Auth: Email + password, server-side sessions (random token in HttpOnly cookie, looked up in D1 `sessions` table)
- Encryption: **Removed for v1** — HTTPS + D1's at-rest encryption + auth is sufficient for a personal tool. End-to-end encryption of Stremio keys can be added later as Option B (see bottom).

---

## Architecture

```
React SPA (Cloudflare Pages)
  └── fetch('/api/...', { credentials: 'include' })   ← HttpOnly session cookie, auto-sent
        └── Cloudflare Pages Functions (/functions/api/)
              └── Cloudflare D1 (SQLite database)
```

### Why session cookies over JWT

- HttpOnly cookies can't be read by JS → XSS can't steal the session
- `SameSite=Strict` blocks CSRF for free, no token plumbing
- Sessions are revocable (delete the row) — JWTs aren't until expiry
- No library needed — it's just a random token + a D1 lookup

---

## Phase 1: Database Schema & Cloudflare Config — DONE

- [x] Install `wrangler` + `@cloudflare/workers-types` as dev deps (pulled forward from Phase 7 — needed to run the D1 commands below)
- [x] Create `wrangler.toml` with D1 binding (`DB`)
- [x] Create `schema.sql` with 5 tables: `users`, `sessions`, `accounts`, `saved_addons`, `account_addon_states`
- [x] Index on `sessions.expires_at` for cleanup queries (also indexed `sessions.user_id`, `users.email`, `accounts.user_id`, `saved_addons.user_id`, `account_addon_states.user_id`, `account_addon_states.account_id`)
- [x] Add `.wrangler/` to `.gitignore` (local D1 sqlite cache)
- [x] `npx wrangler d1 create stremio-manager` → `database_id = d2d28968-7c60-413f-85c8-555b3bbd0d5f` (region WEUR), pasted into `wrangler.toml`
- [x] Apply schema locally: 13 commands successful, sqlite file at `.wrangler/state/v3/d1/`
- [x] Apply schema to remote: 13 queries (24 rows written), 5 tables verified via `SELECT name FROM sqlite_master`

### D1 Schema (outline)

```sql
users                — id, email, password_hash, password_salt, created_at
sessions             — token (PK), user_id, expires_at, created_at
accounts             — id, user_id, name, email, auth_key, password, debrid_keys (JSON), addons (JSON), last_sync, status, created_at, updated_at
saved_addons         — id, user_id, name, install_url, manifest (JSON), tags (JSON), debrid_config (JSON), source_type, health (JSON), created_at, updated_at, last_used
account_addon_states — id, user_id, account_id, installed_addons (JSON), last_sync
```

Session token: 32 random bytes (via `crypto.getRandomValues`) → base64url. No signing needed — it's opaque and unguessable. Lookup is one indexed D1 query per request.

---

## Phase 2: Cloudflare Pages Functions (Backend API) — DONE

File-per-route style (simple, explicit, no framework). If routing gets noisy later, switch to a single Hono catch-all at `functions/api/[[route]].ts`.

- [x] `_lib/` helpers (types, response, password, session, id, serializers)
- [x] `_middleware.ts` — session cookie check, exempts `/api/auth/login` and `/api/auth/register`
- [x] `auth/` — `register.ts`, `login.ts`, `logout.ts`, `me.ts`
- [x] `accounts/` — `index.ts` (GET list, POST create), `[id].ts` (GET / PUT / DELETE)
- [x] `addons/` — `index.ts` (GET list, POST create), `[id].ts` (PUT / DELETE)
- [x] `addon-states/` — `index.ts` (GET list, PUT upsert via `ON CONFLICT(account_id)`)
- [x] `functions/tsconfig.json` — separate TS project so Workers types don't bleed into the SPA build

Files created under `/functions/api/`:

```
functions/api/
  _middleware.ts          ← Session cookie check (protects all /api/* except /api/auth/*)
  _lib/
    session.ts            ← createSession, getSession, deleteSession, cookie helpers
    password.ts           ← hashPassword, verifyPassword (PBKDF2-SHA256, 600k iters)
    types.ts              ← Shared Env type (DB: D1Database)
  auth/
    login.ts              ← POST /api/auth/login    → sets Set-Cookie: session=...
    register.ts           ← POST /api/auth/register → sets Set-Cookie: session=...
    logout.ts             ← POST /api/auth/logout   → deletes row, clears cookie
    me.ts                 ← GET  /api/auth/me       → { user } or 401
  accounts/
    index.ts              ← GET /api/accounts, POST /api/accounts
    [id].ts               ← GET/PUT/DELETE /api/accounts/:id
  addons/
    index.ts              ← GET /api/addons, POST /api/addons
    [id].ts               ← PUT/DELETE /api/addons/:id
  addon-states/
    index.ts              ← GET/PUT /api/addon-states
```

**Session middleware:** reads `session` cookie → `SELECT * FROM sessions WHERE token = ? AND expires_at > ?` → attaches `user_id` to `context.data` → else 401.

**Password hashing:** PBKDF2-SHA256 via Web Crypto (built into Workers, no npm package). 600,000 iterations (OWASP 2023 recommendation). Per-user random salt stored alongside the hash.

**Set-Cookie attributes:** `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000` (30 days).

**Rate limiting on `/api/auth/login`:** Start with a Cloudflare dashboard rule (5 req/min per IP). If we outgrow that, add a `login_attempts` D1 table.

---

## Phase 3: Frontend — Auth Layer — DONE

Backend smoke test (2026-04-08) confirmed the full path works against local D1:
`POST /api/auth/register` → 201 + `Set-Cookie` → `GET /api/auth/me` → 200 → `POST /api/accounts` with `debridKeys` JSON → round-trips through serializer cleanly. Middleware blocks unauthenticated `/api/*` with 401.

- [x] `src/pages/AuthPage.tsx` — login/signup with mode toggle (no shadcn `tabs` component existed; built a small two-button toggle inline)
- [x] `src/api/backend-client.ts` — typed fetch wrapper with `BackendError` / `UnauthorizedError`. Always sends `credentials: 'include'`. Auth helpers (`me`, `login`, `register`, `logout`) live in the same file. `me()` uses `throwOn401: false` so the startup check returns `null` instead of throwing.
- [x] Rewrote `src/store/authStore.ts`:

  - Removed: `isLocked`, `encryptionKey`, `setupMasterPassword`, `unlock`, `lock`, `resetMasterPassword`, `isPasswordSet`, plus all `crypto` / session-key imports
  - Added: `user` (null | { id, email }), `isInitializing`, `initialize()` (one /me call), `login()`, `register()`, `logout()`, `clearUser()`
- [x] `src/App.tsx`: gate is now `isInitializingAuth || !storesReady ? Loading : (user ? <Layout> : <AuthPage>)`
- [x] Deleted `src/components/auth/{MasterPasswordSetup,UnlockDialog,ForgotPasswordFlow}.tsx` and the now-empty `src/components/auth/` directory
- [x] `vite.config.ts` — `server.proxy['/api'] → http://localhost:8788` so the dev SPA hits the wrangler `pages dev` server at the same origin (cookies work without CORS)

### Build status after Phase 3

`tsc --noEmit` reports **4 expected errors** — these are the consumers Phase 4 will refactor. They still try to read `encryptionKey` off the auth store to decrypt locally-stored Stremio auth keys, which no longer exist:

```
src/store/accountStore.ts:35              — useAuthStore.getState().encryptionKey
src/store/addonStore.ts:34                — useAuthStore.getState().encryptionKey
src/components/addons/AddonList.tsx:34    — encryptionKey selector + decrypt() calls
src/components/addons/CinemetaConfigurationDialog.tsx:55 — same
```

Backend `tsc --project functions/tsconfig.json` is clean.

---

## Phase 4: Frontend — Replace LocalForage with API Calls — DONE

- [x] `src/api/backend-client.ts` — added `accountsApi`, `savedAddonsApi`, `addonStatesApi` with typed CRUD wrappers + serializer/deserializer that converts unix-ms ↔ `Date` so the rest of the app can stay on `Date`-bearing models.
- [x] `src/store/accountStore.ts` — rewritten: `localforage` + all `encrypt/decrypt` calls gone. Every mutation hits the backend (`POST`/`PUT`/`DELETE /api/accounts`) and stores the canonical row that comes back. `authKey`, `password`, `debridKeys` are plain text now.
- [x] `src/store/addonStore.ts` — rewritten the same way against `savedAddonsApi` + `addonStatesApi`. `latestVersions` is now in-memory only (was a `localforage` cache; safe to lose on refresh).
- [x] `src/components/addons/AddonList.tsx` and `CinemetaConfigurationDialog.tsx` — dropped `encryptionKey` selector + `decrypt(authKey, ...)` calls; now use `account.authKey` directly.
- [x] `src/App.tsx` — store init is now gated on `user`. On mount we restore session + UI prefs; once `user` becomes non-null we trigger `initializeAccounts()` + `initializeAddons()` (these need the session cookie). On logout we call `reset()` on both stores.
- [x] `src/lib/addon-url.ts` — extracted `normalizeUrl` + `findSavedAddonByUrl` from the old `addon-storage.ts` (they're pure URL helpers, no storage).
- [x] Deleted: `src/lib/crypto.ts`, `src/lib/addon-storage.ts`, `src/lib/storage-reset.ts`, `src/hooks/useLocalStorage.ts` (all unused after this phase).
- [x] Trimmed `src/lib/store-coordinator.ts` (`resetAllStores` was only called by master-password reset; gone).
- [x] Removed `STORAGE_KEYS` from `src/types/saved-addon.ts` (only the deleted files referenced it).
- [x] `npm uninstall localforage crypto-js @types/crypto-js`
- [x] `npx tsc --noEmit` and `npx tsc --project functions/tsconfig.json --noEmit` are both clean. `npm run build` succeeds.

### Notes / gotchas

- Backend serializers send timestamps as unix-ms `number`s. Conversion to/from `Date` lives in `backend-client.ts` so stores stay on the existing `StremioAccount`/`SavedAddon` shapes — no churn in the rest of the codebase.
- `accountStore.exportAccounts` now reads the saved-addon library by calling `savedAddonsApi.list()` instead of localforage. `importAccounts` POSTs each account + saved addon individually (one request per item — fine for the import volume; could be batched later if it becomes a problem).
- `addonStore.importLibrary(merge=false)` deletes every existing saved addon on the backend before re-creating from the import. Best-effort: errors on individual deletes are logged and skipped.
- `bulkApplySavedAddons`, `applyTagToAccount`, `checkAllHealth`, `renameTag` all do N PUTs (one per addon) where the old code wrote one big localforage blob. Acceptable for current scale; can optimize with a backend bulk endpoint later if needed.
- Phase 3 had warned about an unconditional `Promise.all([initializeAccounts(), initializeAddons()])` on mount — that would now fire before the session cookie is checked. `App.tsx` was reworked to gate this on `user`. On logout, both stores are `reset()` so the next user doesn't see stale data.

---

## Phase 5: Debrid Key Simplification — DONE

Keys are plain text in D1, so the decrypt step has already been removed from
`resolveAddonsWithKeys()` and every apply/bulk-apply action. The apply functions
still take `accountAuthKey: string` and `debridKeys?: Record<string, string>`
parameters — those are now just plain text, but the parameter shapes haven't
been renamed (kept as-is for now).

- [x] Audited `AddonInstaller.tsx`, `BulkActionsDialog.tsx`, `InstallSavedAddonDialog.tsx`, `AddonList.tsx`, `AddonCard.tsx`, `CinemetaConfigurationDialog.tsx`, `ApplySavedAddonDialog.tsx`, `AccountForm.tsx` — `grep encryptionKey` returns 0 matches across `src/`. No leftover prop drilling.
- [x] Cleaned up stale comments + UI text that still claimed local encryption: `src/types/account.ts` (struct comments), `src/components/accounts/AccountForm.tsx` (decrypt comment + "(encrypted)" placeholder), `src/pages/FAQPage.tsx` ("Is my data stored in the cloud?" + "Are my credentials safe?" sections rewritten to describe the D1/session/PBKDF2 model).
- [x] `src/lib/debrid-config.ts` — confirmed unchanged (inject logic is plaintext-string in/out and was never coupled to encryption).
- [ ] Optional rename: drop the `accountAuthKey`/`debridKeys` params from the apply functions and just look them up on the store from `accountId`. Cleaner call sites but a wider refactor. **Deferred** — defer until something else makes us touch these signatures.

Note: legacy unused debrid validation schemas in `src/lib/validation.ts`
(`debridKeySchema`, `debridConfigurationSchema`, etc.) are dead code from the
old per-account debrid manager. Only `accountExportSchema` is imported. Left
in place — separate cleanup task if/when someone touches that file.

---

## Phase 6: Export/Import Migration Path — DONE (code-verified)

No code changes needed. Users migrate via existing export/import:

1. Export data from old browser app (downloads JSON)
2. Register account in new app
3. Import JSON → stores call `POST /api/accounts` + `POST /api/addons` per item

### Verification (code review)

Traced both paths against the new API surface:

- **Export** (`accountStore.exportAccounts`): pulls saved addons via
  `savedAddonsApi.list()`, maps in-memory accounts to the export shape
  (`createdAt/updatedAt/lastUsed` → ISO strings via the deserializer's `Date`).
  Auth key + password are conditionally included based on `includeCredentials`.
- **Import** (`accountStore.importAccounts`): validates with
  `accountExportSchema`, then calls `accountsApi.create()` per account and
  `savedAddonsApi.create()` per saved addon. `ImportDialog` then calls
  `addonStore.initialize()` so the saved-addon library re-pulls from the
  backend (the import flow itself doesn't push entries into the in-memory
  library, since `initialize()` is the canonical source).
- Schemas line up: `accountExportSchema.savedAddons[].*` matches every field
  the backend `POST /api/addons` accepts.
- Build is clean (`npx tsc --noEmit`, `npx tsc --project functions/tsconfig.json --noEmit`, `npm run build` all pass).

### Known limitations (pre-existing, not regressions)

- `debridKeys` are **not** included in the export schema. They get
  re-detected from addon URLs on the next sync via
  `extractDebridKeysFromAddons()`. This matches the previous LocalForage-only
  behavior — fixing it requires extending `accountExportSchema` and the
  `accounts[].*` map in `exportAccounts`. Out of scope for v1.
- Importing an account exported **without** credentials will fail at the
  backend (`POST /api/accounts` rejects empty `authKey`). Such exports are
  effectively addon-list backups, not re-importable accounts. Same as before.

---

## Phase 7: Dev Setup & Deployment — DONE (code-side); dashboard ops still pending

Already done (Phase 1):

- [x] `npm install -D wrangler @cloudflare/workers-types`
- [x] `npx wrangler d1 create stremio-manager` → id pasted into `wrangler.toml`
- [x] Schema applied to `--local` and `--remote`

### Local dev workflow

The plan originally suggested `npx wrangler pages dev -- npm run dev` (Vite + Functions + local D1 in one command). **This does not work in wrangler 4** when `pages_build_output_dir = "dist"` is set in `wrangler.toml` — wrangler errors with "Specify either a directory OR a proxy command, not both."

**Recommended: two-terminal flow** (zero config changes, no risk of forgetting to put settings back before deploy):

```bash
# Terminal 1 — Vite dev server (frontend, HMR)
npm run dev                          # → http://localhost:5173

# Terminal 2 — Pages Functions + local D1 binding
npm run build && npx wrangler pages dev   # → http://localhost:8788
```

During Phase 3/4 frontend dev: point the SPA's `backend-client.ts` at `http://localhost:8788` (or proxy through Vite via `server.proxy` in `vite.config.ts` so cookies work cleanly without CORS). Functions code lives in `functions/`, separate from `src/`, so Vite HMR doesn't touch the backend — re-running `npm run build && wrangler pages dev` is only needed when functions code changes.

For pure API smoke testing without the SPA: `npm run build` once, then `npx wrangler pages dev` serves `dist/` + `functions/` together with the D1 binding. This is what was used to validate Phase 2.

### Production — pending dashboard ops

Code is ready to deploy. The remaining items all live in the Cloudflare
dashboard and require the project to be wired up to the Cloudflare Pages
project for the live deployment:

- [ ] D1 binding added in Cloudflare Pages dashboard → Settings → Functions → D1 bindings (binding name: `DB`, points to the same `stremio-manager` database). Local dev gets the binding from `wrangler.toml`; production needs it set in the dashboard separately.
- [ ] No secrets to set — sessions don't need a signing key.
- [ ] Deploy as normal (push to GitHub → auto-deploy via the Pages GitHub integration).
- [ ] Add rate limit rule on `/api/auth/login` in Cloudflare dashboard → Security → WAF (5 req/min per IP). Until this is in place, the password-hash endpoint is the only thing slowing down a brute-force.

Code-side verified: `wrangler.toml` has the D1 binding, `vite.config.ts`
proxies `/api → localhost:8788` for dev, `functions/tsconfig.json` keeps
Workers types out of the SPA build, both tsc projects compile clean, vite
build succeeds.

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

---

## Option B — End-to-End Encryption (Future, Optional)

Not in v1. Written down so we don't lose the idea.

Right now (v1), Stremio auth keys and debrid keys are stored as plain columns in D1. D1 encrypts at rest, so the practical threat is a Cloudflare-side compromise or legal order — acceptable for a personal tool.

If we ever want zero-knowledge (server never sees plaintext):

1. Keep the existing PBKDF2 → AES-256-GCM code in [src/lib/crypto.ts](src/lib/crypto.ts)
2. On login: server verifies the password hash *and* the browser separately derives an encryption key from the same password (different salt / KDF params)
3. Stremio/debrid keys are encrypted in the browser before `POST /api/accounts`
4. Server only ever stores ciphertext; even a D1 dump is useless without the password
5. Password change becomes expensive: decrypt-all → re-encrypt-all → upload

Trade-off: more code, more edge cases (password reset becomes "nuke all encrypted data"), but a much stronger threat model.