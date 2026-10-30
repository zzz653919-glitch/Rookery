-- Uploaded piece images live in the database (not on the server's disk), so the whole site state survives on hosts with an
-- ephemeral filesystem when a hosted database such as Turso is used.
CREATE TABLE piece_assets (
  set_id TEXT NOT NULL,
  file TEXT NOT NULL,                  -- e.g. wK.svg (name derived from the piece code and the detected type, never from the client)
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (set_id, file)
);
