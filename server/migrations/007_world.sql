-- Chess World: news from sources, events (tournaments), historical games, broadcasts and famous players.
ALTER TABLE news ADD COLUMN image TEXT;
ALTER TABLE news ADD COLUMN source_name TEXT;
ALTER TABLE news ADD COLUMN source_url TEXT;
ALTER TABLE news ADD COLUMN category TEXT NOT NULL DEFAULT 'international';
ALTER TABLE news ADD COLUMN origin TEXT NOT NULL DEFAULT 'admin';     -- admin | feed
ALTER TABLE news ADD COLUMN ext_id TEXT;                              -- feed entry id (dedupe)
ALTER TABLE news ADD COLUMN lang TEXT NOT NULL DEFAULT 'en';
CREATE UNIQUE INDEX news_ext ON news(ext_id);
CREATE INDEX news_cat ON news(category, published_at);

CREATE TABLE world_categories (
  slug TEXT PRIMARY KEY, name_en TEXT NOT NULL, name_uz TEXT NOT NULL, name_ru TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE world_sources (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL, url TEXT NOT NULL,                              -- RSS / Atom feed
  category TEXT NOT NULL DEFAULT 'international', lang TEXT NOT NULL DEFAULT 'en',
  official INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, note TEXT NOT NULL DEFAULT '',
  last_fetch_at TEXT, last_status TEXT, last_error TEXT, created_at TEXT NOT NULL
);
CREATE TABLE world_events (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  level TEXT,                                                          -- international | continental | national | online
  country TEXT, location TEXT,
  starts_on TEXT, ends_on TEXT,                                       -- ISO timestamps
  format TEXT, tc TEXT, prize TEXT, registration_url TEXT, website TEXT, standings_url TEXT, image TEXT, players_text TEXT,
  schedule TEXT NOT NULL DEFAULT '[]',                                -- JSON: [{ name, startsAt, finishedAt?, ongoing?, id? }]
  confirmed INTEGER NOT NULL DEFAULT 1,                               -- 0 = provisional schedule
  status_override TEXT,                                               -- upcoming | live | completed (admin correction)
  tier INTEGER, featured INTEGER NOT NULL DEFAULT 0,
  live INTEGER NOT NULL DEFAULT 0, live_round_id TEXT, fide_tc TEXT,   -- standard | rapid | blitz
  locked INTEGER NOT NULL DEFAULT 0, synced_rounds TEXT NOT NULL DEFAULT '[]',                                    -- a round is being played right now (from the feed)
  remote_state TEXT,                                                  -- active | upcoming | past, as reported by the feed
  source_name TEXT, source_url TEXT,
  origin TEXT NOT NULL DEFAULT 'admin',                               -- admin | lichess
  lichess_id TEXT UNIQUE, synced_at TEXT, games_synced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX world_events_dates ON world_events(starts_on);
CREATE TABLE world_games (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL, ext_id TEXT NOT NULL,
  round_name TEXT, round_id TEXT, board TEXT,
  white TEXT NOT NULL, black TEXT NOT NULL,
  white_elo INTEGER, black_elo INTEGER, white_fide INTEGER, black_fide INTEGER,
  white_fed TEXT, black_fed TEXT, white_title TEXT, black_title TEXT, white_team TEXT, black_team TEXT,
  result TEXT, eco TEXT, opening TEXT, plies INTEGER NOT NULL DEFAULT 0, played_on TEXT,
  featured INTEGER NOT NULL DEFAULT 0, locked INTEGER NOT NULL DEFAULT 0,
  evals INTEGER NOT NULL DEFAULT 0,                                   -- 1 when the PGN carries engine evaluations
  pgn TEXT NOT NULL, source_url TEXT,
  UNIQUE(event_id, ext_id)
);
CREATE INDEX world_games_event ON world_games(event_id);
CREATE INDEX world_games_white ON world_games(white_fide);
CREATE INDEX world_games_black ON world_games(black_fide);
CREATE INDEX world_games_date ON world_games(played_on);
CREATE TABLE world_players (
  slug TEXT PRIMARY KEY, name TEXT NOT NULL, fide_id INTEGER UNIQUE, country TEXT, wiki_title TEXT, chesscom TEXT,
  bio_en TEXT NOT NULL DEFAULT '', bio_uz TEXT NOT NULL DEFAULT '', bio_ru TEXT NOT NULL DEFAULT '',
  achievements TEXT NOT NULL DEFAULT '[]',                            -- JSON: [{ text, year?, sourceUrl? }] entered by editors
  world_rank INTEGER, rank_source TEXT,                               -- only shown when an editor supplies an official figure
  featured INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE world_broadcasts (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL,                                             -- youtube_live | youtube_video | twitch | lichess | link
  ref TEXT NOT NULL,                                                  -- channel id / video id / twitch channel / lichess round id / URL
  channel_name TEXT, official_url TEXT, language TEXT,
  event_id INTEGER, starts_at TEXT, ends_at TEXT,
  status_override TEXT,                                               -- upcoming | live | completed
  featured INTEGER NOT NULL DEFAULT 0, official INTEGER NOT NULL DEFAULT 1,
  commentary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX world_broadcasts_start ON world_broadcasts(starts_at);
CREATE TABLE world_cache (
  key TEXT PRIMARY KEY, body TEXT NOT NULL, fetched_at INTEGER NOT NULL, status INTEGER NOT NULL DEFAULT 200
);

INSERT INTO world_categories(slug, name_en, name_uz, name_ru, sort) VALUES
  ('rookery', 'Rookery', 'Rookery', 'Rookery', 0),
  ('international', 'International', 'Xalqaro', 'Международные', 1),
  ('fide', 'FIDE', 'FIDE', 'FIDE', 2),
  ('interviews', 'Interviews', 'Intervyular', 'Интервью', 3),
  ('achievements', 'Achievements & transfers', 'Yutuqlar va o''tishlar', 'Достижения и переходы', 4),
  ('technology', 'Technology & rules', 'Texnologiya va qoidalar', 'Технологии и правила', 5),
  ('national', 'National', 'Milliy', 'Национальные', 6),
  ('uzbekistan', 'Uzbekistan', 'O''zbekiston', 'Узбекистан', 7);

-- Feeds. Only sources checked by the maintainers are enabled; the others are listed switched off until an administrator verifies them.
INSERT INTO world_sources(name, url, category, official, enabled, note, created_at) VALUES
  ('Lichess Blog', 'https://lichess.org/@/Lichess/blog.atom', 'technology', 1, 1, 'Official Lichess announcements (Atom). Checked.', '2026-11-14T00:00:00.000Z'),
  ('FIDE News', 'https://www.fide.com/feed/', 'fide', 1, 0, 'Not verified yet: open the address, confirm it is a feed, then switch it on.', '2026-11-14T00:00:00.000Z'),
  ('Chess.com News', 'https://www.chess.com/rss/news', 'international', 0, 0, 'Not verified yet: check the feed and chess.com terms of use, then switch it on.', '2026-11-14T00:00:00.000Z');

-- Players: identity only. Ratings, titles and photos come from the FIDE data served by Lichess; biographies from Wikipedia. Nothing else is stored here until an editor adds it.
INSERT INTO world_players(slug, name, fide_id, country, wiki_title, chesscom, featured, sort, created_at, updated_at) VALUES
  ('magnus-carlsen', 'Magnus Carlsen', 1503014, 'NOR', 'Magnus_Carlsen', 'magnuscarlsen', 1, 1, '2026-11-14T00:00:00.000Z', '2026-11-14T00:00:00.000Z'),
  ('hikaru-nakamura', 'Hikaru Nakamura', 2016192, 'USA', 'Hikaru_Nakamura', 'hikaru', 1, 2, '2026-11-14T00:00:00.000Z', '2026-11-14T00:00:00.000Z'),
  ('fabiano-caruana', 'Fabiano Caruana', 2020009, 'USA', 'Fabiano_Caruana', 'fabianocaruana', 1, 3, '2026-11-14T00:00:00.000Z', '2026-11-14T00:00:00.000Z'),
  ('gukesh-dommaraju', 'Gukesh Dommaraju', 46616543, 'IND', 'Gukesh_Dommaraju', NULL, 1, 4, '2026-11-14T00:00:00.000Z', '2026-11-14T00:00:00.000Z'),
  ('nodirbek-abdusattorov', 'Nodirbek Abdusattorov', 14204118, 'UZB', 'Nodirbek_Abdusattorov', NULL, 1, 5, '2026-11-14T00:00:00.000Z', '2026-11-14T00:00:00.000Z'),
  ('javokhir-sindarov', 'Javokhir Sindarov', 14205483, 'UZB', 'Javokhir_Sindarov', NULL, 1, 6, '2026-11-14T00:00:00.000Z', '2026-11-14T00:00:00.000Z'),
  ('alireza-firouzja', 'Alireza Firouzja', 12573981, 'FRA', 'Alireza_Firouzja', 'firouzja2003', 1, 7, '2026-11-14T00:00:00.000Z', '2026-11-14T00:00:00.000Z'),
  ('ian-nepomniachtchi', 'Ian Nepomniachtchi', 4168119, 'RUS', 'Ian_Nepomniachtchi', 'lachesisq', 0, 8, '2026-11-14T00:00:00.000Z', '2026-11-14T00:00:00.000Z'),
  ('rameshbabu-praggnanandhaa', 'Rameshbabu Praggnanandhaa', 25059530, 'IND', 'Rameshbabu_Praggnanandhaa', NULL, 0, 9, '2026-11-14T00:00:00.000Z', '2026-11-14T00:00:00.000Z');

-- Administrators with content access can also manage the world data.
UPDATE roles SET permissions = '["dashboard:read","content:read","content:write","themes:read","themes:write","settings:read","audit:read","players:read","players:write"]' WHERE name = 'editor';
