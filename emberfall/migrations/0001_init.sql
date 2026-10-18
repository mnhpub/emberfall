CREATE TABLE IF NOT EXISTS player_profiles (
  player_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT 'Wanderer',
  level INTEGER NOT NULL DEFAULT 1,
  experience INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS player_saves (
  player_id TEXT PRIMARY KEY REFERENCES player_profiles(player_id),
  save_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS world_discoveries (
  player_id TEXT NOT NULL,
  discovery_id TEXT NOT NULL,
  discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id, discovery_id)
);
