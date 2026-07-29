SET search_path TO hyfit_ops,public;

ALTER TABLE participants ADD COLUMN IF NOT EXISTS contest_id text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS participants_event_contest
  ON participants(event_id,contest_id);
