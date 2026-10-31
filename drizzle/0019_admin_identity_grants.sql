-- Separate identity marker is accessible only to the identity role. Runtime
-- receives a sanitized active-administrator directory, never account hashes.
CREATE VIEW admin_directory WITH (security_barrier=true) AS
 SELECT u.id,u.name,u.email FROM admin_accounts a JOIN "user" u ON u.id=a.user_id
 WHERE a.enabled AND (NOT a.is_demo OR current_setting('borderless.admin_demo_allowed',true)='on');
CREATE OR REPLACE VIEW account_public AS SELECT id,name,email,"createdAt" AS created_at FROM "user";
REVOKE ALL ON admin_accounts,admin_directory FROM PUBLIC;
DO $$
DECLARE runtime_role text:=current_database()||'_runtime';auth_role text:=current_database()||'_auth';
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=runtime_role) THEN
  EXECUTE format('REVOKE ALL ON admin_accounts FROM %I',runtime_role);
  EXECUTE format('GRANT SELECT ON admin_directory,account_public TO %I',runtime_role);
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=auth_role) THEN
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON admin_accounts TO %I',auth_role);
  EXECUTE format('REVOKE ALL ON admin_directory FROM %I',auth_role);
 END IF;
END $$;
