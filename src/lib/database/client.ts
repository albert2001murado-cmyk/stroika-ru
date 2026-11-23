/** Shared website / Expo data API. Firebase Authentication is intentionally
 * retained for the first migration stage. Never contains a PostgreSQL URL. */
import * as Native from "firebase/firestore";
import { decode, encode, fieldPath, fieldSegments, getField, transform, type Field, type Mutation, type RecordValue, type Selection, type Value } from "./value";
export * from "firebase/firestore";
type Configuration = { url: (path: string) => string; user: () => { uid: string; getIdToken: () => Promise<string> } | null };
let configuration: Configuration | undefined;
export function configureDatabase(value: Configuration) { configuration = value; }
const failure = (code: string, message: string) => Object.assign(new Error(message),{code});
function config() { if (!configuration) throw failure("failed-precondition","Подключение базы ещё не настроено."); return configuration; }
let backend: "firestore" | "postgres" | undefined, backendUntil = 0;
let configuring: Promise<"firestore" | "postgres"> | undefined;
async function resolveBackend() {
  if (backend && Date.now() < backendUntil) return backend;
  if (configuring) return configuring;
  configuring = (async () => {
    const controller = new AbortController(), deadline = setTimeout(() => controller.abort(),10000);
    try {
      const response = await fetch(config().url("/api/database/config"),{cache:"no-store",signal:controller.signal});
      if (response.status === 404) backend = "firestore"; // compatible with the previous website release
      else {
        const value = await response.json();
        if (!response.ok || value.protocol !== "strova-data-v1" || !["firestore","postgres"].includes(value.backend)) throw failure("unavailable","Не удалось определить базу данных.");
        backend = value.backend;
      }
      backendUntil = Date.now()+10000;
      return backend!;
    } catch { throw failure("unavailable","Сервер временно недоступен. Повторите попытку."); }
    finally { clearTimeout(deadline); configuring = undefined; }
  })();
  return configuring;
}
async function request(body: any, signal?: AbortSignal, expectedUid?: string) {
  const user = config().user();
  if (expectedUid !== undefined && (user?.uid || "") !== expectedUid) throw failure("cancelled","Аккаунт изменился.");
  const token = user ? await user.getIdToken() : "";
  if (config().user() !== user) throw failure("cancelled","Аккаунт изменился.");
  const controller = new AbortController();
  const abort = () => controller.abort(); signal?.addEventListener("abort",abort,{once:true});
  if (signal?.aborted) abort();
  const deadline = setTimeout(abort,body.action === "listen" ? 45000 : 20000);
  try {
    const response = await fetch(config().url("/api/database"),{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),signal:controller.signal});
    const data = await response.json();
    if (!response.ok) throw failure(data.code || "unavailable",data.error || "Не удалось получить данные.");
    if (config().user() !== user) throw failure("cancelled","Аккаунт изменился.");
    return data;
  } catch (error: any) {
    if (error?.code) throw error;
    throw failure(signal?.aborted ? "cancelled" : "unavailable","Соединение с сервером прервано. Повторите попытку.");
  } finally { clearTimeout(deadline); signal?.removeEventListener("abort",abort); }
}
const selections = new WeakMap<object,Selection>();
const builders = new WeakMap<object,() => any>();
const constraints = new WeakMap<object,(selection: Selection) => Selection>();
const nativeConstraints = new WeakMap<object,() => any>();
const snapshots = new WeakMap<object,RecordValue>();
const refsDb = new WeakMap<object,Native.Firestore>();
function selectionOf(target: any): Selection { return selections.get(target) || {path:target.path}; }
function nativeOf(target: any): any { return builders.get(target)?.() || target; }
function virtualConstraint(apply: (selection: Selection) => Selection, build: () => any): any { const object = {}; constraints.set(object,apply); nativeConstraints.set(object,build); return object; }
export const collection: typeof Native.collection = ((...args: any[]) => { const ref = (Native.collection as any)(...args); selections.set(ref,{path:ref.path}); refsDb.set(ref,ref.firestore); return ref; }) as any;
export const doc: typeof Native.doc = ((...args: any[]) => (Native.doc as any)(...args)) as any;
export const query: typeof Native.query = ((target: any,...items: any[]) => {
  let selection = selectionOf(target);
  for (const item of items) { const apply = constraints.get(item); if (!apply) throw failure("invalid-argument","Неподдерживаемое условие поиска."); selection = apply(selection); }
  const result = {firestore:target.firestore || refsDb.get(target),type:"query"}; selections.set(result,selection); refsDb.set(result,result.firestore!);
  builders.set(result,() => (Native.query as any)(nativeOf(target),...items.map(item => nativeConstraints.get(item)!())));
  return result;
}) as any;
export const where: typeof Native.where = ((field: any,op: any,value: any) => virtualConstraint(s => ({...s,filters:[...(s.filters||[]),{field:fieldSegments(field),op,value:encode(value)}]}),() => Native.where(field,op,value))) as any;
export const orderBy: typeof Native.orderBy = ((field: any,direction: any = "asc") => virtualConstraint(s => ({...s,orders:[...(s.orders||[]),{field:fieldSegments(field),direction}]}),() => Native.orderBy(field,direction))) as any;
export const limit: typeof Native.limit = ((n: number) => virtualConstraint(s => ({...s,limit:n}),() => Native.limit(n))) as any;
function cursor(which: "start"|"end",inclusive: boolean,values: any[],build: () => any) {
  return virtualConstraint(s => {
    let record = values[0] && snapshots.get(values[0]);
    const previous = values[0];
    // Firestore is still active while the new build is rolled out. Its real
    // snapshots must also work as cursors before and during the later handoff.
    if (!record && previous?.ref?.path && typeof previous.data === "function" && typeof previous.exists === "function") record = {path:previous.ref.path,value:previous.exists()?encode(previous.data()):null,version:"0"};
    let encoded: Value[];
    if (record) {
      const orders = [...(s.orders || [])];
      if (!orders.some(o => o.field[0] === "__name__")) orders.push({field:["__name__"],direction:orders.at(-1)?.direction || "asc"});
      encoded = orders.map(o => o.field[0] === "__name__" ? encode(Native.doc(values[0].ref.firestore,record.path)) : getField(record.value,o.field)!);
      if (!record.value || encoded.some(v => !v)) throw failure("invalid-argument","Некорректный курсор.");
    } else encoded = values.map(encode);
    return {...s,[which]:{values:encoded,inclusive}};
  },build);
}
export const startAfter: typeof Native.startAfter = ((...v: any[]) => cursor("start",false,v,() => (Native.startAfter as any)(...v))) as any;
export const startAt: typeof Native.startAt = ((...v: any[]) => cursor("start",true,v,() => (Native.startAt as any)(...v))) as any;
export const endAt: typeof Native.endAt = ((...v: any[]) => cursor("end",true,v,() => (Native.endAt as any)(...v))) as any;
export const endBefore: typeof Native.endBefore = ((...v: any[]) => cursor("end",false,v,() => (Native.endBefore as any)(...v))) as any;
export class FieldPath extends Native.FieldPath { constructor(...segments: string[]) { super(...segments); fieldPath(this,segments); } }
export const documentId: typeof Native.documentId = () => fieldPath(Native.documentId(),["__name__"]);
export const serverTimestamp: typeof Native.serverTimestamp = () => transform(Native.serverTimestamp(),"timestamp");
export const deleteField: typeof Native.deleteField = () => transform(Native.deleteField(),"delete");
export const increment: typeof Native.increment = n => transform(Native.increment(n),"increment",[n]);
export const arrayUnion: typeof Native.arrayUnion = (...values) => transform(Native.arrayUnion(...values),"union",values);
export const arrayRemove: typeof Native.arrayRemove = (...values) => transform(Native.arrayRemove(...values),"remove",values);
const metadata = {fromCache:false,hasPendingWrites:false,isEqual:(v: any) => !v.fromCache && !v.hasPendingWrites};
function documentSnapshot(record: RecordValue,db: Native.Firestore): any {
  const ref = Native.doc(db,record.path);
  const factories = {timestamp:(s:number,n:number)=>new Native.Timestamp(s,n),bytes:(v:Uint8Array)=>Native.Bytes.fromUint8Array(v),reference:(p:string)=>Native.doc(db,p),geopoint:(a:number,b:number)=>new Native.GeoPoint(a,b)};
  const result = {id:ref.id,ref,metadata,exists:()=>record.value !== null,
    data:()=>record.value ? decode(record.value,factories) : undefined,
    get:(field:string|object)=>{const v=getField(record.value,fieldSegments(field));return v === undefined ? undefined : decode(v,factories);}};
  snapshots.set(result,record); return result;
}
function resultSnapshot(result: any,target: any): any {
  const db = target.firestore || refsDb.get(target);
  if (result.document) return documentSnapshot(result.document,db);
  const docs = result.documents.map((v:RecordValue)=>documentSnapshot(v,db));
  return {docs,size:docs.length,empty:docs.length===0,metadata,query:target,forEach:(fn:any)=>docs.forEach(fn)};
}
function targetOf(target: any) { return target.type === "document" ? {path:target.path} : {selection:selectionOf(target)}; }
export const getDoc: typeof Native.getDoc = (async (ref: any) => await resolveBackend() === "firestore" ? Native.getDoc(ref) : resultSnapshot(await request({action:"read",target:{path:ref.path}}),ref)) as any;
export const getDocs: typeof Native.getDocs = (async (q: any) => await resolveBackend() === "firestore" ? Native.getDocs(nativeOf(q)) : resultSnapshot(await request({action:"read",target:{selection:selectionOf(q)}}),q)) as any;
function setMutation(ref: any,value: any,options?: any): Mutation { return {path:ref.path,kind:"set",value:encode(value),merge:options?.merge,mergeFields:options?.mergeFields?.map(fieldSegments)}; }
function updateMutation(ref: any,data: any,rest: any[]): Mutation {
  const fields: {field:Field;value:Value}[] = [];
  if (!rest.length) for (const key of Object.keys(data)) fields.push({field:fieldSegments(key),value:encode(data[key])});
  else { const items = [data,...rest]; if (items.length%2) throw failure("invalid-argument","Некорректные поля."); for(let i=0;i<items.length;i+=2)fields.push({field:fieldSegments(items[i]),value:encode(items[i+1])}); }
  return {path:ref.path,kind:"update",fields};
}
function batchFor(db: Native.Firestore) {
  const mutations: Mutation[] = [], nativeWrites: ((batch: Native.WriteBatch)=>void)[] = [];
  const result = {
    set:(ref:any,data:any,options?:any)=>{mutations.push(setMutation(ref,data,options));nativeWrites.push(b=>options?b.set(ref,data,options):b.set(ref,data));return result;},
    update:(ref:any,data:any,...rest:any[])=>{mutations.push(updateMutation(ref,data,rest));nativeWrites.push(b=>(b.update as any)(ref,data,...rest));return result;},
    delete:(ref:any)=>{mutations.push({path:ref.path,kind:"delete"});nativeWrites.push(b=>b.delete(ref));return result;},
    commit:async()=>{if(await resolveBackend()==="firestore"){const b=Native.writeBatch(db);nativeWrites.forEach(fn=>fn(b));await b.commit();}else await request({action:"commit",mutations});},
  }; return result;
}
export const writeBatch: typeof Native.writeBatch = batchFor as any;
export const setDoc: typeof Native.setDoc = (async (ref:any,data:any,options?:any) => {await batchFor(ref.firestore).set(ref,data,options).commit();}) as any;
export const updateDoc: typeof Native.updateDoc = (async (ref:any,data:any,...rest:any[]) => {await batchFor(ref.firestore).update(ref,data,...rest).commit();}) as any;
export const deleteDoc: typeof Native.deleteDoc = (async(ref:any)=>{await batchFor(ref.firestore).delete(ref).commit();}) as any;
export const addDoc: typeof Native.addDoc = (async(ref:any,data:any)=>{const target=Native.doc(ref);await setDoc(target,data);return target;}) as any;
export const runTransaction: typeof Native.runTransaction = (async (db:Native.Firestore,fn:any,options?:any) => {
  if(await resolveBackend()==="firestore")return Native.runTransaction(db,fn,options);
  const uid = config().user()?.uid || "";
  for(let attempt=0;attempt<(options?.maxAttempts||5);attempt++){
    const reads: {path:string;version:string}[] = [],mutations:Mutation[]=[];
    const tx:any={
      get:async(ref:any)=>{if(mutations.length)throw failure("failed-precondition","Чтение после записи в транзакции.");const result=await request({action:"read",target:{path:ref.path}},undefined,uid);reads.push({path:ref.path,version:result.document.version});return resultSnapshot(result,ref);},
      set:(ref:any,data:any,o?:any)=>{mutations.push(setMutation(ref,data,o));return tx;},
      update:(ref:any,data:any,...rest:any[])=>{mutations.push(updateMutation(ref,data,rest));return tx;},
      delete:(ref:any)=>{mutations.push({path:ref.path,kind:"delete"});return tx;},
    };
    const result=await fn(tx);
    try {await request({action:"commit",reads,mutations},undefined,uid);return result;}
    catch(error:any){if(error.code!=="aborted"||attempt+1>=(options?.maxAttempts||5))throw error;}
  }
}) as any;
type Listener = {target:any;next:(v:any)=>void;error:(v:any)=>void;nativeStop?:()=>void;signature?:string;uid:string};
const listeners = new Set<Listener>();
let listenController: AbortController|undefined,listenTimer:ReturnType<typeof setTimeout>|undefined;
let listenGeneration=0;
function wakeListeners(){listenGeneration++;listenController?.abort();if(listenTimer)clearTimeout(listenTimer);listenTimer=setTimeout(()=>void pumpListeners(),0);}
async function pumpListeners(){
  listenTimer=undefined;
  if(!listeners.size)return;
  const generation=listenGeneration;
  const active=[...listeners];
  let delay=10;
  try{
    const mode=await resolveBackend();
    if(generation!==listenGeneration)return;
    const uid=config().user()?.uid||"";
    if(mode==="firestore"){
      for(const l of active)if(!l.nativeStop){l.signature=undefined;l.nativeStop=(Native.onSnapshot as any)(nativeOf(l.target),{includeMetadataChanges:true},(v:any)=>{if(listeners.has(l))l.next(v);},(e:any)=>{if(listeners.has(l))l.error(e);});}
      delay=10000;
    }else{
      for(const l of active){l.nativeStop?.();l.nativeStop=undefined;}
      const targets=active.map(l=>targetOf(l.target));
      const controller=new AbortController();listenController=controller;
      // Revisions are scoped to this exact set of listeners and this identity.
      const signature=JSON.stringify({targets,uid});
      const saved=listenState?.signature===signature?listenState:undefined;
      const result=await request({action:"listen",targets,...(saved?{keys:saved.keys,revisions:saved.revisions}:{})},controller.signal,uid);
      if(generation!==listenGeneration)return;
      listenState={signature,keys:result.keys,revisions:result.revisions};
      for(let i=0;i<active.length;i++){
        const l=active[i];if(!listeners.has(l))continue;
        if(result.results?.[i]?.error){listeners.delete(l);l.error(failure(result.results[i].error.code,result.results[i].error.message));wakeListeners();continue;}
        if(result.results?.[i]){const text=JSON.stringify(result.results[i]);if(l.signature!==text||l.uid!==uid){l.signature=text;l.uid=uid;l.next(resultSnapshot(result.results[i],l.target));}}
      }
    }
  }catch(error:any){if(generation===listenGeneration){for(const l of active)if(listeners.has(l))l.error(error);delay=3000;}}
  finally{if(generation===listenGeneration&&listeners.size)listenTimer=setTimeout(()=>void pumpListeners(),delay);}
}
let listenState:{signature:string;keys:string[];revisions:string[]}|undefined;
export const onSnapshot: typeof Native.onSnapshot = ((target:any,...args:any[])=>{
  if(args[0]&&typeof args[0]==="object"&&!args[0].next)args.shift();
  const observer=args[0];
  const l:Listener={target,next:typeof observer==="function"?observer:observer.next?.bind(observer)||(()=>{}),error:typeof observer==="function"?args[1]||(()=>{}):observer.error?.bind(observer)||(()=>{}),uid:config().user()?.uid||""};
  listeners.add(l);wakeListeners();
  return()=>{listeners.delete(l);l.nativeStop?.();wakeListeners();};
}) as any;
