CREATE TABLE "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"locale" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preference_locale_check" CHECK ("user_preferences"."locale" in ('ko','en'))
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "user_preference_owner" ON "user_preferences" AS PERMISSIVE FOR ALL TO public USING ("user_preferences"."user_id"=current_setting('borderless.user_id',true)) WITH CHECK ("user_preferences"."user_id"=current_setting('borderless.user_id',true));
--> statement-breakpoint
ALTER TABLE user_preferences FORCE ROW LEVEL SECURITY;
REVOKE ALL ON user_preferences FROM PUBLIC;
DO $$ DECLARE runtime_role text:=current_database()||'_runtime'; auth_role text:=current_database()||'_auth'; BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=runtime_role) THEN EXECUTE format('GRANT SELECT,INSERT,UPDATE ON user_preferences TO %I',runtime_role); END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=auth_role) THEN EXECUTE format('REVOKE ALL ON user_preferences FROM %I',auth_role); END IF;
END $$;

--> statement-breakpoint
CREATE OR REPLACE VIEW expert_directory WITH (security_barrier=true) AS
SELECT p.id,p.user_id,p.status,
 coalesce((SELECT jsonb_object_agg(key,value) FROM jsonb_each(p.public_payload) WHERE key IN ('displayName','photoUrl','bio','specialties','regions','credentialType','licenseIssuer','licenseJurisdiction','licenseNumberPublic','education','experience','affiliation','languages','available','residenceCountry','qualificationCountry','licensedJurisdictions','serviceCountries','consultationModes','originalLanguage')),'{}'::jsonb)
 || jsonb_build_object('localizedContent',coalesce((SELECT jsonb_object_agg(locale,coalesce((SELECT jsonb_object_agg(key,value) FROM jsonb_each(CASE WHEN jsonb_typeof(texts)='object' THEN texts ELSE '{}'::jsonb END) WHERE key IN ('bio','specialtiesDescription','experience','portfolioDescription') AND jsonb_typeof(value)='string'),'{}'::jsonb)) FROM jsonb_each(CASE WHEN jsonb_typeof(p.public_payload->'localizedContent')='object' THEN p.public_payload->'localizedContent' ELSE '{}'::jsonb END) AS content(locale,texts) WHERE locale IN ('en','ko') AND jsonb_typeof(texts)='object'),'{}'::jsonb))
 || jsonb_build_object('id',p.id,'status',p.status,'visibility',p.visibility,'updatedAt',p.updated_at,
  'portfolio',coalesce((SELECT jsonb_agg(jsonb_build_object('title',item->'title','url',item->'url','visibility','public')) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p.public_payload->'portfolio')='array' THEN p.public_payload->'portfolio' ELSE '[]'::jsonb END) AS item WHERE item->>'visibility'='public'),'[]'::jsonb),
  'resume',CASE WHEN p.public_payload->'resume'->>'visibility'='public' THEN jsonb_build_object('text',p.public_payload->'resume'->'text','url',p.public_payload->'resume'->'url','visibility','public') ELSE '{"text":"","url":"","visibility":"private"}'::jsonb END)
 || CASE WHEN p.public_payload->>'licenseNumberPublic'='true' THEN jsonb_build_object('licenseNumber',p.public_payload->'licenseNumber') ELSE '{}'::jsonb END AS payload
FROM expert_profiles p
WHERE p.visibility='public' AND p.status IN ('Pending Verification','Verified') AND p.public_payload IS NOT NULL;

CREATE OR REPLACE VIEW expert_service_directory WITH (security_barrier=true) AS
SELECT s.id,s.expert_id,
 coalesce((SELECT jsonb_object_agg(key,value) FROM jsonb_each(s.public_payload) WHERE key IN ('title','description','scope','serviceType','pricingType','priceMinor','currency','estimatedTime','conditions','originalLanguage')),'{}'::jsonb)
 || jsonb_build_object('localizedContent',coalesce((SELECT jsonb_object_agg(locale,coalesce((SELECT jsonb_object_agg(key,value) FROM jsonb_each(CASE WHEN jsonb_typeof(texts)='object' THEN texts ELSE '{}'::jsonb END) WHERE key IN ('description','scope','conditions') AND jsonb_typeof(value)='string'),'{}'::jsonb)) FROM jsonb_each(CASE WHEN jsonb_typeof(s.public_payload->'localizedContent')='object' THEN s.public_payload->'localizedContent' ELSE '{}'::jsonb END) AS content(locale,texts) WHERE locale IN ('en','ko') AND jsonb_typeof(texts)='object'),'{}'::jsonb))
 || jsonb_build_object('id',s.id,'expertId',s.expert_id,'published',true) AS payload
FROM expert_services s JOIN expert_profiles p ON p.id=s.expert_id
WHERE s.published=true AND s.public_payload IS NOT NULL AND p.visibility='public' AND p.status IN ('Pending Verification','Verified');

