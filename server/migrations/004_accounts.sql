-- Player accounts (separate from administrator accounts), ratings and synced learning progress.
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,                 -- scrypt$N$r$p$salt$hash, never the password
  avatar TEXT NOT NULL DEFAULT 'preset:1',     -- 'preset:<n>' or 'upload'
  country TEXT NOT NULL DEFAULT '',            -- ISO 3166-1 alpha-2 or empty
  bio TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL DEFAULT 'en',
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  banned INTEGER NOT NULL DEFAULT 0,
  ban_reason TEXT NOT NULL DEFAULT '',
  muted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE user_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  csrf TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX user_sessions_user ON user_sessions(user_id);
CREATE TABLE user_avatars (
  user_id INTEGER PRIMARY KEY,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE ratings (
  user_id INTEGER NOT NULL,
  category TEXT NOT NULL,                      -- bullet | blitz | rapid | classical | puzzle
  rating REAL NOT NULL DEFAULT 1200,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  peak REAL NOT NULL DEFAULT 1200,
  updated_at TEXT,
  PRIMARY KEY (user_id, category)
);
CREATE INDEX ratings_board ON ratings(category, rating DESC);
CREATE TABLE user_progress (                   -- the player's learning progress (lessons, puzzles, achievements …), synced from the browser
  user_id INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
