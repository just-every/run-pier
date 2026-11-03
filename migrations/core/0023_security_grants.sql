-- Native security grants confer no business role and are paused by archive restore.
CREATE TABLE pier_security_grants (
  id TEXT PRIMARY KEY,
  issuer_id TEXT NOT NULL,
  issuer_version INTEGER NOT NULL,
  delegate_id TEXT NOT NULL,
  delegate_version INTEGER NOT NULL,
  target_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
