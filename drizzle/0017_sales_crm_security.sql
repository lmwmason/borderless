-- Additive hardening: company-facing enterprise rows keep their existing
-- application authorization while internal CRM rows and delivery state are private.
ALTER TABLE platform_operator_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE sales_inquiry_notes FORCE ROW LEVEL SECURITY;
ALTER TABLE sales_inquiry_activity FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_outbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON platform_operator_grants,sales_inquiry_notes,sales_inquiry_activity,notification_outbox FROM PUBLIC;
UPDATE enterprise_requests SET updated_at=coalesce(reviewed_at,created_at);
DO $$
DECLARE runtime_role text:=current_database()||'_runtime';auth_role text:=current_database()||'_auth';
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=runtime_role) THEN
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON platform_operator_grants,notification_outbox TO %I',runtime_role);
  EXECUTE format('GRANT SELECT,INSERT ON sales_inquiry_notes,sales_inquiry_activity TO %I',runtime_role);
  EXECUTE format('REVOKE UPDATE,DELETE ON sales_inquiry_notes,sales_inquiry_activity FROM %I',runtime_role);
  EXECUTE format('REVOKE DELETE ON platform_operator_grants,notification_outbox,enterprise_requests FROM %I',runtime_role);
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=auth_role) THEN
  EXECUTE format('REVOKE ALL ON platform_operator_grants,sales_inquiry_notes,sales_inquiry_activity,notification_outbox FROM %I',auth_role);
 END IF;
END $$;

-- A real inquiry INSERT, including its initial CRM state, is recorded atomically.
-- No inferred legacy timeline, entitlement change, email or notification send.
CREATE FUNCTION public.record_sales_inquiry_created() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO public.sales_inquiry_activity(id,inquiry_id,actor_id,action,detail,created_at)
 VALUES('created:'||NEW.id,NEW.id,NEW.requested_by,'sales.inquiry_created',
 jsonb_build_object('salesStatus',NEW.sales_status,'legacyStatus',NEW.status,'subscriptionActivated',false,'contractExecuted',false),NEW.created_at);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_sales_inquiry_created() FROM PUBLIC;
CREATE TRIGGER sales_inquiry_created AFTER INSERT ON enterprise_requests
FOR EACH ROW EXECUTE FUNCTION public.record_sales_inquiry_created();
