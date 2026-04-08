# Project Memory

## Current State
- Major architecture shift in progress: client-side SPA → backend + D1 database
- Phase 1 DONE: D1 database `stremio-manager` (id `d2d28968-7c60-413f-85c8-555b3bbd0d5f`, region WEUR) provisioned, schema applied to both local and remote
- Phase 2 DONE: Pages Functions backend under `/functions/api/` — written, type-checks clean, smoke-tested end-to-end against local D1 (register → me → POST account → list accounts all green; middleware blocks unauth with 401)
- Phase 3 next: frontend auth layer (AuthPage, backend-client, rewrite authStore)
- Plan last updated: 2026-04-08

## Key Decision Context
- Backend = Cloudflare Pages Functions (Workers) + D1, all in the same Pages project
- Auth = email/password, **server-side sessions** (random token → HttpOnly cookie → `sessions` table in D1). No JWT, no auth library.
- Password hashing = PBKDF2-SHA256 via Web Crypto, 600k iters
- Stremio/debrid keys stored as plain columns in v1 (D1 encrypts at rest). Option B (zero-knowledge E2E) noted for future.
- Debrid key formats already researched and detection engine built (src/lib/debrid-config.ts) — this carries over unchanged
- User wants to learn Cloudflare ecosystem and web backend basics through this project

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
