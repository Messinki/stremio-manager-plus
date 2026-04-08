# Stremio Manager Plus - Project Plan

**Last updated:** 2026-04-08 (Phase 2 done + smoke-tested end-to-end against local D1)

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

## Phase 3: Frontend — Auth Layer — TODO (NEXT UP)

Backend smoke test (2026-04-08) confirmed the full path works against local D1:
`POST /api/auth/register` → 201 + `Set-Cookie` → `GET /api/auth/me` → 200 → `POST /api/accounts` with `debridKeys` JSON → round-trips through serializer cleanly. Middleware blocks unauthenticated `/api/*` with 401.

- [ ] Create `src/pages/AuthPage.tsx` — login/signup form (tabs or toggle)
- [ ] Create `src/api/backend-client.ts` — typed fetch wrapper
  - Always sends `credentials: 'include'` so the session cookie rides along
  - On 401 → clear auth state, redirect to `<AuthPage>`
  - No token handling in JS — cookies are HttpOnly, we can't see them
- [ ] Rewrite `src/store/authStore.ts`:
  - Remove: master password, PBKDF2 key derivation, lock/unlock, CryptoKey state, anything related to local encryption
  - Add: `user` (null | { id, email }), `login()`, `register()`, `logout()`, `initialize()` (calls `GET /api/auth/me` on startup to restore session)
- [ ] Update `src/App.tsx`: replace master-password gate with `user ? <App> : <AuthPage>`
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
- `@cloudflare/workers-types` (dev dep, for `D1Database` etc.)

No auth library needed — sessions are a D1 table and two helper functions. Password hashing is Web Crypto.

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

## Phase 7: Dev Setup & Deployment — PARTIAL

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

### Production
- D1 binding added in Cloudflare Pages dashboard → Settings → Functions → D1 bindings (binding name: `DB`, points to the same `stremio-manager` database)
- No secrets to set — sessions don't need a signing key
- Deploy as normal (push to GitHub → auto-deploy)
- Add rate limit rule on `/api/auth/login` in Cloudflare dashboard → Security → WAF (5 req/min per IP)

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
