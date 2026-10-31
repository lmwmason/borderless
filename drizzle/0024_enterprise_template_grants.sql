ALTER TABLE enterprise_contract_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE enterprise_contract_template_versions FORCE ROW LEVEL SECURITY;
DO $$
DECLARE runtime_role text:=current_database()||'_runtime';auth_role text:=current_database()||'_auth';
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=runtime_role) THEN
  EXECUTE format('GRANT SELECT,INSERT ON enterprise_contract_templates,enterprise_contract_template_versions TO %I',runtime_role);
  EXECUTE format('GRANT UPDATE(name,current_version,status,updated_at) ON enterprise_contract_templates TO %I',runtime_role);
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=auth_role) THEN
  EXECUTE format('REVOKE ALL ON enterprise_contract_templates,enterprise_contract_template_versions FROM %I',auth_role);
 END IF;
END $$;
