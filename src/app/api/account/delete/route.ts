import { NextRequest, NextResponse } from 'next/server';
import { authorizeAccountDeletion } from '@/lib/account-security-server';
import { SecurityError } from '@/lib/account-security-session';
import { readVerificationBody } from '@/lib/verification-api-server';
import { limitRequests } from '@/lib/api-guard';
import { DELETION_PROTOCOL, deletionStatus, queueAccountDeletion, validDeletionReceipt } from '@/lib/account-deletion-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: {
  'Cache-Control': 'private, no-store', 'X-Strova-Deletion-Protocol': DELETION_PROTOCOL,
  Vary: 'Authorization, X-Strova-Deletion-Receipt, Origin', 'X-Content-Type-Options': 'nosniff',
} });
function originAllowed(request: Request) {
  const origin = request.headers.get('origin');
  return !origin || [new URL(request.url).origin, process.env.STROVA_PUBLIC_ORIGIN, 'https://strovaru.ru', 'https://www.strovaru.ru'].includes(origin);
}
export async function GET(request: NextRequest) {
  if (!originAllowed(request)) return json({ error: 'Недопустимый источник запроса' }, 403);
  if (limitRequests('deletion/status', 600)) return json({ error: 'Подождите немного и повторите' }, 429);
  try {
    const result = await deletionStatus(request.headers.get('x-strova-deletion-receipt') || '');
    return result ? json(result) : json({ error: 'Запрос на удаление не найден', code: 'deletion/not-found' }, 404);
  } catch { return json({ error: 'Не удалось проверить статус удаления. Повторите позже' }, 503); }
}
export async function POST(request: NextRequest) {
  if (!originAllowed(request)) return json({ error: 'Недопустимый источник запроса' }, 403);
  if (limitRequests('deletion/start', 60)) return json({ error: 'Подождите немного и повторите' }, 429);
  try {
    const body = await readVerificationBody(request, 4096);
    if (body.confirm !== 'DELETE' || !validDeletionReceipt(body.receipt)) return json({ error: 'Подтвердите удаление аккаунта' }, 400);
    const actor = await authorizeAccountDeletion(request, body);
    return json(await queueAccountDeletion(actor.uid, body.receipt), 202);
  } catch (error) {
    if (error instanceof SecurityError) return json({ error: error.message, code: error.code }, error.status);
    if ((error as Error).message === 'deletion/already-requested') return json({ error: 'Удаление уже запущено. Проверьте статус на устройстве, где вы его подтвердили', code: 'deletion/already-requested' }, 409);
    const status = Number((error as { status?: number })?.status);
    if ([400, 408, 413, 415].includes(status)) return json({ error: 'Не удалось прочитать подтверждение' }, status);
    return json({ error: 'Не удалось получить подтверждение сервера. Проверьте статус удаления перед повторной попыткой', code: 'deletion/unavailable' }, 503);
  }
}
