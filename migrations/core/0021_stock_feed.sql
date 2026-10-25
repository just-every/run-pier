CREATE TABLE pier_stock_feed_bootstrap (id INTEGER PRIMARY KEY CHECK(id=1));
CREATE TABLE pier_stock_events (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 id TEXT NOT NULL UNIQUE,
 item_id TEXT NOT NULL,
 location_id TEXT NOT NULL,
 at TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data))
);
CREATE TABLE pier_stock_consumers (
 id TEXT PRIMARY KEY,
 actor_id TEXT NOT NULL,
 grant_version INTEGER NOT NULL,
 scope TEXT NOT NULL,
 acknowledged INTEGER NOT NULL DEFAULT 0,
 checkpoint TEXT,
 pending TEXT CHECK(pending IS NULL OR json_valid(pending))
);
