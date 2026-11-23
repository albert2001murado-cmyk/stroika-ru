-- Installed as postgres, inside the deployment script's transaction.
-- Neither this schema nor the migration archive is exposed through PostgREST.
CREATE SCHEMA IF NOT EXISTS strova_data;
REVOKE ALL ON SCHEMA strova_data FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION strova_data.path_key(value text) RETURNS bytea
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path=pg_catalog AS $$ SELECT sha256(convert_to(value,'UTF8')) $$;
CREATE SEQUENCE IF NOT EXISTS strova_data.document_version;
CREATE TABLE IF NOT EXISTS strova_data.documents (
  path text NOT NULL,
  key bytea GENERATED ALWAYS AS (strova_data.path_key(path)) STORED PRIMARY KEY,
  collection_path text NOT NULL,
  collection_key bytea GENERATED ALWAYS AS (strova_data.path_key(collection_path)) STORED,
  collection_id text NOT NULL,
  body jsonb,
  version bigint NOT NULL DEFAULT nextval('strova_data.document_version'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (body IS NULL OR body->>0 = 'm')
);
CREATE INDEX IF NOT EXISTS documents_collection ON strova_data.documents (collection_key) WHERE body IS NOT NULL;
CREATE INDEX IF NOT EXISTS documents_group ON strova_data.documents (collection_id) WHERE body IS NOT NULL;
CREATE INDEX IF NOT EXISTS documents_path ON strova_data.documents (path COLLATE "C" text_pattern_ops);
CREATE TABLE IF NOT EXISTS strova_data.revisions (key bytea PRIMARY KEY, revision bigint NOT NULL);
CREATE TABLE IF NOT EXISTS strova_data.migration_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  backup_id text NOT NULL, imported_at timestamptz NOT NULL DEFAULT now(),
  source_documents bigint NOT NULL, missing_parents bigint NOT NULL,
  schema_version integer NOT NULL CHECK(schema_version = 1),
  import_version_max bigint NOT NULL,
  import_digest text NOT NULL
);
CREATE OR REPLACE FUNCTION strova_data.field(v jsonb, parts text[]) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
DECLARE part text;
BEGIN
  FOREACH part IN ARRAY parts LOOP
    IF v->>0 IS DISTINCT FROM 'm' THEN RETURN NULL; END IF;
    v := v->1->replace(encode(convert_to(part,'UTF8'),'base64'), E'\n', '');
  END LOOP;
  RETURN v;
END $$;
CREATE OR REPLACE FUNCTION strova_data.cmp(a jsonb, b jsonb) RETURNS integer
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE SET search_path=pg_catalog AS $$
DECLARE ak text:=a->>0; bk text:=b->>0; ar int; br int; av text; bv text;
  an numeric; bn numeric; ab bytea; bb bytea; i int; n int; c int; aa text[]; ba text[];
