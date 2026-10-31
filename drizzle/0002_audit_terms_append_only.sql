-- Preserve records and tighten application privileges only.
DO $$
DECLARE runtime_role text := current_database() || '_runtime';
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=runtime_role) THEN
  EXECUTE format('REVOKE UPDATE, DELETE ON audit_logs, contract_acceptances FROM %I',runtime_role);
 END IF;
END $$;
