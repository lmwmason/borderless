-- Private expert data remains actor-scoped. These security-barrier views run
-- with the migration owner's documented BYPASSRLS context and expose a fixed
-- public field allowlist, never arbitrary private JSON or verification records.
ALTER TABLE expert_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE expert_services FORCE ROW LEVEL SECURITY;
ALTER TABLE engagements FORCE ROW LEVEL SECURITY;
ALTER TABLE engagement_resources FORCE ROW LEVEL SECURITY;
ALTER TABLE engagement_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE engagement_events FORCE ROW LEVEL SECURITY;

CREATE VIEW expert_directory WITH (security_barrier=true) AS
SELECT p.id,p.user_id,p.status,
 coalesce((SELECT jsonb_object_agg(key,value) FROM jsonb_each(p.public_payload) WHERE key IN ('displayName','photoUrl','bio','specialties','regions','credentialType','licenseIssuer','licenseJurisdiction','licenseNumberPublic','education','experience','affiliation','languages','available')),'{}'::jsonb)
 || jsonb_build_object('id',p.id,'status',p.status,'visibility',p.visibility,'updatedAt',p.updated_at,
  'portfolio',coalesce((SELECT jsonb_agg(jsonb_build_object('title',item->'title','url',item->'url','visibility','public')) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p.public_payload->'portfolio')='array' THEN p.public_payload->'portfolio' ELSE '[]'::jsonb END) AS item WHERE item->>'visibility'='public'),'[]'::jsonb),
  'resume',CASE WHEN p.public_payload->'resume'->>'visibility'='public' THEN jsonb_build_object('text',p.public_payload->'resume'->'text','url',p.public_payload->'resume'->'url','visibility','public') ELSE '{"text":"","url":"","visibility":"private"}'::jsonb END)
 || CASE WHEN p.public_payload->>'licenseNumberPublic'='true' THEN jsonb_build_object('licenseNumber',p.public_payload->'licenseNumber') ELSE '{}'::jsonb END AS payload
FROM expert_profiles p
WHERE p.visibility='public' AND p.status IN ('Pending Verification','Verified') AND p.public_payload IS NOT NULL;

CREATE VIEW expert_service_directory WITH (security_barrier=true) AS
SELECT s.id,s.expert_id,
 coalesce((SELECT jsonb_object_agg(key,value) FROM jsonb_each(s.public_payload) WHERE key IN ('title','description','scope','serviceType','pricingType','priceMinor','currency','estimatedTime','conditions')),'{}'::jsonb)
 || jsonb_build_object('id',s.id,'expertId',s.expert_id,'published',true) AS payload
FROM expert_services s JOIN expert_profiles p ON p.id=s.expert_id
WHERE s.published=true AND s.public_payload IS NOT NULL AND p.visibility='public' AND p.status IN ('Pending Verification','Verified');

REVOKE ALL ON expert_directory,expert_service_directory FROM PUBLIC;
DO $$
DECLARE runtime_role text:=current_database()||'_runtime';auth_role text:=current_database()||'_auth';
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=runtime_role) THEN
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON expert_profiles,engagements TO %I',runtime_role);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON expert_services,engagement_resources,engagement_entries TO %I',runtime_role);
  EXECUTE format('GRANT SELECT,INSERT ON engagement_events TO %I',runtime_role);
  EXECUTE format('GRANT SELECT ON expert_directory,expert_service_directory TO %I',runtime_role);
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=auth_role) THEN
  EXECUTE format('REVOKE ALL ON expert_profiles,expert_services,engagements,engagement_resources,engagement_entries,engagement_events,expert_directory,expert_service_directory FROM %I',auth_role);
 END IF;
END $$;
