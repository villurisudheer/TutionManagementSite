-- Run once in the Supabase SQL editor; safe to rerun. No existing academy data is replaced.
CREATE TABLE IF NOT EXISTS public.aacharya_cloud_state (
 id text PRIMARY KEY CHECK(id='academy'), owner uuid, generation bigint NOT NULL DEFAULT 0,
 revision bigint NOT NULL DEFAULT 1, commit_id uuid NOT NULL UNIQUE, payload jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.aacharya_cloud_history (
 revision bigint PRIMARY KEY, commit_id uuid NOT NULL UNIQUE, payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.aacharya_cloud_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aacharya_cloud_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aacharya_cloud_state,public.aacharya_cloud_history FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.aacharya_cloud_state,public.aacharya_cloud_history TO service_role;
CREATE OR REPLACE FUNCTION public.aacharya_cloud_initialize(p_payload jsonb,p_commit uuid)
RETURNS SETOF public.aacharya_cloud_state LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NOT (p_payload ?& array['database','sha256','files','counts']) THEN RAISE EXCEPTION 'INVALID_SNAPSHOT'; END IF;
 INSERT INTO aacharya_cloud_state(id,commit_id,payload) VALUES('academy',p_commit,p_payload);
 INSERT INTO aacharya_cloud_history VALUES(1,p_commit,p_payload,now());
 RETURN QUERY SELECT * FROM aacharya_cloud_state WHERE id='academy';
END $$;
CREATE OR REPLACE FUNCTION public.aacharya_cloud_claim(p_owner uuid)
RETURNS SETOF public.aacharya_cloud_state LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 UPDATE aacharya_cloud_state SET owner=p_owner,generation=generation+1 WHERE id='academy';
 IF NOT FOUND THEN RAISE EXCEPTION 'CLOUD_NOT_INITIALIZED'; END IF;
 RETURN QUERY SELECT * FROM aacharya_cloud_state WHERE id='academy';
END $$;
CREATE OR REPLACE FUNCTION public.aacharya_cloud_commit(p_owner uuid,p_generation bigint,p_revision bigint,p_commit uuid,p_payload jsonb)
RETURNS SETOF public.aacharya_cloud_state LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE s aacharya_cloud_state;
BEGIN
 SELECT * INTO s FROM aacharya_cloud_state WHERE id='academy' FOR UPDATE;
 IF s.owner IS DISTINCT FROM p_owner OR s.generation IS DISTINCT FROM p_generation THEN RAISE EXCEPTION 'CLOUD_OWNER_CHANGED'; END IF;
 IF s.commit_id=p_commit THEN RETURN NEXT s; RETURN; END IF;
 IF s.revision<>p_revision THEN RAISE EXCEPTION 'CLOUD_REVISION_CHANGED'; END IF;
 IF NOT (p_payload ?& array['database','sha256','files','counts']) THEN RAISE EXCEPTION 'INVALID_SNAPSHOT'; END IF;
 UPDATE aacharya_cloud_state SET revision=revision+1,commit_id=p_commit,payload=p_payload,updated_at=now() WHERE id='academy' RETURNING * INTO s;
 INSERT INTO aacharya_cloud_history VALUES(s.revision,p_commit,p_payload,now());
 DELETE FROM aacharya_cloud_history WHERE revision<>1 AND revision<s.revision-19;
 RETURN NEXT s;
END $$;
REVOKE ALL ON FUNCTION public.aacharya_cloud_initialize(jsonb,uuid),public.aacharya_cloud_claim(uuid),public.aacharya_cloud_commit(uuid,bigint,bigint,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aacharya_cloud_initialize(jsonb,uuid),public.aacharya_cloud_claim(uuid),public.aacharya_cloud_commit(uuid,bigint,bigint,uuid,jsonb) TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit) VALUES('aacharya-private','aacharya-private',false,52428800) ON CONFLICT(id) DO NOTHING;
