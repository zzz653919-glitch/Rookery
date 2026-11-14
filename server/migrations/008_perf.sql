-- Indexes for the queries the pages run most (found by the performance audit).
CREATE INDEX IF NOT EXISTS news_published ON news(status, published_at);
CREATE INDEX IF NOT EXISTS games_finished ON games(status, ended_at);
CREATE INDEX IF NOT EXISTS tournament_players_user ON tournament_players(user_id);
CREATE INDEX IF NOT EXISTS tournaments_ends ON tournaments(ends_at);
CREATE INDEX IF NOT EXISTS audit_entity ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS world_games_round ON world_games(event_id, round_id);
CREATE INDEX IF NOT EXISTS world_games_featured ON world_games(featured, id);
CREATE INDEX IF NOT EXISTS world_events_state ON world_events(live, remote_state);
CREATE INDEX IF NOT EXISTS world_cache_age ON world_cache(fetched_at);
