-- Business correspondence remains in immutable approved Pier records. This
-- ledger contains submission metadata only; it is not an inbox or mail outbox.
CREATE TABLE pier_mail_deliveries (
  correspondence_id TEXT PRIMARY KEY NOT NULL,
  phase TEXT NOT NULL CHECK(phase IN ('sending','sent','failed','uncertain','unavailable','revoked')),
  provider_message_id TEXT,
  error TEXT,
  at TEXT NOT NULL
);
CREATE INDEX pier_mail_deliveries_phase ON pier_mail_deliveries(phase,at);
