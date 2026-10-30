-- Rookery admin backend: initial schema.
CREATE TABLE roles (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  permissions TEXT NOT NULL           -- JSON array, "*" = everything
);

CREATE TABLE admins (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,        -- scrypt$N$r$p$salt$hash, never the password
  role_id INTEGER NOT NULL REFERENCES roles(id),
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_login_at TEXT,
  password_changed_at TEXT
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,        -- sha256 of the cookie token; the raw token is never stored
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX sessions_admin ON sessions(admin_id);

CREATE TABLE login_attempts (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  ip TEXT NOT NULL,
  username TEXT NOT NULL COLLATE NOCASE,
  ok INTEGER NOT NULL
);
CREATE INDEX login_attempts_ts ON login_attempts(ts);

CREATE TABLE lessons (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL,
  skill TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  objectives TEXT NOT NULL DEFAULT '[]',   -- JSON array of strings
  difficulty INTEGER NOT NULL DEFAULT 1,
  minutes INTEGER NOT NULL DEFAULT 6,
  steps TEXT NOT NULL,                     -- JSON: explanations, interactive positions, exercises, quiz
  position INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  source TEXT NOT NULL DEFAULT 'custom' CHECK (source IN ('builtin','custom')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
CREATE INDEX lessons_level ON lessons(level, position);

CREATE TABLE puzzles (
  id TEXT PRIMARY KEY,
  fen TEXT NOT NULL,
  moves TEXT NOT NULL,                     -- JSON array of UCI moves: solver, reply, solver, ...
  theme TEXT NOT NULL,                     -- tactical category id
  themes TEXT NOT NULL DEFAULT '[]',       -- JSON array of extra motif tags
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 5),
  solver_moves INTEGER NOT NULL,
  solution TEXT NOT NULL DEFAULT '',
  hint TEXT NOT NULL DEFAULT '',
  explanation TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  source TEXT NOT NULL DEFAULT 'custom' CHECK (source IN ('builtin','custom')),
  validated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
CREATE INDEX puzzles_theme ON puzzles(theme, level);

CREATE TABLE piece_sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('css','assets')),
  colors TEXT NOT NULL DEFAULT '{}',       -- css sets: {w:{...},b:{...}} colour variables
  assets TEXT NOT NULL DEFAULT '{}',       -- asset sets: {wK:'wK.svg', ...}
  builtin INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE board_themes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  light TEXT NOT NULL,
  dark TEXT NOT NULL,
  builtin INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,                     -- JSON
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  admin_id INTEGER,
  username TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  detail TEXT,                             -- JSON; secrets are redacted before writing
  ip TEXT
);
CREATE INDEX audit_ts ON audit_log(ts);

-- Anonymous, aggregate-only usage events sent by the player site (no accounts, no personal data).
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  anon TEXT NOT NULL,                      -- random per-browser id, not linked to a person
  type TEXT NOT NULL,
  ref TEXT,
  level TEXT,
  value INTEGER,
  detail TEXT
);
CREATE INDEX events_type_ts ON events(type, ts);

CREATE TABLE server_errors (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  route TEXT,
  message TEXT NOT NULL
);

INSERT INTO roles(name, description, permissions) VALUES
  ('superadmin', 'Full access, including administrator accounts', '["*"]'),
  ('editor', 'Manage lessons, puzzles and themes; read settings', '["dashboard:read","content:read","content:write","themes:read","themes:write","settings:read","audit:read"]'),
  ('viewer', 'Read-only access to the dashboard and content', '["dashboard:read","content:read","themes:read","settings:read"]');
