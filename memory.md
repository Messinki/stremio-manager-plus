# Project Memory

## Current State
- Major architecture shift complete (code-side): client-side SPA → backend + D1 database
- Phase 1 DONE: D1 database `stremio-manager` (id `d2d28968-7c60-413f-85c8-555b3bbd0d5f`, region WEUR) provisioned, schema applied to both local and remote
- Phase 2 DONE: Pages Functions backend under `/functions/api/` — written, type-checks clean, smoke-tested end-to-end against local D1
- Phase 3 DONE (2026-04-08): frontend auth layer — `backend-client.ts`, rewritten `authStore.ts` (server-session model), `AuthPage.tsx`, `App.tsx` gate, vite `/api` proxy
- Phase 4 DONE (2026-04-08): accountStore + addonStore now call the backend API exclusively. `localforage` + `crypto-js` removed. `src/lib/{crypto,addon-storage,storage-reset}.ts` and the unused `useLocalStorage` hook deleted. SPA `tsc --noEmit`, backend `tsc`, and `vite build` all clean.
- Phase 5 DONE (2026-04-08): audit found zero `encryptionKey` prop drilling across `src/`. Stale UI text + comments cleaned up: `FAQPage.tsx` (cloud + credentials sections), `AccountForm.tsx` (placeholder + decrypt comment), `types/account.ts` (struct comments). The optional `accountAuthKey`/`debridKeys` rename is still deferred.
- Phase 6 DONE (2026-04-08): export/import path verified by code review. Both `accountStore.exportAccounts` and `importAccounts` go through the backend API; `ImportDialog` calls `addonStore.initialize()` after import to refresh the saved-addon library. Schemas line up. Known limitation (pre-existing): `debridKeys` aren't in the export format — they get re-detected from addon URLs on next sync.
- Phase 7 DONE code-side (2026-04-08): `wrangler.toml`, `vite.config.ts`, `functions/tsconfig.json` all set up. Production deployment (D1 binding in dashboard, WAF rate-limit rule) still pending — all dashboard ops, no code changes needed.
- Plan last updated: 2026-04-08

## Key Decision Context
- Backend = Cloudflare Pages Functions (Workers) + D1, all in the same Pages project
- Auth = email/password, **server-side sessions** (random token → HttpOnly cookie → `sessions` table in D1). No JWT, no auth library.
- Password hashing = PBKDF2-SHA256 via Web Crypto, 600k iters
- Stremio/debrid keys stored as plain columns in v1 (D1 encrypts at rest). Option B (zero-knowledge E2E) noted for future.
- Debrid key formats already researched and detection engine built (src/lib/debrid-config.ts) — this carries over unchanged
- User wants to learn Cloudflare ecosystem and web backend basics through this project

## Phase 4 Notes
- Backend wire format uses unix-ms `number`s for timestamps; `backend-client.ts` deserializes to `Date` so the `StremioAccount`/`SavedAddon` shapes don't change
- `accountsApi.update(id, partial)` only sends fields the caller actually set — backend builds a partial UPDATE statement, so omitted fields stay untouched. Use `null` (not `undefined`) when you actually want to clear a column (e.g. removing the last debrid key).
- Store init is gated on `user` in `App.tsx` — accounts/addons only load after the auth /me check succeeds. On logout, both stores `reset()`.
- `latestVersions` is in-memory only now (was a localforage cache). Refreshing the page loses the update badges until the next "Check Updates" click. Acceptable for v1.
- `addonStore.importLibrary(merge=false)` deletes everything on the backend before re-creating — N+M requests. Bulk endpoints could replace this if it becomes slow.

## Phase 2 Notes
- File-per-route under `functions/api/` — no framework. `_lib/` holds shared helpers (password, session, types, response, serializers, id).
- `_middleware.ts` runs on every `/api/*`, exempts `/api/auth/login` + `/api/auth/register`, attaches `userId` to `context.data`.
- Every accounts/addons query is scoped by `user_id` so user isolation is enforced even on guessed ids.
- `RequestData` had to extend `Record<string, unknown>` to satisfy `PagesFunction`'s third generic constraint.
- D1 stores snake_case + JSON-as-TEXT; serializers convert to camelCase + parsed JSON at the API boundary.
- `account_addon_states` upsert uses `ON CONFLICT(account_id) DO UPDATE` (relies on the `UNIQUE` constraint on `account_id`).
- `functions/tsconfig.json` is a separate TS project so `@cloudflare/workers-types` doesn't pollute the SPA build. SPA `tsc --noEmit` and `tsc --project functions/tsconfig.json` both pass.

## Local Dev Workflow Gotcha
- `npx wrangler pages dev -- npm run dev` (the combined-mode the original plan suggested) **does not work in wrangler 4** when `pages_build_output_dir = "dist"` is set in `wrangler.toml`. Errors with "Specify either a directory OR a proxy command, not both."
- Recommended workflow: **two terminals**.
  - Terminal 1: `npm run dev` (Vite on 5173, frontend HMR)
  - Terminal 2: `npm run build && npx wrangler pages dev` (serves `dist/` + `functions/` + D1 binding on 8788)
- For Phase 3, the frontend's `backend-client.ts` should hit `http://localhost:8788` directly, or proxy through Vite via `server.proxy` in `vite.config.ts` so cookies work cleanly without CORS.
- Functions code is separate from `src/`, so Vite HMR doesn't touch the backend — only re-run terminal 2 when `functions/` changes.

## Phase 1 Notes
- `schema.sql` deviates slightly from the plan outline: added `source_account_id` to `saved_addons` (used by `SavedAddon.sourceAccountId`, not a FK so cloned addons survive source-account deletion) and `UNIQUE` on `account_addon_states.account_id` (one state row per account)
- All timestamps stored as INTEGER unix-ms (matches `Date.now()`, no parsing)
- FK cascades on `user_id` so deleting a user cleanly removes all their data; `PRAGMA foreign_keys = ON` at top of schema
- `wrangler.toml` contains the real `database_id` — this is *not* a secret (Cloudflare API token still required for any operation), standard practice is to commit it
