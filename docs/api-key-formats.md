# Stremio Addon - Debrid API Key Formats

Research into how popular Stremio addons embed RealDebrid (and other debrid) API keys in their URLs.

---

## Format Categories

There are **4 distinct patterns** for how addons handle debrid credentials:

| Category | Addons | Can we strip/inject keys? |
|----------|--------|--------------------------|
| **Plain text in URL path** | Torrentio | Yes |
| **Base64-encoded JSON in URL path** | Comet, Jackettio, Annatar, Debrid Search, Orion, Easynews+ | Yes |
| **Server-side encrypted config** | MediaFusion, AIOStreams | No - requires server's secret key |
| **Server-side only / account-based** | TorBox, Deflix, StremThru | No - keys not in URL |

**For our purposes, we can support categories 1 and 2.** Categories 3 and 4 don't embed extractable keys in the URL so we leave those addons alone.

---

## Category 1: Plain Text in URL Path

### Torrentio
```
https://torrentio.strem.fun/sort=qualitysize|qualityfilter=threed,480p,scr,cam|limit=4|debridoptions=nocatalog|realdebrid=API_KEY_HERE/manifest.json
```

- **Config location:** Pipe-delimited key=value pairs in the URL path segment before `/manifest.json`
- **Key field:** `realdebrid=VALUE`
- **Other debrid fields:** `alldebrid=`, `premiumize=`, `debridlink=`, `offcloud=`, `putio=`
- **Detection:** Look for `|realdebrid=` or `realdebrid=` in the path
- **Stripping:** Replace the value between `realdebrid=` and the next `|` or `/` with a placeholder

---

## Category 2: Base64-Encoded JSON in URL Path

All of these follow the same pattern:
```
https://addon-host.com/<base64_json>/manifest.json
```

The path segment before `/manifest.json` is a base64-encoded JSON config object. The field names differ per addon.

### Comet
```
https://comet.elfhosted.com/<base64>/manifest.json
```

**Decoded JSON:**
```json
{
  "debridService": "realdebrid",
  "debridApiKey": "API_KEY_HERE",
  "debridStreamProxyPassword": "",
  "maxResultsPerResolution": 4,
  "cachedOnly": false,
  ...
}
```

| Field | Value |
|-------|-------|
| Service field | `debridService` = `"realdebrid"` |
| Key field | `debridApiKey` |
| Other sensitive | `debridStreamProxyPassword` |

### Jackettio
```
https://jackettio.example.com/<base64>/manifest.json
```

**Decoded JSON:**
```json
{
  "debridId": "realdebrid",
  "debridApiKey": "API_KEY_HERE",
  "qualities": [0, 720, 1080],
  "maxTorrents": 8,
  ...
}
```

| Field | Value |
|-------|-------|
| Service field | `debridId` = `"realdebrid"` |
| Key field | `debridApiKey` |
| Supported services | `realdebrid`, `alldebrid`, `debridlink`, `premiumize` |

### Annatar
```
https://annatar.example.com/<base64>/manifest.json
```

**Decoded JSON:**
```json
{
  "debrid_service": "real_debrid",
  "debrid_api_key": "API_KEY_HERE",
  "indexers": ["eztv", "yts"],
  "max_results": 5
}
```

| Field | Value |
|-------|-------|
| Service field | `debrid_service` = `"real_debrid"` (note underscore) |
| Key field | `debrid_api_key` (note underscores) |
| Supported services | `real_debrid`, `premiumize` |

### Debrid Search
```
https://host.com/<base64>/manifest.json
```

**Decoded JSON:**
```json
{
  "DebridProvider": "RealDebrid",
  "DebridApiKey": "API_KEY_HERE",
  "ShowCatalog": true
}
```

| Field | Value |
|-------|-------|
| Service field | `DebridProvider` = `"RealDebrid"` (PascalCase) |
| Key field | `DebridApiKey` (PascalCase) |
| Supported services | `RealDebrid`, `AllDebrid`, `TorBox`, `Offcloud`, `Premiumize` |

---

## Category 3: Server-Side Encrypted (Not Extractable)

### MediaFusion
- Config is **AES-256-CBC encrypted** with the server's `SECRET_KEY`
- URL prefixed with `D-` (inline data) or `R-` (Redis reference)
- Cannot be decrypted without server access
- Key field (when decrypted): `sp.tk` (alias for `streaming_provider.token`)

### AIOStreams
- Config is **encrypted** with a server `SECRET_KEY` (64 hex chars)
- Cannot be decrypted without server access
- Wraps other addons (Torrentio, Comet, etc.) and injects debrid keys server-side

---

## Category 4: Server-Side Only (No Key in URL)

- **TorBox** - Account-based auth, no key in URL
- **Deflix** - Environment variables / OAuth2
- **StremThru** - Server-side env vars, acts as addon proxy

---

## Detection Strategy for Our App

When processing an addon URL, try these steps in order:

### Step 1: Check for plain-text debrid keys in URL path
Look for these patterns in the path (before `/manifest.json`):
- `realdebrid=`
- `alldebrid=`
- `premiumize=`
- `debridlink=`
- `offcloud=`
- `putio=`

If found → **Format: `plaintext-url`**

### Step 2: Try base64 decode of first path segment
1. Extract the path segment before `/manifest.json`
2. Try `atob()` / base64 decode
3. Try `JSON.parse()` on the result
4. Look for known debrid key fields in the parsed JSON:
   - `debridApiKey` (Comet, Jackettio)
   - `debrid_api_key` (Annatar)
   - `DebridApiKey` (Debrid Search)

If found → **Format: `base64-json`**

### Step 3: No debrid key detected
The addon either:
- Uses server-side encryption (MediaFusion, AIOStreams) → cannot template
- Doesn't use debrid at all → save as-is
- Uses an unknown format → save as-is, flag for manual review

---

## Known Debrid Key Field Names (for base64-json detection)

```typescript
const DEBRID_KEY_FIELDS = [
  'debridApiKey',      // Comet, Jackettio
  'debrid_api_key',    // Annatar
  'DebridApiKey',      // Debrid Search
] as const;

const DEBRID_SERVICE_FIELDS = [
  'debridService',     // Comet
  'debridId',          // Jackettio
  'debrid_service',    // Annatar
  'DebridProvider',    // Debrid Search
] as const;

// For Torrentio plain-text format
const PLAINTEXT_DEBRID_PATTERNS = [
  'realdebrid',
  'alldebrid',
  'premiumize',
  'debridlink',
  'offcloud',
  'putio',
] as const;
```
