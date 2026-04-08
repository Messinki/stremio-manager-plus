-- Stremio Manager Plus — D1 schema
--
-- All timestamps are stored as INTEGER (unix milliseconds).
-- All JSON-shaped fields are stored as TEXT and parsed in app code.
-- Foreign keys cascade so deleting a user cleanly removes all of their data.

PRAGMA foreign_keys = ON;

-- ============================================================================
-- users — app accounts (email + password login)
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id            TEXT    PRIMARY KEY,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,   -- base64( PBKDF2-SHA256(password, salt, 600k) )
  password_salt TEXT    NOT NULL,   -- base64( random 16 bytes )
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================================================
-- sessions — server-side sessions, looked up via HttpOnly cookie
-- ============================================================================
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT    PRIMARY KEY,   -- base64url( random 32 bytes )
  user_id    TEXT    NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- For middleware lookups (token is the PK so already indexed) and cleanup sweeps.
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON sessions(user_id);

-- ============================================================================
-- accounts — Stremio accounts managed by an app user
-- ============================================================================
CREATE TABLE IF NOT EXISTS accounts (
  id           TEXT    PRIMARY KEY,
  user_id      TEXT    NOT NULL,
  name         TEXT    NOT NULL,
  email        TEXT,                         -- Stremio account email
  auth_key     TEXT    NOT NULL,             -- plain text in v1
  password     TEXT,                         -- plain text in v1, optional
  debrid_keys  TEXT,                         -- JSON: Record<string, string>
  addons       TEXT    NOT NULL DEFAULT '[]',-- JSON: AddonDescriptor[]
  last_sync    INTEGER,
  status       TEXT    NOT NULL DEFAULT 'active',  -- 'active' | 'error'
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);

-- ============================================================================
-- saved_addons — reusable addon library, scoped per app user
-- ============================================================================
CREATE TABLE IF NOT EXISTS saved_addons (
  id                TEXT    PRIMARY KEY,
  user_id           TEXT    NOT NULL,
  name              TEXT    NOT NULL,
  install_url       TEXT    NOT NULL,        -- template URL when debrid_config is set
  manifest          TEXT    NOT NULL,        -- JSON: AddonManifest
  tags              TEXT    NOT NULL DEFAULT '[]',  -- JSON: string[]
  debrid_config     TEXT,                    -- JSON: DebridConfig
  source_type       TEXT    NOT NULL DEFAULT 'manual',  -- 'manual' | 'cloned-from-account'
  source_account_id TEXT,                    -- nullable; not a FK so cloned addons survive account deletion
  health            TEXT,                    -- JSON: { isOnline, lastChecked }
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  last_used         INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_saved_addons_user_id ON saved_addons(user_id);

-- ============================================================================
-- account_addon_states — which saved addons are installed on which account
-- ============================================================================
CREATE TABLE IF NOT EXISTS account_addon_states (
  id                TEXT    PRIMARY KEY,
  user_id           TEXT    NOT NULL,
  account_id        TEXT    NOT NULL UNIQUE,        -- one state row per account
  installed_addons  TEXT    NOT NULL DEFAULT '[]',  -- JSON: InstalledAddon[]
  last_sync         INTEGER,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_account_addon_states_user_id    ON account_addon_states(user_id);
CREATE INDEX IF NOT EXISTS idx_account_addon_states_account_id ON account_addon_states(account_id);