BEGIN
  ar := array_position(ARRAY['z','b','n','t','s','y','r','g','a','m'],ak);
  br := array_position(ARRAY['z','b','n','t','s','y','r','g','a','m'],bk);
  IF ar IS NULL OR br IS NULL THEN RAISE EXCEPTION 'Invalid stored value'; END IF;
  IF ar<>br THEN RETURN CASE WHEN ar<br THEN -1 ELSE 1 END; END IF;
  IF ak='z' THEN RETURN 0;
  ELSIF ak='n' THEN
    av:=a->>1; bv:=b->>1;
    IF av='NaN' OR bv='NaN' THEN RETURN CASE WHEN av=bv THEN 0 WHEN av='NaN' THEN -1 ELSE 1 END; END IF;
    an:=av::numeric; bn:=bv::numeric;
    RETURN CASE WHEN an<bn THEN -1 WHEN an>bn THEN 1 ELSE 0 END;
  ELSIF ak='b' THEN
    RETURN CASE WHEN a->1=b->1 THEN 0 WHEN a->>1='false' THEN -1 ELSE 1 END;
  ELSIF ak IN ('s','y') THEN
    ab:=decode(a->>1,'base64'); bb:=decode(b->>1,'base64');
    RETURN CASE WHEN ab<bb THEN -1 WHEN ab>bb THEN 1 ELSE 0 END;
  ELSIF ak IN ('t','g') THEN
    FOR i IN 0..1 LOOP
      an:=(a->1->>i)::numeric; bn:=(b->1->>i)::numeric;
      IF an<>bn THEN RETURN CASE WHEN an<bn THEN -1 ELSE 1 END; END IF;
    END LOOP;
    RETURN 0;
  ELSIF ak IN ('a','r') THEN
    n:=least(jsonb_array_length(a->1),jsonb_array_length(b->1));
    IF n>0 THEN FOR i IN 0..n-1 LOOP
      IF ak='a' THEN c:=strova_data.cmp(a->1->i,b->1->i);
      ELSE ab:=decode(a->1->>i,'base64'); bb:=decode(b->1->>i,'base64'); c:=CASE WHEN ab<bb THEN -1 WHEN ab>bb THEN 1 ELSE 0 END;
      END IF;
      IF c<>0 THEN RETURN c; END IF;
    END LOOP; END IF;
    RETURN CASE WHEN jsonb_array_length(a->1)<jsonb_array_length(b->1) THEN -1 WHEN jsonb_array_length(a->1)>jsonb_array_length(b->1) THEN 1 ELSE 0 END;
  ELSE
    SELECT array_agg(k ORDER BY decode(k,'base64')) INTO aa FROM jsonb_object_keys(a->1) AS k;
    SELECT array_agg(k ORDER BY decode(k,'base64')) INTO ba FROM jsonb_object_keys(b->1) AS k;
    n:=least(coalesce(array_length(aa,1),0),coalesce(array_length(ba,1),0));
    IF n>0 THEN FOR i IN 1..n LOOP
      ab:=decode(aa[i],'base64'); bb:=decode(ba[i],'base64');
      IF ab<>bb THEN RETURN CASE WHEN ab<bb THEN -1 ELSE 1 END; END IF;
      c:=strova_data.cmp(a->1->aa[i],b->1->ba[i]); IF c<>0 THEN RETURN c; END IF;
    END LOOP; END IF;
    RETURN CASE WHEN coalesce(array_length(aa,1),0)<coalesce(array_length(ba,1),0) THEN -1 WHEN coalesce(array_length(aa,1),0)>coalesce(array_length(ba,1),0) THEN 1 ELSE 0 END;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION strova_data.lt(a jsonb,b jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE SET search_path=pg_catalog AS $$ BEGIN RETURN strova_data.cmp(a,b)<0; END $$;
CREATE OR REPLACE FUNCTION strova_data.le(a jsonb,b jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE SET search_path=pg_catalog AS $$ BEGIN RETURN strova_data.cmp(a,b)<=0; END $$;
CREATE OR REPLACE FUNCTION strova_data.eq(a jsonb,b jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE SET search_path=pg_catalog AS $$ BEGIN RETURN strova_data.cmp(a,b)=0; END $$;
CREATE OR REPLACE FUNCTION strova_data.ge(a jsonb,b jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE SET search_path=pg_catalog AS $$ BEGIN RETURN strova_data.cmp(a,b)>=0; END $$;
CREATE OR REPLACE FUNCTION strova_data.gt(a jsonb,b jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE SET search_path=pg_catalog AS $$ BEGIN RETURN strova_data.cmp(a,b)>0; END $$;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_opclass c JOIN pg_namespace n ON n.oid=c.opcnamespace WHERE n.nspname='strova_data' AND c.opcname='value_ops') THEN
  CREATE OPERATOR strova_data.< (LEFTARG=jsonb,RIGHTARG=jsonb,FUNCTION=strova_data.lt);
  CREATE OPERATOR strova_data.<= (LEFTARG=jsonb,RIGHTARG=jsonb,FUNCTION=strova_data.le);
  CREATE OPERATOR strova_data.= (LEFTARG=jsonb,RIGHTARG=jsonb,FUNCTION=strova_data.eq);
  CREATE OPERATOR strova_data.>= (LEFTARG=jsonb,RIGHTARG=jsonb,FUNCTION=strova_data.ge);
  CREATE OPERATOR strova_data.> (LEFTARG=jsonb,RIGHTARG=jsonb,FUNCTION=strova_data.gt);
  CREATE OPERATOR CLASS strova_data.value_ops FOR TYPE jsonb USING btree AS
    OPERATOR 1 strova_data.<, OPERATOR 2 strova_data.<=, OPERATOR 3 strova_data.=,
    OPERATOR 4 strova_data.>=, OPERATOR 5 strova_data.>, FUNCTION 1 strova_data.cmp(jsonb,jsonb);
 END IF;
END $$;
-- Bounded scalar indexes, not arbitrary user-provided SQL identifiers. Very long
-- strings/maps remain in the body rather than exceeding PostgreSQL btree limits.
CREATE INDEX IF NOT EXISTS documents_author ON strova_data.documents(collection_key,(strova_data.field(body,ARRAY['authorId'])) strova_data.value_ops) WHERE body IS NOT NULL AND octet_length(strova_data.field(body,ARRAY['authorId'])::text)<1600;
CREATE INDEX IF NOT EXISTS documents_user ON strova_data.documents(collection_key,(strova_data.field(body,ARRAY['userId'])) strova_data.value_ops) WHERE body IS NOT NULL AND octet_length(strova_data.field(body,ARRAY['userId'])::text)<1600;
CREATE INDEX IF NOT EXISTS documents_customer ON strova_data.documents(collection_key,(strova_data.field(body,ARRAY['customerId'])) strova_data.value_ops) WHERE body IS NOT NULL AND octet_length(strova_data.field(body,ARRAY['customerId'])::text)<1600;
CREATE INDEX IF NOT EXISTS documents_created ON strova_data.documents(collection_key,(strova_data.field(body,ARRAY['createdAt'])) strova_data.value_ops) WHERE body IS NOT NULL AND body IS NOT NULL AND strova_data.field(body,ARRAY['createdAt'])->>0='t';
CREATE INDEX IF NOT EXISTS documents_body_gin ON strova_data.documents USING gin(body jsonb_path_ops) WHERE body IS NOT NULL;
ALTER TABLE strova_data.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE strova_data.documents FORCE ROW LEVEL SECURITY;
ALTER TABLE strova_data.revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE strova_data.revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE strova_data.migration_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE strova_data.migration_state FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA strova_data FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA strova_data FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA strova_data FROM PUBLIC, anon, authenticated, service_role;
-- Only the private website role can access these tables. Firebase identities and
-- the translated document policies are checked by the website API on every call.
GRANT USAGE ON SCHEMA strova_data TO strova_app;
GRANT SELECT, INSERT, UPDATE ON strova_data.documents, strova_data.revisions TO strova_app;
GRANT SELECT ON strova_data.migration_state TO strova_app;
GRANT USAGE ON SEQUENCE strova_data.document_version TO strova_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA strova_data TO strova_app;
DROP POLICY IF EXISTS private_application ON strova_data.documents;
CREATE POLICY private_application ON strova_data.documents TO strova_app USING(true) WITH CHECK(true);
DROP POLICY IF EXISTS private_application ON strova_data.revisions;
CREATE POLICY private_application ON strova_data.revisions TO strova_app USING(true) WITH CHECK(true);
DROP POLICY IF EXISTS private_application ON strova_data.migration_state;
CREATE POLICY private_application ON strova_data.migration_state TO strova_app USING(true);
