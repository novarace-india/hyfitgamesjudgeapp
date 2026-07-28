SET search_path TO hyfit_ops,public;

CREATE TABLE IF NOT EXISTS checkin_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id),
  code text NOT NULL,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS unique_checkin_station_code
  ON checkin_stations(event_id,lower(code));

CREATE TABLE IF NOT EXISTS checkin_station_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id),
  station_id uuid NOT NULL REFERENCES checkin_stations(id),
  volunteer_id uuid NOT NULL REFERENCES users(id),
  assigned_by uuid NOT NULL REFERENCES users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  release_reason text
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_checkin_station_per_volunteer
  ON checkin_station_assignments(event_id,volunteer_id) WHERE released_at IS NULL;

ALTER TABLE checkins ADD COLUMN IF NOT EXISTS station_id uuid REFERENCES checkin_stations(id);
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS station_assignment_id uuid REFERENCES checkin_station_assignments(id);
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES sessions(id);
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS transaction_id text;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS participant_bib_snapshot text;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS participant_name_snapshot text;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS volunteer_staff_id_snapshot text;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS volunteer_name_snapshot text;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS station_code_snapshot text;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS station_name_snapshot text;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS wristband_code_snapshot text;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS transponder1_code_snapshot text;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS device_label_snapshot text;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS source_ip_snapshot text;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS client_observed_at timestamptz;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS event_timezone_snapshot text;

CREATE UNIQUE INDEX IF NOT EXISTS unique_checkin_transaction
  ON checkins(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS unique_checkin_idempotency
  ON checkins(event_id,volunteer_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
