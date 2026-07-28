CREATE EXTENSION IF NOT EXISTS pgcrypto;
SET search_path TO hyfit_ops,public;

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  venue text NOT NULL DEFAULT '',
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready','live','closed','archived')),
  is_active boolean NOT NULL DEFAULT false,
  config_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_event ON events(is_active) WHERE is_active;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id text NOT NULL UNIQUE,
  name text NOT NULL,
  pin_hash text NOT NULL,
  role text NOT NULL CHECK(role IN ('super_admin','event_admin','checkin','judge','readonly')),
  event_id uuid REFERENCES events(id),
  station_number integer,
  enabled boolean NOT NULL DEFAULT true,
  must_change_pin boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  device_label text,
  ip_address text,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  version integer NOT NULL,
  state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','published','retired')),
  participant_api_url text NOT NULL DEFAULT '',
  update_api_url text NOT NULL DEFAULT '',
  participant_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  update_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  published_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id,version)
);

CREATE TABLE IF NOT EXISTS participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  source_id text,
  bib text NOT NULL CHECK(bib ~ '^[0-9]+$'),
  name text NOT NULL,
  category text NOT NULL DEFAULT '',
  wave text NOT NULL DEFAULT '',
  source_status text NOT NULL DEFAULT '',
  source_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  checkin_state text NOT NULL DEFAULT 'not_checked_in' CHECK(checkin_state IN ('not_checked_in','checked_in','pending_sync','conflict')),
  last_source_sync_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id,bib)
);

CREATE TABLE IF NOT EXISTS checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id),
  participant_id uuid NOT NULL REFERENCES participants(id),
  volunteer_id uuid NOT NULL REFERENCES users(id),
  desk text,
  state text NOT NULL CHECK(state IN ('complete','pending_sync','conflict','reversed')),
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS asset_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id),
  participant_id uuid NOT NULL REFERENCES participants(id),
  asset_type text NOT NULL CHECK(asset_type IN ('wristband','transponder1')),
  asset_code text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  assigned_by uuid NOT NULL REFERENCES users(id),
  replaced_assignment_id uuid REFERENCES asset_assignments(id),
  reason text,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_asset_code ON asset_assignments(event_id,asset_type,asset_code) WHERE active;
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_participant_asset ON asset_assignments(event_id,participant_id,asset_type) WHERE active;

CREATE TABLE IF NOT EXISTS race_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id),
  participant_id uuid NOT NULL REFERENCES participants(id),
  judge_id uuid NOT NULL REFERENCES users(id),
  config_version integer NOT NULL,
  state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','finished','cancelled')),
  current_station integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_participant_race ON race_sessions(event_id,participant_id) WHERE state='active';

CREATE TABLE IF NOT EXISTS penalty_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id text NOT NULL UNIQUE,
  event_id uuid NOT NULL REFERENCES events(id),
  race_session_id uuid NOT NULL REFERENCES race_sessions(id),
  participant_id uuid NOT NULL REFERENCES participants(id),
  judge_id uuid NOT NULL REFERENCES users(id),
  field_name text NOT NULL,
  value integer NOT NULL CHECK(value>=0),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outbox_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_key text NOT NULL UNIQUE,
  event_id uuid NOT NULL REFERENCES events(id),
  participant_id uuid REFERENCES participants(id),
  bib text NOT NULL,
  field_name text NOT NULL,
  value text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','confirmed','failed','conflict')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbox_pending ON outbox_operations(state,next_attempt_at);

CREATE TABLE IF NOT EXISTS sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id),
  kind text NOT NULL,
  state text NOT NULL,
  imported_count integer NOT NULL DEFAULT 0,
  rejected_count integer NOT NULL DEFAULT 0,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS audit_events (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id),
  event_id uuid REFERENCES events(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_event_time ON audit_events(event_id,created_at DESC);
