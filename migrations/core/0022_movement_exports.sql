CREATE TABLE pier_movement_exports (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  operator_version INTEGER NOT NULL,
  permission_version INTEGER NOT NULL,
  source_version INTEGER NOT NULL,
  frontier INTEGER NOT NULL,
  total INTEGER NOT NULL,
  processed INTEGER NOT NULL DEFAULT 0,
  cursor INTEGER NOT NULL DEFAULT 0,
  pages INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('pending','complete','stale')),
  created_at TEXT NOT NULL
);
CREATE TABLE pier_movement_export_parts (
  job_id TEXT NOT NULL REFERENCES pier_movement_exports(id) ON DELETE CASCADE,
  page INTEGER NOT NULL,
  first_sequence INTEGER NOT NULL,
  last_sequence INTEGER NOT NULL,
  row_count INTEGER NOT NULL,
  PRIMARY KEY(job_id,page)
);
