import { Pool, type PoolClient } from "pg";
import { randomBytes } from "node:crypto";
import { Timestamp, GeoPoint, FieldPath as NativeFieldPath, type Firestore } from "firebase-admin/firestore";
import { decode, decodeString, encode, fieldSegments, getField, putField, validateValue, validPath, type Field, type Mutation, type RecordValue, type Selection, type Value } from "./value";
import { applyMutation, DatabaseError, mutationFromData } from "./mutations";
import { compileQuery, hash, normalizedOrders } from "./query";
import { publishDatabaseCommit } from "./change-bus";

type Connection = Pick<PoolClient, "query">;
const versions = new WeakMap<object,string>();
function precondition(options?: {lastUpdateTime?: Timestamp}) {
  if (!options?.lastUpdateTime) return undefined;
  const version = versions.get(options.lastUpdateTime);
  if (!version) throw new DatabaseError("failed-precondition","Неизвестная версия документа.");
  return version;
}
function chatAudience(value: Value | null) {
  const users = new Set<string>();
  for (const key of ["participantIds","participants","users","buyerId","sellerId","clientId","customerId","contractorId","authorId","ownerId"]) {
    const field = getField(value,[key]);
    if (field?.[0] === "s") users.add(decodeString(field[1]));
    if (field?.[0] === "a") for (const item of field[1]) if (item[0] === "s") users.add(decodeString(item[1]));
    if (field?.[0] === "m") for (const item of Object.keys(field[1])) users.add(decodeString(item));
  }
  return users;
}
const globalDb = globalThis as typeof globalThis & { strovaPg?: Pool; strovaDocumentDb?: PostgresFirestore };
export function databaseBackend(): "firestore" | "postgres" {
  const backend = process.env.STROVA_DATABASE_BACKEND || "firestore";
  if (backend !== "firestore" && backend !== "postgres") throw new Error("Некорректный STROVA_DATABASE_BACKEND.");
  return backend;
}
export function getPool() {
  if (!globalDb.strovaPg) {
    if (!process.env.STROVA_DATABASE_URL) throw new Error("Не задан STROVA_DATABASE_URL.");
    globalDb.strovaPg = new Pool({ connectionString: process.env.STROVA_DATABASE_URL, max: 8,
      connectionTimeoutMillis: 6000, idleTimeoutMillis: 20000, allowExitOnIdle:true, application_name: "strova-website" });
    // Idle tunnel failures must not terminate the Node process or expose credentials.
    globalDb.strovaPg.on("error", () => console.error("[postgres] idle connection unavailable"));
  }
  return globalDb.strovaPg;
}
export class PostgresFirestore {
  readonly projectId = "stroika-ru";
  changed = false;
  constructor(readonly connection: Connection = { query: (...args: any[]) => (getPool().query as any)(...args) }, readonly transactional = false) {}
  doc(path: string): PgDocument { validPath(path, true); return new PgDocument(this, path); }
  collection(path: string): PgCollection { validPath(path, false); return new PgCollection(this, path); }
  collectionGroup(path: string): PgQuery { return new PgQuery(this, { path, group: true }); }
  batch() { return new PgBatch(this); }
  async getAll(...refs: PgDocument[]) { return Promise.all(refs.map(ref => this.read(ref.path))); }
  async read(path: string): Promise<PgSnapshot> {
    validPath(path, true);
    const { rows } = await this.connection.query("SELECT path,body,version::text,updated_at FROM strova_data.documents WHERE key=$1 AND path=$2", [hash(path), path]);
    return new PgSnapshot(this.doc(path), rows.length ? rows[0].body : null, rows[0]?.version || "0",rows[0]?.updated_at);
  }
  async readQuery(selection: Selection) {
    const compiled = compileQuery(selection);
    const result = await this.connection.query(compiled.text, compiled.values);
    return new PgQuerySnapshot(new PgQuery(this, selection), result.rows.map(row => {
      let body = row.body;
      if (selection.select) {
        body = ["m", {}];
        for (const field of selection.select) { const value = getField(row.body, field); if (value !== undefined) putField(body, field, value); }
      }
      return new PgSnapshot(this.doc(row.path), body, row.version,row.updated_at);
    }));
  }
  async runTransaction<T>(callback: (transaction: PgTransaction) => Promise<T>, options?: { maxAttempts?: number }): Promise<T> {
    if (this.transactional) throw new DatabaseError("failed-precondition", "Вложенная транзакция недопустима.");
    for (let attempt = 0; ; attempt++) {
      const client = await getPool().connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        const txDb = new PostgresFirestore(client, true);
        const tx = new PgTransaction(txDb);
        const result = await callback(tx);
        await tx.flush();
        await client.query("COMMIT");
        if (txDb.changed) publishDatabaseCommit();
        return result;
      } catch (error: any) {
        try { await client.query("ROLLBACK"); } catch { /* connection may be gone */ }
        // Retry only PostgreSQL's explicit rollback errors, never an ambiguous
        // network failure after COMMIT (which could duplicate a sent message).
        if (!["40001", "40P01"].includes(error?.code) || attempt + 1 >= (options?.maxAttempts || 5)) throw error;
      } finally { client.release(); }
    }
  }
  async commit(mutations: Mutation[], preconditions: { path: string; version: string }[] = [], beforeWrite?: (db: PostgresFirestore, mutation: Mutation, before: Value | null, after: Value | null, now: Value) => Promise<void>) {
    if (!this.transactional) return this.runTransaction(async tx => { await tx.db.commit(mutations, preconditions, beforeWrite); });
    if (mutations.length > 500) throw new DatabaseError("invalid-argument", "Слишком много изменений.");
    const now = encode(Timestamp.now());
    if (mutations.length) this.changed = true;
    for (const precondition of preconditions) {
      const current = await this.read(precondition.path);
      if (current.version !== precondition.version) throw new DatabaseError("aborted", "Документ изменился. Повторите операцию.", 409);
    }
    const revisions = new Set<string>();
    for (const mutation of mutations) {
      validPath(mutation.path, true);
      const previous = await this.read(mutation.path);
      if (mutation.precondition && previous.version !== mutation.precondition) throw new DatabaseError(9,"Документ изменился.",409);
      const after = applyMutation(previous.value, mutation, now);
      if (after) validateValue(after); // Never persist an unresolved transform.
      if (beforeWrite) await beforeWrite(this, mutation, previous.value, after, now);
      const parts = mutation.path.split("/");
      const collection = parts.slice(0, -1).join("/");
      await this.connection.query(`INSERT INTO strova_data.documents(path,collection_path,collection_id,body)
        VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(key) DO UPDATE SET body=EXCLUDED.body,
        version=nextval('strova_data.document_version'),updated_at=now()`,
        [mutation.path, collection, parts[parts.length - 2], after ? JSON.stringify(after) : null]);
      revisions.add(`doc:${mutation.path}`);
      if (collection === "chats") for (const uid of [...chatAudience(previous.value),...chatAudience(after)]) revisions.add(`audience:chats:${uid}`);
      else revisions.add(`collection:${collection}`);
    }
    // Commit-ordered counters work with Supavisor's transaction pool. LISTEN and
    // per-browser polling of whole collections are deliberately not used.
    for (const key of [...revisions].sort()) await this.connection.query("INSERT INTO strova_data.revisions(key,revision) VALUES($1,1) ON CONFLICT(key) DO UPDATE SET revision=strova_data.revisions.revision+1", [hash(key)]);
  }
  async recursiveDelete(ref: PgDocument | PgCollection) {
    const escaped = ref.path.replace(/[\\%_]/g, "\\$&") + "/%";
    const result = await this.connection.query("SELECT path FROM strova_data.documents WHERE body IS NOT NULL AND (path=$1 OR path LIKE $2 ESCAPE '\\')", [ref.path, escaped]);
    for (let i = 0; i < result.rows.length; i += 400) await this.commit(result.rows.slice(i, i + 400).map(row => ({ path: row.path, kind: "delete" })));
  }
  async listCollections(parent = "") {
    const escaped = parent.replace(/[\\%_]/g, "\\$&");
    const result = await this.connection.query("SELECT DISTINCT collection_path FROM strova_data.documents WHERE body IS NOT NULL AND collection_path LIKE $1 ESCAPE '\\'", [parent ? escaped + "/%" : "%"]);
    const prefix = parent ? parent.split("/").length : 0;
    const collections = new Set<string>();
    for (const row of result.rows) { const parts = row.collection_path.split("/"); if (parts.length >= prefix + 1) collections.add(parts.slice(0, prefix + 1).join("/")); }
    return [...collections].sort().map(path => this.collection(path));
  }
}
export class PgDocument {
  readonly id: string;
  readonly parent: PgCollection;
  constructor(readonly firestore: PostgresFirestore, readonly path: string) {
    this.id = path.split("/").at(-1)!; this.parent = new PgCollection(firestore, path.split("/").slice(0, -1).join("/"));
  }
  collection(path: string) { return this.firestore.collection(`${this.path}/${path}`); }
  get() { return this.firestore.read(this.path); }
  set(data: unknown, options?: { merge?: boolean; mergeFields?: (string | object)[] }) { return this.firestore.commit([mutationFromData(this.path, "set", encode(data), { merge: options?.merge, mergeFields: options?.mergeFields?.map(fieldSegments) })]); }
  create(data: unknown) { return this.firestore.commit([{ path: this.path, kind: "create", value: encode(data) }]); }
  update(data: unknown, ...rest: unknown[]) { return this.firestore.commit([updateMutation(this.path, data, rest)]); }
  delete(options?: {lastUpdateTime?: Timestamp}) { return this.firestore.commit([{ path: this.path, kind: "delete",precondition:precondition(options) }]); }
  listCollections() { return this.firestore.listCollections(this.path); }
  isEqual(other: PgDocument) { return this.path === other.path; }
}
export function updateMutation(path: string, data: any, rest: any[]): Mutation {
  if (!rest.length) return mutationFromData(path, "update", encode(data));
  if (rest.length === 1 && typeof data === "object" && !(data instanceof NativeFieldPath) && rest[0] && Object.hasOwn(rest[0],"lastUpdateTime")) return {...mutationFromData(path,"update",encode(data)),precondition:precondition(rest[0])};
  const args = [data, ...rest];
  if (args.length % 2) throw new DatabaseError("invalid-argument", "Некорректные поля обновления.");
  const fields: Mutation["fields"] = [];
  for (let i = 0; i < args.length; i += 2) fields.push({ field: fieldSegments(args[i]), value: encode(args[i + 1]) });
  return { path, kind: "update", fields };
}
export class PgQuery {
  constructor(readonly firestore: PostgresFirestore, readonly selection: Selection) {}
  where(field: string | object, op: string, value: unknown) { return new PgQuery(this.firestore, { ...this.selection, filters: [...(this.selection.filters || []), { field: fieldSegments(field), op, value: encode(value) }] }); }
  orderBy(field: string | object, direction: "asc" | "desc" = "asc") { return new PgQuery(this.firestore, { ...this.selection, orders: [...(this.selection.orders || []), { field: fieldSegments(field), direction }] }); }
  limit(n: number) { return new PgQuery(this.firestore, { ...this.selection, limit: n }); }
  select(...fields: (string | object)[]) { return new PgQuery(this.firestore, { ...this.selection, select: fields.map(fieldSegments) }); }
  startAfter(...values: unknown[]) { return this.cursor("start", false, values); }
  startAt(...values: unknown[]) { return this.cursor("start", true, values); }
  endAt(...values: unknown[]) { return this.cursor("end", true, values); }
  endBefore(...values: unknown[]) { return this.cursor("end", false, values); }
  private cursor(key: "start" | "end", inclusive: boolean, values: any[]) {
    let encoded: Value[];
    if (values[0] instanceof PgSnapshot) {
      const snapshot = values[0];
      if (!snapshot.exists) throw new DatabaseError("invalid-argument", "Документ курсора отсутствует.");
      encoded = normalizedOrders(this.selection).map(order => order.field[0] === "__name__" ? encode(snapshot.ref) : getField(snapshot.value, order.field)!);
      if (encoded.some(value => !value)) throw new DatabaseError("invalid-argument", "Поле курсора отсутствует.");
    } else encoded = values.map(encode);
    return new PgQuery(this.firestore, { ...this.selection, [key]: { values: encoded, inclusive } });
  }
  get() { return this.firestore.readQuery(this.selection); }
}
export class PgCollection extends PgQuery {
  readonly id: string;
  constructor(firestore: PostgresFirestore, readonly path: string) { super(firestore, { path }); this.id = path.split("/").at(-1)!; }
  get parent(): PgDocument | null { const parts = this.path.split("/"); return parts.length > 1 ? this.firestore.doc(parts.slice(0, -1).join("/")) : null; }
  doc(id = randomBytes(15).toString("base64url").slice(0, 20)) { return this.firestore.doc(`${this.path}/${id}`); }
  async add(data: unknown) { const ref = this.doc(); await ref.create(data); return ref; }
}
export class PgSnapshot {
  readonly exists: boolean;
  readonly id: string;
  readonly readTime = Timestamp.now();
  readonly updateTime: Timestamp;
  constructor(readonly ref: PgDocument, readonly value: Value | null, readonly version: string,updatedAt?: Date | string) { this.id = ref.id; this.exists = value !== null; this.updateTime = updatedAt ? Timestamp.fromDate(new Date(updatedAt)) : Timestamp.now(); versions.set(this.updateTime,version); }
  private factories() { return { timestamp: (s: number, n: number) => new Timestamp(s, n), bytes: (b: Uint8Array) => Buffer.from(b), reference: (p: string) => this.ref.firestore.doc(p), geopoint: (a: number, b: number) => new GeoPoint(a, b) }; }
  data(): any { return this.value ? decode(this.value, this.factories()) : undefined; }
  get(field: string | object): any { const value = getField(this.value, fieldSegments(field)); return value === undefined ? undefined : decode(value, this.factories()); }
  wire(): RecordValue { return { path: this.ref.path, value: this.value, version: this.version }; }
}
export class PgQuerySnapshot {
  readonly size: number;
  readonly empty: boolean;
  constructor(readonly query: PgQuery, readonly docs: PgSnapshot[]) { this.size = docs.length; this.empty = !docs.length; }
  forEach(callback: (doc: PgSnapshot) => void) { this.docs.forEach(callback); }
}
export class PgBatch {
  protected mutations: Mutation[] = [];
  constructor(readonly db: PostgresFirestore) {}
  set(ref: PgDocument, data: unknown, options?: { merge?: boolean; mergeFields?: (string | object)[] }) { this.mutations.push(mutationFromData(ref.path, "set", encode(data), { merge: options?.merge, mergeFields: options?.mergeFields?.map(fieldSegments) })); return this; }
  create(ref: PgDocument, data: unknown) { this.mutations.push({ path: ref.path, kind: "create", value: encode(data) }); return this; }
  update(ref: PgDocument, data: unknown, ...rest: unknown[]) { this.mutations.push(updateMutation(ref.path, data, rest)); return this; }
  delete(ref: PgDocument,options?: {lastUpdateTime?: Timestamp}) { this.mutations.push({ path: ref.path, kind: "delete",precondition:precondition(options) }); return this; }
  commit() { return this.db.commit(this.mutations); }
}
export class PgTransaction extends PgBatch {
  async get(ref: PgDocument | PgQuery): Promise<any> {
    if (this.mutations.length) throw new DatabaseError("failed-precondition", "Чтение транзакции должно предшествовать записи.");
    return ref instanceof PgDocument ? this.db.read(ref.path) : this.db.readQuery(ref.selection);
  }
  getAll(...refs: PgDocument[]) { if (this.mutations.length) throw new DatabaseError("failed-precondition", "Чтение после записи."); return this.db.getAll(...refs); }
  flush() { return this.db.commit(this.mutations); }
}
export function getPostgresDb(): Firestore {
  if (!globalDb.strovaDocumentDb) globalDb.strovaDocumentDb = new PostgresFirestore();
  return globalDb.strovaDocumentDb as unknown as Firestore;
}
