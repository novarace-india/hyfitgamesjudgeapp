SET search_path TO hyfit_ops,public;

CREATE UNIQUE INDEX IF NOT EXISTS one_running_participant_sync
  ON sync_runs(event_id,kind)
  WHERE state='running' AND kind='participants';
