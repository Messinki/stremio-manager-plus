# Project Memory

## Current State
- Major architecture shift in progress: client-side SPA → backend + D1 database
- All 7 phases of the migration plan are TODO
- Plan last updated: 2026-02-20

## Key Decision Context
- Removing client-side encryption (HTTPS + auth sufficient for personal tool)
- LocalForage + IndexedDB storage being replaced by Cloudflare D1 (SQLite)
- JWT auth with email/password (using @tsndr/cloudflare-worker-jwt)
- Debrid key formats already researched and detection engine built (src/lib/debrid-config.ts) — this carries over unchanged

## Next Steps
Starting with Phase 1: Database schema and wrangler.toml setup
