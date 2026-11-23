import { createHash } from 'node:crypto';
import { DeleteObjectCommand, DeleteObjectsCommand, HeadObjectCommand, ListObjectVersionsCommand, S3Client } from '@aws-sdk/client-s3';
import { getAdminAuth, getAdminDb } from './firebase-admin';
import { FieldValue } from '@/lib/database/admin-values';

export const mediaId = (key: string) => createHash('sha256').update(key).digest('hex');
export function accountMediaKey(value: unknown, bucket = process.env.YANDEX_S3_BUCKET || ''): string | null {
  if (typeof value !== 'string') return null;
  let key = value;
  if (/^https?:\/\//.test(value)) {
    try {
      const u = new URL(value);
      if (u.protocol !== 'https:' || u.username || u.password || !bucket) return null;
      if (u.hostname === `${bucket}.storage.yandexcloud.net`) key = decodeURIComponent(u.pathname.slice(1));
      else if (u.hostname === 'storage.yandexcloud.net' && u.pathname.startsWith(`/${bucket}/`)) key = decodeURIComponent(u.pathname.slice(bucket.length + 2));
      else return null;
    } catch { return null; }
  }
  return /^(listings\/(photos|videos)|chats\/(images|videos|voice|documents))\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.[a-z0-9]{1,8}$/.test(key) ? key : null;
}
export function mediaKeys(value: unknown): Set<string> {
  const out = new Set<string>();
  function visit(v: unknown) {
    if (typeof v === 'string') { const key = accountMediaKey(v); if (key) out.add(key); }
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && Object.getPrototypeOf(v) === Object.prototype) Object.values(v).forEach(visit);
  }
  visit(value); return out;
}
// Persist ownership before upload, including uploads never attached to a publication.
export async function recordAccountUpload(request: Request, key: string) {
  if (!accountMediaKey(key)) throw new Error('deletion/invalid-media-key');
  const actor = await getAdminAuth().verifyIdToken((request.headers.get('authorization') || '').slice(7).trim(), true);
  const db = getAdminDb();
  await db.runTransaction(async tx => {
    if ((await tx.get(db.doc(`accountDeletionJobs/${actor.uid}`))).exists) throw new Error('deletion/in-progress');
    tx.create(db.doc(`accountMedia/${mediaId(key)}`), { ownerUid: actor.uid, key, createdAt: FieldValue.serverTimestamp() });
  });
  return actor.uid;
}
export async function purgeAccountMedia(key: string) {
  if (!accountMediaKey(key)) throw new Error('deletion/invalid-media-key');
  const bucket = process.env.YANDEX_S3_BUCKET, accessKeyId = process.env.YANDEX_S3_ACCESS_KEY_ID, secretAccessKey = process.env.YANDEX_S3_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey) throw new Error('deletion/storage-not-configured');
  const s3 = new S3Client({ region: process.env.YANDEX_S3_REGION || 'ru-central1', endpoint: process.env.YANDEX_S3_ENDPOINT || 'https://storage.yandexcloud.net', forcePathStyle: true, credentials: { accessKeyId, secretAccessKey }, maxAttempts: 2 });
  try {
    for (let page = 0; page < 16; page++) {
      const listed = await s3.send(new ListObjectVersionsCommand({ Bucket: bucket, Prefix: key, MaxKeys: 1000 }), { abortSignal: AbortSignal.timeout(20_000) });
      const versions = [...(listed.Versions || []), ...(listed.DeleteMarkers || [])].filter(v => v.Key === key);
      if (!versions.length) break;
      const result = await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: versions.map(v => ({ Key: key, VersionId: v.VersionId })), Quiet: true } }), { abortSignal: AbortSignal.timeout(20_000) });
      if (result.Errors?.length) throw new Error('deletion/storage-partial-failure');
      if (page === 15) throw new Error('deletion/more-versions');
    }
    try {
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(20_000) });
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key, ...(head.VersionId ? { VersionId: head.VersionId } : {}) }), { abortSignal: AbortSignal.timeout(20_000) });
    } catch (error) { if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) throw error; }
  } finally { s3.destroy(); }
}
