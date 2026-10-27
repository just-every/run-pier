-- Factor material and session assurance are installation-local credentials.
CREATE TABLE pier_strong_policy (id INTEGER PRIMARY KEY CHECK(id=1), required INTEGER NOT NULL DEFAULT 0 CHECK(required IN (0,1)));
INSERT INTO pier_strong_policy(id,required) VALUES(1,0);
CREATE TABLE pier_strong_users (operator_id TEXT PRIMARY KEY, generation INTEGER NOT NULL DEFAULT 1, restore_paused INTEGER NOT NULL DEFAULT 0);
CREATE TABLE pier_strong_factors (operator_id TEXT PRIMARY KEY, secret TEXT NOT NULL, generation INTEGER NOT NULL, confirmed INTEGER NOT NULL DEFAULT 0, enrollment_session TEXT NOT NULL, expires_at INTEGER NOT NULL, used_step INTEGER NOT NULL DEFAULT -1);
CREATE TABLE pier_strong_proofs (session_id TEXT PRIMARY KEY, operator_id TEXT NOT NULL, generation INTEGER NOT NULL, verified_at INTEGER NOT NULL);
CREATE TABLE pier_strong_attempts (operator_id TEXT PRIMARY KEY, window INTEGER NOT NULL, attempts INTEGER NOT NULL);
CREATE TABLE pier_strong_audit (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, target_id TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL);
