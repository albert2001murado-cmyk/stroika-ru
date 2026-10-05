import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "./firebase-admin";

// Per-process safety net. Edge/WAF limits are required for distributed traffic.
const buckets = new Map<string, { count: number; until: number }>();
export function limitRequests(key: string, maximum: number, windowMs = 60_000) {
  const now = Date.now();
  for (const [id, bucket] of buckets) if (bucket.until <= now) buckets.delete(id);
  const bucket = buckets.get(key) || { count: 0, until: now + windowMs };
  if (!buckets.has(key) && buckets.size >= 10_000) return NextResponse.json({ error: "Сервис занят. Повторите позже." }, { status: 503, headers: { "Retry-After": "60" } });
  if (bucket.count >= maximum) return NextResponse.json({ error: "Слишком много запросов. Подождите немного и повторите." }, { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((bucket.until - now) / 1000))) } });
  bucket.count++; buckets.set(key, bucket);
  return null;
}

export async function uploadGuard(request: NextRequest) {
  const globalLimit = limitRequests("upload:total", 240);
  if (globalLimit) return globalLimit;
  const value = request.headers.get("authorization") || "";
  if (!value.startsWith("Bearer ") || value.length > 8192) return NextResponse.json({ error: "Войдите в аккаунт, чтобы загрузить файл." }, { status: 401 });
  try {
    const user = await getAdminAuth().verifyIdToken(value.slice(7), true);
    return limitRequests(`upload:${user.uid}`, 40);
  } catch { return NextResponse.json({ error: "Сессия недействительна. Войдите снова." }, { status: 401 }); }
}

let activeUploads = 0;
export function acquireUploadSlot() {
  if (activeUploads >= 3) return null;
  activeUploads++;
  let released = false;
  return () => { if (!released) { released = true; activeUploads--; } };
}
export class UploadTimeoutError extends Error {}
export class UploadSizeError extends Error {}
// Count actual bytes, including chunked requests, before multipart parsing.
export async function limitedFormData(request: NextRequest, maxBytes = 82 * 1024 * 1024) {
  if (Number(request.headers.get("content-length") || 0) > maxBytes) throw new UploadSizeError();
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Пустой запрос");
  let size = 0;
  const chunks: Uint8Array[] = [];
  const deadline = Date.now() + 120_000;
  try {
    for (;;) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const { value, done } = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new UploadTimeoutError()); void reader.cancel(); }, Math.max(1, deadline - Date.now())); }),
      ]).finally(() => { if (timer) clearTimeout(timer); });
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new UploadSizeError(); }
      chunks.push(value);
    }
    return await new Response(Buffer.concat(chunks), { headers: { "content-type": request.headers.get("content-type") || "" } }).formData();
  } finally { reader.releaseLock(); }
}
