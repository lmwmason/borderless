ALTER TABLE enterprise_contracts FORCE ROW LEVEL SECURITY;
ALTER TABLE enterprise_contract_proposals FORCE ROW LEVEL SECURITY;
ALTER TABLE entitlement_usage FORCE ROW LEVEL SECURITY;
DO $$
DECLARE runtime_role text:=current_database()||'_runtime';auth_role text:=current_database()||'_auth';
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=runtime_role) THEN
  EXECUTE format('GRANT SELECT,INSERT ON enterprise_contracts,enterprise_contract_proposals,entitlement_usage TO %I',runtime_role);
  EXECUTE format('GRANT UPDATE(status,updated_at) ON enterprise_contracts TO %I',runtime_role);
  EXECUTE format('GRANT UPDATE(approved_at) ON enterprise_contract_proposals TO %I',runtime_role);
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=auth_role) THEN
  EXECUTE format('REVOKE ALL ON enterprise_contracts,enterprise_contract_proposals,entitlement_usage FROM %I',auth_role);
 END IF;
END $$;
