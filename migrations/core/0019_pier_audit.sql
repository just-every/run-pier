CREATE TABLE pier_audit (id TEXT PRIMARY KEY, at TEXT NOT NULL, actor_id TEXT NOT NULL, command_id TEXT NOT NULL, event_type TEXT NOT NULL, outcome TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)));
CREATE INDEX pier_audit_time ON pier_audit(at,id);
CREATE TRIGGER pier_audit_update BEFORE UPDATE ON pier_audit BEGIN SELECT RAISE(ABORT,'AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER pier_audit_delete BEFORE DELETE ON pier_audit BEGIN SELECT RAISE(ABORT,'AUDIT_APPEND_ONLY'); END;
