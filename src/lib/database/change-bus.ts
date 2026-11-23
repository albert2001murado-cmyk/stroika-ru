/** Commit notifications within this Node process. Database revision polling also
 * covers writes made by another process, without LISTEN on the transaction pool. */
const state = globalThis as typeof globalThis & { strovaRevisionSubscribers?: Set<() => void> };
export function onDatabaseCommit(callback: () => void) {
  const subscribers = state.strovaRevisionSubscribers ||= new Set();
  subscribers.add(callback); return () => { subscribers.delete(callback); };
}
export function publishDatabaseCommit() { for (const callback of state.strovaRevisionSubscribers || []) callback(); }
