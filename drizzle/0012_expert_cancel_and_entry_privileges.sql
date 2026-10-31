-- Author/scope/kind columns are immutable after insert; only task payloads
-- may be changed, under the task-only update policy and service status guard.
DO $$
DECLARE runtime_role text:=current_database()||'_runtime';
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=runtime_role) THEN
  EXECUTE format('REVOKE UPDATE,DELETE ON engagement_entries FROM %I',runtime_role);
  EXECUTE format('GRANT UPDATE(payload) ON engagement_entries TO %I',runtime_role);
 END IF;
END $$;

-- PostgreSQL applies SELECT new-row checks to ordinary UPDATE, so changing a
-- visible assignment to a hidden canceled row uses one narrow trusted function.
-- It cannot read or return private payloads or accept arbitrary field updates.
CREATE FUNCTION public.cancel_assigned_engagement(target_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE actor text:=current_setting('borderless.user_id',true);changed integer;
BEGIN
 IF actor IS NULL OR actor='' THEN RETURN false; END IF;
 UPDATE public.engagements e
 SET status='Canceled',revoked_at=now(),updated_at=now(),
 payload=e.payload || jsonb_build_object('status','Canceled','revokedAt',now(),'updatedAt',now())
 WHERE e.id=target_id AND e.expert_user_id=actor
 AND e.status IN ('Submitted','Accepted','Agreement Pending','Active')
 AND e.revoked_at IS NULL AND (e.access_expires_at IS NULL OR e.access_expires_at>now())
 AND EXISTS(SELECT 1 FROM public.expert_profiles p WHERE p.id=e.expert_id AND p.user_id=actor AND p.status IN ('Pending Verification','Verified'));
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed=1;
END $$;
REVOKE ALL ON FUNCTION public.cancel_assigned_engagement(text) FROM PUBLIC;
DO $$
DECLARE runtime_role text:=current_database()||'_runtime';auth_role text:=current_database()||'_auth';
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=runtime_role) THEN
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.cancel_assigned_engagement(text) TO %I',runtime_role);
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=auth_role) THEN
  EXECUTE format('REVOKE ALL ON FUNCTION public.cancel_assigned_engagement(text) FROM %I',auth_role);
 END IF;
END $$;
