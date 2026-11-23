#!/usr/bin/env python3
"""NEW database VPS only. Stage the application tables; never switch the site.
Reads the already verified private snapshot, retains Firestore IDs and all values.
No pip/npm packages, secrets in arguments, or public database port are required.
"""
import argparse
import base64
import datetime
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys


def require(value, code):
    if not value:
        raise RuntimeError(code)


def b64(value):
    return base64.b64encode(value.encode('utf-8')).decode('ascii')


def timestamp(value):
    match = re.fullmatch(r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z', value)
    require(match, 'INVALID_TIMESTAMP')
    date = datetime.datetime.fromisoformat(match[1]).replace(tzinfo=datetime.timezone.utc)
    seconds = (date - datetime.datetime(1970, 1, 1, tzinfo=datetime.timezone.utc)) // datetime.timedelta(seconds=1)
    return ['t', [seconds, int((match[2] or '').ljust(9, '0'))]]


def convert(value):
    require(isinstance(value, dict) and len(value) == 1, 'INVALID_FIRESTORE_VALUE')
    kind, data = next(iter(value.items()))
    if kind == 'nullValue':
        return ['z']
    if kind == 'booleanValue':
        return ['b', data]
    if kind == 'integerValue':
        return ['n', str(data)]
    if kind == 'doubleValue':
        if isinstance(data, str):
            require(data in ['NaN', 'Infinity', '-Infinity'], 'INVALID_DOUBLE')
            return ['n', data]
        # JSON numeric values are strings in the canonical storage, never jsonb
        # numbers; int64 strings and negative zero survive the conversion.
        return ['n', '-0' if data == 0 and str(data).startswith('-') else str(data)]
    if kind == 'timestampValue':
        return timestamp(data)
    if kind == 'stringValue':
        return ['s', b64(data)]
    if kind == 'bytesValue':
        base64.b64decode(data, validate=True)
        return ['y', data]
    if kind == 'referenceValue':
        prefix = 'projects/stroika-ru/databases/(default)/documents/'
        require(data.startswith(prefix), 'EXTERNAL_REFERENCE_REQUIRES_REVIEW')
        return ['r', [b64(part) for part in data[len(prefix):].split('/')]]
    if kind == 'geoPointValue':
        return ['g', [data.get('latitude', 0), data.get('longitude', 0)]]
    if kind == 'arrayValue':
        return ['a', [convert(item) for item in data.get('values', [])]]
    if kind == 'mapValue':
        return ['m', {b64(key): convert(item) for key, item in data.get('fields', {}).items()}]
    raise RuntimeError('UNSUPPORTED_FIRESTORE_VALUE')


def escaped(value):
    return value.replace('\\', '\\\\').replace('\t', '\\t').replace('\n', '\\n').replace('\r', '\\r')


def json_compact(value):
    return json.dumps(value, ensure_ascii=True, separators=(',', ':'), allow_nan=False)


def digest_sql():
    return "SELECT encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(jsonb_build_array(path,collection_path,collection_id,body)::text,'UTF8')),'hex'),'' ORDER BY key),''),'UTF8')),'hex') FROM strova_data.documents"


def build_sql(schema, backup_id, rows, counts):
    # The advisory lock plus live version guard prevents a rerun from overwriting
    # messages or listings written after the first import.
    sql_text = "BEGIN; SELECT pg_advisory_xact_lock(746392018);\n" + schema + "\n"
    sql_text += "LOCK TABLE strova_data.documents IN ACCESS EXCLUSIVE MODE;\n"
    sql_text += "DO $$ BEGIN IF EXISTS(SELECT 1 FROM strova_data.migration_state WHERE import_version_max<>(SELECT coalesce(max(version),0) FROM strova_data.documents) OR import_digest<>(" + digest_sql() + ")) THEN RAISE EXCEPTION 'LIVE_DATA_CHANGED'; END IF; END $$;\n"
    sql_text += 'DELETE FROM strova_data.documents; DELETE FROM strova_data.revisions;\n'
    sql_text += 'CREATE TEMP TABLE incoming_application(path text,collection_path text,collection_id text,body jsonb) ON COMMIT DROP;\n'
    sql_text += 'COPY pg_temp.incoming_application(path,collection_path,collection_id,body) FROM STDIN WITH(FORMAT text);\n'
    sql_text += '\n'.join('\t'.join(escaped(v) for v in row) for row in rows) + '\n\\.\n'
    sql_text += 'INSERT INTO strova_data.documents(path,collection_path,collection_id,body) SELECT path,collection_path,collection_id,body FROM pg_temp.incoming_application;\n'
    sql_text += "DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_temp.incoming_application i LEFT JOIN strova_data.documents d ON d.key=strova_data.path_key(i.path) WHERE d.path IS DISTINCT FROM i.path OR d.body IS DISTINCT FROM i.body OR d.collection_path IS DISTINCT FROM i.collection_path OR d.collection_id IS DISTINCT FROM i.collection_id) THEN RAISE EXCEPTION 'CONTENT_MISMATCH'; END IF; END $$;\n"
    sql_text += f"INSERT INTO strova_data.migration_state(singleton,backup_id,source_documents,missing_parents,schema_version,import_version_max,import_digest) SELECT true,'{backup_id}',{len(rows)},{counts['missingParents']},1,coalesce(max(version),0),(" + digest_sql() + ") FROM strova_data.documents ON CONFLICT(singleton) DO UPDATE SET backup_id=EXCLUDED.backup_id,source_documents=EXCLUDED.source_documents,missing_parents=EXCLUDED.missing_parents,import_version_max=EXCLUDED.import_version_max,import_digest=EXCLUDED.import_digest,imported_at=now();\n"
    sql_text += "ALTER ROLE strova_app SET default_transaction_read_only=off; COMMENT ON ROLE strova_app IS 'strova-postgres-live-v1';\n"
    sql_text += f"DO $$ BEGIN IF (SELECT count(*) FROM strova_data.documents WHERE body IS NOT NULL)<>{len(rows)} THEN RAISE EXCEPTION 'COUNT_MISMATCH'; END IF; END $$; COMMIT;\n"
    return sql_text


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare', action='store_true')
    parser.add_argument('--backup-id')
    args = parser.parse_args()
    require(os.geteuid() == 0, 'RUN_ON_NEW_DATABASE_VPS_AS_ROOT')
    os.umask(0o077)
    directory = pathlib.Path('/var/backups/strova')
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    log = directory / 'prepare-live.log'
    command = ['docker', 'exec', '-i', '--user', 'postgres', 'supabase-db', 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']

    def sql(query):
        with log.open('ab') as output:
            result = subprocess.run(command, input=query.encode(), stdout=subprocess.PIPE, stderr=output, timeout=180)
        require(result.returncode == 0, 'POSTGRES_OPERATION_FAILED')
        return result.stdout.decode().strip()

    if args.backup_id:
        require(re.fullmatch('[a-f0-9]{64}', args.backup_id), 'INVALID_BACKUP_ID')
        backup_id = args.backup_id
    else:
        backup_id = sql('SELECT backup_id FROM strova_migration.runs ORDER BY imported_at DESC LIMIT 1;')
    require(re.fullmatch('[a-f0-9]{64}', backup_id), 'SNAPSHOT_NOT_FOUND')
    counts = json.loads(sql(f"SELECT json_build_object('documents',count(*) FILTER(WHERE NOT missing_parent),'missingParents',count(*) FILTER(WHERE missing_parent)) FROM strova_migration.documents WHERE backup_id='{backup_id}';"))
    require(counts['documents'] > 0, 'EMPTY_SNAPSHOT')
    exists = sql("SELECT to_regnamespace('strova_data') IS NOT NULL;") == 't'
    if exists:
        state = sql("SELECT coalesce((SELECT row_to_json(s)::text FROM strova_data.migration_state s WHERE singleton),'null');")
        if state != 'null':
            state = json.loads(state)
            maximum = int(sql('SELECT coalesce(max(version),0) FROM strova_data.documents;'))
            require(maximum == state['import_version_max'] and sql(digest_sql() + ';') == state['import_digest'], 'LIVE_DATA_CHANGED_REFUSING_OVERWRITE')
    rows = []
    offset = 0
    while True:
        page = sql(f"SELECT json_build_object('path',document_path,'missing',missing_parent,'payload',payload,'sha256',sha256)::text FROM strova_migration.documents WHERE backup_id='{backup_id}' ORDER BY path_hash LIMIT 200 OFFSET {offset};")
        items = [json.loads(line) for line in page.splitlines()] if page else []
        for item in items:
            require(hashlib.sha256(item['payload'].encode()).hexdigest() == item['sha256'], 'SNAPSHOT_CONTENT_CHANGED')
            if item['missing']:
                continue
            raw = json.loads(item['payload'])
            require(raw['name'].endswith('/documents/' + item['path']), 'PATH_MISMATCH')
            body = convert({'mapValue': {'fields': raw.get('fields', {})}})
            parts = item['path'].split('/')
            rows.append((item['path'], '/'.join(parts[:-1]), parts[-2], json_compact(body)))
        offset += len(items)
        if len(items) < 200:
            break
    require(len(rows) == counts['documents'], 'DOCUMENT_COUNT_MISMATCH')
    if not args.prepare:
        print('LIVE_PREPARE_CHECK_OK ' + json_compact({'backupId': backup_id, **counts, 'switchPerformed': False}))
        return
    schema = pathlib.Path(__file__).with_name('schema.sql').read_text()
    if exists:
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        destination = directory / ('strova-data-before-prepare-' + stamp + '.dump')
        with destination.open('wb') as out, log.open('ab') as err:
            result = subprocess.run(['docker', 'exec', '--user', 'postgres', 'supabase-db', 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema=strova_data', '--format=custom'], stdout=out, stderr=err, timeout=180)
        require(result.returncode == 0, 'BACKUP_FAILED')
    sql_text = build_sql(schema, backup_id, rows, counts)
    sql(sql_text)
    # Existing Supavisor backend connections can retain the bootstrap role's old
    # read-only default. Reconnect the private pool after preparing its new grants.
    with log.open('ab') as err:
        result = subprocess.run(['docker', 'restart', 'supabase-pooler'], stdout=subprocess.PIPE, stderr=err, timeout=60)
    require(result.returncode == 0, 'TABLES_READY_POOLER_RESTART_FAILED')
    print('LIVE_TABLES_PREPARED ' + json_compact({'backupId': backup_id, **counts, 'switchPerformed': False}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        code = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        print('PREPARE_STOPPED ' + code + ' (private log: /var/backups/strova/prepare-live.log)', file=sys.stderr)
        sys.exit(1)
