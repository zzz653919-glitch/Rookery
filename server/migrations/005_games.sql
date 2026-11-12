-- Online games, matchmaking queue.
CREATE TABLE games (
  id TEXT PRIMARY KEY,                           -- short random id, also the private-room link
  white_id INTEGER, black_id INTEGER,
  creator_id INTEGER,
  kind TEXT NOT NULL DEFAULT 'casual',           -- rated | casual
  category TEXT NOT NULL,                        -- bullet | blitz | rapid | classical
  base_ms INTEGER NOT NULL, inc_ms INTEGER NOT NULL,
  status TEXT NOT NULL,                          -- waiting | active | finished | aborted
  result TEXT, reason TEXT,
  moves TEXT NOT NULL DEFAULT '[]',              -- JSON array of UCI moves
  fen TEXT NOT NULL,
  wtime INTEGER NOT NULL, btime INTEGER NOT NULL, -- ms left when the current turn started
  turn_since INTEGER,                            -- epoch ms: when the side to move's clock started running
  version INTEGER NOT NULL DEFAULT 0,
  draw_offer TEXT,                               -- 'w' | 'b' | NULL
  w_rating INTEGER, b_rating INTEGER, w_delta INTEGER, b_delta INTEGER,
  tournament_id INTEGER,
  rematch_id TEXT,
  created_at TEXT NOT NULL, started_at TEXT, ended_at TEXT
);
CREATE INDEX games_white ON games(white_id, created_at);
CREATE INDEX games_black ON games(black_id, created_at);
CREATE INDEX games_status ON games(status, created_at);
CREATE TABLE matchmaking (
  user_id INTEGER PRIMARY KEY,
  category TEXT NOT NULL, base_ms INTEGER NOT NULL, inc_ms INTEGER NOT NULL,
  rated INTEGER NOT NULL, rating REAL NOT NULL,
  tournament_id INTEGER,
  created_at INTEGER NOT NULL,                   -- epoch ms
  seen_at INTEGER NOT NULL,                      -- last poll / heartbeat; stale entries are ignored
  game_id TEXT                                   -- set when paired
);
