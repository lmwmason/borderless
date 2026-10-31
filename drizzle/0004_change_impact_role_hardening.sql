-- Additive isolation/grants for regulatory change review records.
ALTER TABLE change_impacts FORCE ROW LEVEL SECURITY;
DO $$
DECLARE
 runtime_role text := current_database() || '_runtime';
 auth_role text := current_database() || '_auth';
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=runtime_role) THEN
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON change_impacts TO %I',runtime_role);
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=auth_role) THEN
  EXECUTE format('REVOKE ALL ON change_impacts FROM %I',auth_role);
 END IF;
END $$;
