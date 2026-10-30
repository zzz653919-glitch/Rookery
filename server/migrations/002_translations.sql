-- Translation memory for lesson / puzzle / settings texts. The key is (language, hash of the exact English source string).
-- Strings translated by the bundled curriculum need no row here (they ship in js/i18n/content.*.js); rows are written
-- for administrator-authored text, either by the auto-translator ('auto') or by a person ('manual', never overwritten).
CREATE TABLE translations (
  lang TEXT NOT NULL CHECK (lang IN ('uz','ru')),
  hash TEXT NOT NULL,
  source TEXT NOT NULL,
  text TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('auto','manual')),
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (lang, hash)
);
