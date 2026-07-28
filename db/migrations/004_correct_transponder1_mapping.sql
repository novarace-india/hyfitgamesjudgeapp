SET search_path TO hyfit_ops,public;

UPDATE event_configs
SET update_mapping = jsonb_set(update_mapping,'{transponder1}','"Transponder1"'::jsonb)
WHERE update_mapping->>'transponder1' = 'transponder1';
