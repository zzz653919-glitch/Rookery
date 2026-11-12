-- Friends, challenges, chat, news, tournaments, reports.
CREATE TABLE friendships (
  requester_id INTEGER NOT NULL,
  addressee_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',        -- pending | accepted
  created_at TEXT NOT NULL,
  PRIMARY KEY (requester_id, addressee_id)
);
CREATE INDEX friendships_addressee ON friendships(addressee_id, status);
CREATE TABLE challenges (
  game_id TEXT PRIMARY KEY,
  from_id INTEGER NOT NULL, to_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',        -- pending | accepted | declined | expired
  created_at TEXT NOT NULL
);
CREATE INDEX challenges_to ON challenges(to_id, status);
CREATE TABLE game_chat (
  id INTEGER PRIMARY KEY,
  game_id TEXT NOT NULL, user_id INTEGER NOT NULL,
  text TEXT NOT NULL, ts TEXT NOT NULL
);
CREATE INDEX game_chat_game ON game_chat(game_id, id);
CREATE TABLE news (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,                            -- sanitised HTML (same allow-list as lessons)
  status TEXT NOT NULL DEFAULT 'draft',          -- draft | published
  author TEXT, created_at TEXT NOT NULL, published_at TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE tournaments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  base_ms INTEGER NOT NULL, inc_ms INTEGER NOT NULL, category TEXT NOT NULL,
  starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',      -- scheduled | cancelled
  created_by TEXT, created_at TEXT NOT NULL
);
CREATE TABLE tournament_players (
  tournament_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  score INTEGER NOT NULL DEFAULT 0, games INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, draws INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0, joined_at TEXT NOT NULL,
  PRIMARY KEY (tournament_id, user_id)
);
CREATE TABLE reports (
  id INTEGER PRIMARY KEY,
  reporter_id INTEGER NOT NULL, target_id INTEGER NOT NULL, game_id TEXT,
  reason TEXT NOT NULL,                          -- cheating | abuse | spam | other
  detail TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',           -- open | resolved | dismissed
  created_at TEXT NOT NULL, handled_by TEXT, handled_at TEXT, note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX reports_status ON reports(status, created_at);
UPDATE roles SET permissions = '["dashboard:read","content:read","content:write","themes:read","themes:write","settings:read","audit:read","players:read","players:write"]' WHERE name = 'editor';
UPDATE roles SET permissions = '["dashboard:read","content:read","themes:read","settings:read","players:read"]' WHERE name = 'viewer';
