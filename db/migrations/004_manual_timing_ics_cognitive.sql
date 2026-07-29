SET search_path TO hyfit_ops,public;

ALTER TABLE race_sessions ADD COLUMN IF NOT EXISTS current_stage text NOT NULL DEFAULT 'ready';
ALTER TABLE race_sessions ADD COLUMN IF NOT EXISTS manual_started_at timestamptz;
ALTER TABLE race_sessions ADD COLUMN IF NOT EXISTS cognitive_recall_started_at timestamptz;
ALTER TABLE race_sessions ADD COLUMN IF NOT EXISTS is_ooc boolean NOT NULL DEFAULT false;
ALTER TABLE race_sessions ADD COLUMN IF NOT EXISTS last_action_key text;
ALTER TABLE race_sessions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS race_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_session_id uuid NOT NULL REFERENCES race_sessions(id),
  event_id uuid NOT NULL REFERENCES events(id),
  participant_id uuid NOT NULL REFERENCES participants(id),
  judge_id uuid NOT NULL REFERENCES users(id),
  operation_key text NOT NULL UNIQUE,
  stage_id text NOT NULL,
  stage_name text NOT NULL,
  boundary_at timestamptz NOT NULL,
  client_observed_at timestamptz,
  cumulative_ms bigint NOT NULL CHECK(cumulative_ms>=0),
  segment_ms bigint NOT NULL CHECK(segment_ms>=0),
  revision_state text NOT NULL DEFAULT 'original'
    CHECK(revision_state IN ('original','corrected','revoked')),
  correction_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS race_splits_session_time
  ON race_splits(race_session_id,boundary_at,created_at);

CREATE TABLE IF NOT EXISTS station_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_session_id uuid NOT NULL REFERENCES race_sessions(id),
  event_id uuid NOT NULL REFERENCES events(id),
  participant_id uuid NOT NULL REFERENCES participants(id),
  judge_id uuid NOT NULL REFERENCES users(id),
  operation_key text NOT NULL UNIQUE,
  station_number integer NOT NULL CHECK(station_number BETWEEN 1 AND 6),
  outcome text NOT NULL CHECK(outcome IN ('none','penalty','ics')),
  penalty_seconds integer NOT NULL DEFAULT 0 CHECK(penalty_seconds IN (0,10)),
  note text NOT NULL DEFAULT '',
  split_id uuid NOT NULL REFERENCES race_splits(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS station_outcomes_session
  ON station_outcomes(race_session_id,station_number,created_at);

CREATE TABLE IF NOT EXISTS cognitive_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_session_id uuid NOT NULL REFERENCES race_sessions(id),
  event_id uuid NOT NULL REFERENCES events(id),
  participant_id uuid NOT NULL REFERENCES participants(id),
  judge_id uuid NOT NULL REFERENCES users(id),
  operation_key text NOT NULL UNIQUE,
  sequence jsonb NOT NULL,
  response jsonb NOT NULL,
  tap_observed_at jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_count integer NOT NULL CHECK(correct_count BETWEEN 0 AND 10),
  percentage integer NOT NULL CHECK(percentage BETWEEN 0 AND 100),
  penalty_seconds integer NOT NULL CHECK(penalty_seconds IN (0,30)),
  bonus_seconds integer NOT NULL CHECK(bonus_seconds IN (0,30)),
  recall_started_at timestamptz NOT NULL,
  recall_finished_at timestamptz NOT NULL,
  recall_duration_ms bigint NOT NULL CHECK(recall_duration_ms>=0),
  split_id uuid NOT NULL REFERENCES race_splits(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cognitive_attempts_session
  ON cognitive_attempts(race_session_id,created_at);
