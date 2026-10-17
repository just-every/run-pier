-- Credentials never enter business records, command results or portable archives.
CREATE TABLE pier_channel_secrets (channel_id TEXT PRIMARY KEY, secret TEXT NOT NULL);
CREATE TABLE pier_channel_locks (id INTEGER PRIMARY KEY CHECK(id=1), token TEXT NOT NULL, expires_at INTEGER NOT NULL);
