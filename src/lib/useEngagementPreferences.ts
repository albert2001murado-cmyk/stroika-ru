"use client";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { accountRequest } from "./accountClient";
import { DEFAULT_ENGAGEMENT, type EngagementPreferences } from "./engagement";
export function useEngagementPreferences() {
  const [uid, setUid] = useState(""), [value, setValue] = useState<EngagementPreferences>({ ...DEFAULT_ENGAGEMENT });
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false);
  useEffect(() => onAuthStateChanged(auth, user => setUid(user?.uid || "")), []);
  useEffect(() => { let alive = true; setValue({ ...DEFAULT_ENGAGEMENT }); setLoading(Boolean(uid)); setSaved(false); setError(""); if (uid) void accountRequest<EngagementPreferences>("/api/engagement/preferences").then(data => { if (alive && auth.currentUser?.uid === uid) setValue(data); }).catch(e => { if (alive) setError((e as Error).message); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [uid]);
  function change(patch: Partial<EngagementPreferences>) { setValue(previous => ({ ...previous, ...patch })); setSaved(false); }
  async function save(action?: "clear-topics" | "mute-all") {
    if (busy || !uid) return; setBusy(true); setError(""); setSaved(false);
    try { const data = await accountRequest<EngagementPreferences>("/api/engagement/preferences", action ? { action } : value); if (auth.currentUser?.uid === uid) { setValue(data); setSaved(true); } }
    catch (e) { if (auth.currentUser?.uid === uid) setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return { uid, value, change, loading, busy, error, saved, save };
}
