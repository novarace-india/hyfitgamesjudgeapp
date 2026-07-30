SET search_path TO hyfit_ops,public;

ALTER TABLE race_sessions
  ADD COLUMN IF NOT EXISTS race_mode text NOT NULL DEFAULT 'single'
  CHECK(race_mode IN ('single','doubles'));
ALTER TABLE race_sessions ADD COLUMN IF NOT EXISTS team_club_snapshot text NOT NULL DEFAULT '';
ALTER TABLE race_sessions ADD COLUMN IF NOT EXISTS team_contest_id_snapshot text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS race_session_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_session_id uuid NOT NULL REFERENCES race_sessions(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id),
  participant_id uuid NOT NULL REFERENCES participants(id),
  display_order integer NOT NULL CHECK(display_order IN (1,2)),
  participant_bib_snapshot text NOT NULL,
  participant_name_snapshot text NOT NULL,
  contest_id_snapshot text NOT NULL DEFAULT '',
  contest_snapshot text NOT NULL DEFAULT '',
  club_snapshot text NOT NULL DEFAULT '',
  wristband_code_snapshot text NOT NULL DEFAULT '',
  transponder_code_snapshot text NOT NULL DEFAULT '',
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(race_session_id,participant_id),
  UNIQUE(race_session_id,display_order)
);

INSERT INTO race_session_participants(
  race_session_id,event_id,participant_id,display_order,
  participant_bib_snapshot,participant_name_snapshot,contest_id_snapshot,
  contest_snapshot,club_snapshot,released_at
)
SELECT r.id,r.event_id,p.id,1,p.bib,p.name,COALESCE(p.contest_id,''),
  p.category,COALESCE(p.club,''),CASE WHEN r.state='active' THEN NULL ELSE r.finished_at END
FROM race_sessions r JOIN participants p ON p.id=r.participant_id
ON CONFLICT(race_session_id,participant_id) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS unique_active_race_session_participant
  ON race_session_participants(event_id,participant_id) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS race_session_participants_session
  ON race_session_participants(race_session_id,display_order);
