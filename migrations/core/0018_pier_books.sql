-- The durable job claim is committed before any financial request leaves Pier.
CREATE TABLE pier_book_locks (id INTEGER PRIMARY KEY CHECK(id=1), token TEXT NOT NULL, expires_at INTEGER NOT NULL);
