-- Additive tenant hardening. No application records are deleted or rewritten.
ALTER TABLE company_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE scenarios FORCE ROW LEVEL SECURITY;
ALTER TABLE assessments FORCE ROW LEVEL SECURITY;
ALTER TABLE findings FORCE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE review_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE project_activity FORCE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;

CREATE VIEW account_public AS SELECT id, name, email FROM "user";
REVOKE ALL ON account_public FROM PUBLIC;

DO $$
DECLARE
 runtime_role text := current_database() || '_runtime';
 auth_role text := current_database() || '_auth';
 auth_tables text[] := ARRAY['user','session','account','verification','rateLimit'];
 domain_tables text[] := ARRAY['organizations','organization_workspaces','memberships','invitations','join_requests','projects','audit_logs','request_limits','subscriptions','contract_acceptances','enterprise_requests','payment_events','company_profiles','scenarios','assessments','findings','tasks','review_jobs','project_activity','documents'];
 table_name text;
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=runtime_role) THEN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=runtime_role AND (rolsuper OR rolbypassrls)) THEN
   RAISE EXCEPTION 'Runtime role must not be superuser or bypass RLS';
  END IF;
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',runtime_role);
  FOREACH table_name IN ARRAY domain_tables LOOP
   EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO %I',table_name,runtime_role);
  END LOOP;
  FOREACH table_name IN ARRAY auth_tables LOOP
   EXECUTE format('REVOKE ALL ON TABLE %I FROM %I',table_name,runtime_role);
  END LOOP;
  EXECUTE format('GRANT SELECT ON account_public TO %I',runtime_role);
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=auth_role) THEN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=auth_role AND (rolsuper OR rolbypassrls)) THEN
   RAISE EXCEPTION 'Auth role must not be superuser or bypass RLS';
  END IF;
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',auth_role);
  FOREACH table_name IN ARRAY auth_tables LOOP
   EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO %I',table_name,auth_role);
  END LOOP;
  FOREACH table_name IN ARRAY domain_tables LOOP
   EXECUTE format('REVOKE ALL ON TABLE %I FROM %I',table_name,auth_role);
  END LOOP;
  EXECUTE format('REVOKE ALL ON account_public FROM %I',auth_role);
 END IF;
END $$;
