SET search_path TO hyfit_ops,public;

ALTER TABLE checkin_stations
  ADD COLUMN IF NOT EXISTS stage_type text NOT NULL DEFAULT 'STAGE_1_WRISTBAND'
  CHECK(stage_type IN ('STAGE_1_WRISTBAND','STAGE_2_TRANSPONDER'));

ALTER TABLE participants ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT '';
ALTER TABLE participants ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS club text NOT NULL DEFAULT '';

ALTER TABLE event_configs
  ADD COLUMN IF NOT EXISTS require_participant_photo boolean NOT NULL DEFAULT false;
ALTER TABLE event_configs
  ADD COLUMN IF NOT EXISTS require_declaratory_signature boolean NOT NULL DEFAULT false;
ALTER TABLE event_configs
  ADD COLUMN IF NOT EXISTS declaration_text text NOT NULL DEFAULT
    'I confirm that my participant details are correct and that I have received the assigned race equipment.';
ALTER TABLE event_configs
  ADD COLUMN IF NOT EXISTS declaration_version integer NOT NULL DEFAULT 1;
ALTER TABLE event_configs
  ADD COLUMN IF NOT EXISTS media_retention_days integer NOT NULL DEFAULT 30
  CHECK(media_retention_days BETWEEN 1 AND 365);

UPDATE event_configs
SET update_mapping=jsonb_build_object(
  'stage1checkin','stage1checkin',
  'stage1checkintime','stage1checkintime',
  'wristband','wristbandID',
  'stage2checkin','stage2checkin',
  'stage2checkintime','stage2checkintime',
  'transponder1','Transponder1'
)
WHERE update_mapping->>'checkinStatus'='checkinstatus'
  AND update_mapping->>'wristband'='wristbandid'
  AND update_mapping->>'transponder1'='Transponder1'
  AND (SELECT count(*) FROM jsonb_object_keys(update_mapping))=3;

CREATE TABLE IF NOT EXISTS checkin_stage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id text NOT NULL UNIQUE,
  idempotency_key text NOT NULL,
  event_id uuid NOT NULL REFERENCES events(id),
  participant_id uuid NOT NULL REFERENCES participants(id),
  stage_type text NOT NULL CHECK(stage_type IN ('STAGE_1_WRISTBAND','STAGE_2_TRANSPONDER')),
  state text NOT NULL DEFAULT 'pending_sync'
    CHECK(state IN ('pending_sync','completed','attention','reversed')),
  volunteer_id uuid NOT NULL REFERENCES users(id),
  station_id uuid NOT NULL REFERENCES checkin_stations(id),
  station_assignment_id uuid REFERENCES checkin_station_assignments(id),
  session_id uuid REFERENCES sessions(id),
  participant_bib_snapshot text NOT NULL,
  participant_name_snapshot text NOT NULL,
  gender_snapshot text NOT NULL DEFAULT '',
  date_of_birth_snapshot date,
  contest_snapshot text NOT NULL DEFAULT '',
  wave_snapshot text NOT NULL DEFAULT '',
  club_snapshot text NOT NULL DEFAULT '',
  volunteer_staff_id_snapshot text NOT NULL,
  volunteer_name_snapshot text NOT NULL,
  station_code_snapshot text NOT NULL,
  station_name_snapshot text NOT NULL,
  asset_code_snapshot text NOT NULL,
  government_id_verified boolean NOT NULL DEFAULT false,
  declaration_text_snapshot text NOT NULL DEFAULT '',
  declaration_version_snapshot integer,
  verbal_declaration_accepted boolean NOT NULL DEFAULT false,
  photo_media_id uuid,
  signature_media_id uuid,
  device_label_snapshot text,
  source_ip_snapshot text,
  client_observed_at timestamptz,
  event_timezone_snapshot text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id,volunteer_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS checkin_stage_records_participant
  ON checkin_stage_records(event_id,participant_id,stage_type);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_participant_checkin_stage
  ON checkin_stage_records(event_id,participant_id,stage_type) WHERE state<>'reversed';

CREATE TABLE IF NOT EXISTS checkin_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id),
  participant_id uuid NOT NULL REFERENCES participants(id),
  transaction_id text NOT NULL,
  media_type text NOT NULL CHECK(media_type IN ('participant_photo','signature')),
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  checksum_sha256 text NOT NULL,
  byte_size integer NOT NULL CHECK(byte_size > 0),
  width integer,
  height integer,
  captured_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  deleted_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS checkin_media_expiry
  ON checkin_media(expires_at) WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='checkin_stage_photo_media_fk'
  ) THEN
    ALTER TABLE checkin_stage_records
      ADD CONSTRAINT checkin_stage_photo_media_fk FOREIGN KEY(photo_media_id) REFERENCES checkin_media(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='checkin_stage_signature_media_fk'
  ) THEN
    ALTER TABLE checkin_stage_records
      ADD CONSTRAINT checkin_stage_signature_media_fk FOREIGN KEY(signature_media_id) REFERENCES checkin_media(id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS checkin_identity_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id),
  participant_id uuid NOT NULL REFERENCES participants(id),
  volunteer_id uuid NOT NULL REFERENCES users(id),
  station_id uuid NOT NULL REFERENCES checkin_stations(id),
  reason text NOT NULL,
  note text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','overridden','rejected')),
  resolved_by uuid REFERENCES users(id),
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
