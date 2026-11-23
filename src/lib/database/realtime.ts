import { getPool } from "./postgres";
import { hash } from "./query";
import { onDatabaseCommit } from "./change-bus";
/** A single bounded revision query per Node process, independent of the number
 * of waiting browsers. Counters are incremented in the document transaction. */
type Waiter = { keys: string[]; expected: string[]; finish: (error?: unknown) => void };
const waiters = new Set<Waiter>();
let timer: ReturnType<typeof setTimeout> | undefined;
let polling = false;
let stopListening: (() => void) | undefined;
function poke() { if (timer) {clearTimeout(timer);timer=undefined;} if (!polling && waiters.size) timer=setTimeout(poll,0); }
export async function revisions(keys: string[]) {
  const rows = (await getPool().query("SELECT encode(key,'hex') AS key,revision::text FROM strova_data.revisions WHERE key=ANY($1::bytea[])", [keys.map(hash)])).rows;
  const values = new Map<string,string>(rows.map(row => [row.key,row.revision]));
  return keys.map(key => values.get(hash(key).toString("hex")) || "0");
}
function schedule() { if (!timer && !polling && waiters.size) timer = setTimeout(poll, 1000); }
async function poll() {
  timer = undefined; polling = true;
  try {
    const keys = [...new Set([...waiters].flatMap(w => w.keys))];
    if (keys.length) {
      const current = await revisions(keys);
      const index = new Map(keys.map((key,i) => [key,current[i]]));
      for (const waiter of [...waiters]) if (waiter.keys.some((key,i) => waiter.expected[i] !== index.get(key))) waiter.finish();
    }
  } catch (error) { for (const waiter of [...waiters]) waiter.finish(error); }
  finally { polling = false; schedule(); }
}
export function waitForRevision(keys: string[], expected: string[], signal: AbortSignal) {
  return new Promise<void>((resolve,reject) => {
    let ended = false;
    const timeout = setTimeout(() => finish(), 25000);
    const abort = () => finish(new DOMException("Aborted","AbortError"));
    const finish = (error?: unknown) => {
      if (ended) return; ended = true; clearTimeout(timeout); signal.removeEventListener("abort",abort); waiters.delete(waiter);
      if (!waiters.size && timer) { clearTimeout(timer); timer = undefined; }
      if (!waiters.size) { stopListening?.(); stopListening=undefined; }
      if (error) reject(error); else resolve();
    };
    const waiter: Waiter = { keys,expected,finish };
    if (signal.aborted) { finish(new DOMException("Aborted","AbortError")); return; }
    signal.addEventListener("abort",abort,{once:true}); waiters.add(waiter);
    if (!stopListening) stopListening=onDatabaseCommit(poke);
    schedule();
  });
}
