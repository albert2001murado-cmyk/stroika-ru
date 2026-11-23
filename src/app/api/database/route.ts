import { getRawAdminAuth } from "@/lib/firebase-admin";
import { databaseBackend, PostgresFirestore, type PgSnapshot } from "@/lib/database/postgres";
import { DocumentPolicy } from "@/lib/database/policy";
import { DatabaseError } from "@/lib/database/mutations";
import { revisions, waitForRevision } from "@/lib/database/realtime";
import { validateSelection } from "@/lib/database/query";
import { validPath, validateValue, type Mutation, type Selection } from "@/lib/database/value";
import type { DecodedIdToken } from "firebase-admin/auth";
import { SecurityError } from "@/lib/account-security-session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Target = { path?: string; selection?: Selection };
async function limitedJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new DatabaseError("invalid-argument","Пустой запрос.");
  let length = 0;
  const chunks: Uint8Array[] = [];
  const timeout = setTimeout(()=>void reader.cancel(),10000);
  try {
    for (;;) {
      const {value,done} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 2*1024*1024) { await reader.cancel(); throw new DatabaseError("invalid-argument","Слишком большой запрос.",413); }
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new DatabaseError("invalid-argument","Некорректный запрос."); }
  } finally { clearTimeout(timeout); reader.releaseLock(); }
}
function targetKeys(target: Target,uid: string) { return [target.path ? `doc:${target.path}` : target.selection!.path === "chats" ? `audience:chats:${uid}` : `collection:${target.selection!.path}`]; }
function validateTarget(target: Target) {
  if (!target || typeof target !== "object" || !!target.path === !!target.selection) throw new DatabaseError("invalid-argument","Некорректный запрос.");
  if (target.path) validPath(target.path,true);
  if (target.selection) { validateSelection(target.selection,true); if (target.selection.group || target.selection.select) throw new DatabaseError("permission-denied","Недопустимый запрос.",403); }
}
function validateMutation(mutation: Mutation) {
  validPath(mutation.path,true);
  if (!["set","update","delete"].includes(mutation.kind)) throw new DatabaseError("invalid-argument","Некорректная операция.");
  if (mutation.precondition !== undefined) throw new Error("Private precondition");
  if (mutation.kind === "set") { validateValue(mutation.value,true); if (mutation.value?.[0] !== "m") throw new Error("Expected map"); }
  if (mutation.merge !== undefined && typeof mutation.merge !== "boolean") throw new Error("Invalid merge");
  if (mutation.mergeFields) for (const field of mutation.mergeFields) validateField(field);
  if (mutation.kind === "update") {
    if (!Array.isArray(mutation.fields) || !mutation.fields.length || mutation.fields.length > 500) throw new Error("Invalid fields");
    for (const item of mutation.fields) { validateField(item.field); validateValue(item.value,true); }
  }
}
function validateField(field: string[]) { if (!Array.isArray(field) || !field.length || field.length > 20 || field.some(p => typeof p !== "string" || !p || p.length > 1500)) throw new Error("Invalid field"); }
async function policy(db: PostgresFirestore, token: DecodedIdToken | null) { const result = new DocumentPolicy(db,token); await result.initialize(); return result; }
async function checkTarget(p: DocumentPolicy,target: Target) {
  if (target.selection) await p.query(target.selection);
  else { const result = await p.db.read(target.path!); await p.read(target.path!,result.value); }
}
async function readTarget(p: DocumentPolicy,target: Target) {
  if (target.path) { const result = await p.db.read(target.path); await p.read(target.path,result.value); return { document: result.wire() }; }
  await p.query(target.selection!);
  const snapshot = await p.db.readQuery({ ...target.selection!, limit: target.selection!.limit || 20001 });
  if (snapshot.size > 20000) throw new DatabaseError("resource-exhausted","Уточните поиск: получено слишком много результатов.",429);
  for (const doc of snapshot.docs) await p.read(doc.ref.path,doc.value);
  return { documents: snapshot.docs.map(doc => doc.wire()) };
}
async function targetAccess(p: DocumentPolicy,targets: Target[]) {
  const errors: ({error:{code:string;message:string}}|null)[]=[];
  for (const target of targets) {
    try { await checkTarget(p,target); errors.push(null); }
    catch(error: any) { if (error?.code !== "permission-denied") throw error; errors.push({error:{code:error.code,message:error.message}}); }
  }
  return errors;
}
export async function POST(request: Request) {
  try {
    if (databaseBackend() !== "postgres") return Response.json({ code:"failed-precondition",error:"Новая база пока не включена." },{status:409});
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).origin !== new URL(request.url).origin && origin !== "https://strovaru.ru") return Response.json({code:"permission-denied"},{status:403});
    if (Number(request.headers.get("content-length") || 0) > 2*1024*1024) return Response.json({code:"invalid-argument"},{status:413});
    const body = await limitedJson(request);
    let token: DecodedIdToken | null = null;
    const authorization = request.headers.get("authorization");
    if (authorization) {
      if (!authorization.startsWith("Bearer ") || authorization.length > 10000) throw new DatabaseError("unauthenticated","Войдите в аккаунт.",401);
      try { token = await getRawAdminAuth().verifyIdToken(authorization.slice(7)); }
      catch { throw new DatabaseError("unauthenticated","Войдите в аккаунт заново.",401); }
    }
    const db = new PostgresFirestore();
    if (body.action === "read") {
      validateTarget(body.target);
      const result = await db.runTransaction(async tx => readTarget(await policy(tx.db,token),body.target));
      return Response.json(result,{headers:{"Cache-Control":"no-store"}});
    }
    if (body.action === "commit") {
      if (!token) throw new DatabaseError("unauthenticated","Войдите в аккаунт.",401);
      if (!Array.isArray(body.mutations) || body.mutations.length > 500 || !Array.isArray(body.reads || []) || (body.reads || []).length > 500) throw new Error("Invalid commit");
      body.mutations.forEach(validateMutation);
      for (const read of body.reads || []) { validPath(read.path,true); if (typeof read.version !== "string" || !/^\d+$/.test(read.version)) throw new Error("Invalid read"); }
      await db.runTransaction(async tx => {
        const p = await policy(tx.db,token);
        // A forged transaction cannot use a private-document version as an oracle.
        for (const read of body.reads || []) { const snapshot = await tx.db.read(read.path); await p.read(read.path,snapshot.value); }
        await tx.db.commit(body.mutations,body.reads || [],(_db,m,before,after,now) => p.write(m,before,after,now));
      });
      return Response.json({ok:true});
    }
    if (body.action === "listen") {
      if (!Array.isArray(body.targets) || !body.targets.length || body.targets.length > 60) throw new Error("Invalid targets");
      body.targets.forEach(validateTarget);
      let p = await policy(db,token);
      let errors = await targetAccess(p,body.targets);
      const authKeys = token ? [`doc:users/${token.uid}`,`doc:accountSecurity/${token.uid}`,`doc:authRevocations/${token.uid}`,`doc:accountDeletionJobs/${token.uid}`,...(typeof token.strovaMfaSession === "string" ? [`doc:accountSecuritySessions/${token.strovaMfaSession}`] : [])] : [];
      const allowed = body.targets.filter((_t:Target,i:number)=>!errors[i]);
      const parentKeys = allowed.map((t: Target) => t.selection?.path || t.path || "").filter((path: string) => path.startsWith("chats/") && path.split("/").length > 2).map((path: string) => `doc:${path.split("/").slice(0,2).join("/")}`);
      const keys = [...new Set<string>([...allowed.flatMap((t:Target)=>targetKeys(t,token?.uid || "")),...authKeys,...parentKeys])];
      let current = await revisions(keys);
      if (!errors.some(Boolean) && Array.isArray(body.keys) && Array.isArray(body.revisions) && JSON.stringify(body.keys) === JSON.stringify(keys) && JSON.stringify(body.revisions) === JSON.stringify(current)) {
        await waitForRevision(keys,current,request.signal);
        current = await revisions(keys);
        p = await policy(db,token); // Re-evaluate expiry, membership, blocks and MFA.
        if (JSON.stringify(body.revisions) === JSON.stringify(current)) {
          errors = await targetAccess(p,body.targets);
          if (!errors.some(Boolean)) return Response.json({keys,revisions:current,results:null},{headers:{"Cache-Control":"no-store"}});
        }
      }
      const results = await db.runTransaction(async tx => {
        const checked = await policy(tx.db,token), result=[];
        for (const target of body.targets) {
          try { result.push(await readTarget(checked,target)); }
          catch(error:any) { if (error?.code !== "permission-denied") throw error; result.push({error:{code:error.code,message:error.message}}); }
        }
        return result;
      });
      return Response.json({keys,revisions:current,results},{headers:{"Cache-Control":"no-store"}});
    }
    throw new DatabaseError("invalid-argument","Неизвестная операция.");
  } catch (error: any) {
    const safeCodes = ["permission-denied","unauthenticated","aborted","resource-exhausted","failed-precondition","invalid-argument"];
    const code = error?.code === 5 ? "not-found" : error?.code === 6 ? "already-exists" : error instanceof SecurityError || safeCodes.includes(error?.code) ? error.code : "unavailable";
    const status = error?.status || (code === "unavailable" ? 503 : 400);
    if (code === "unavailable") console.error("[database] request unavailable");
    return Response.json({code,error:code === "unavailable" ? "База временно недоступна. Повторите попытку." : error.message},{status,headers:{"Cache-Control":"no-store"}});
  }
}
