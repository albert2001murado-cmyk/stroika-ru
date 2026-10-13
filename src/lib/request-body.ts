export class RequestBodyError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Enforce actual streamed bytes, rather than trusting Content-Length.
export async function readJsonObject(request: Request, allowEmpty = false, maxBytes = 64 * 1024, timeoutMs = 10_000): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length")) > maxBytes) {
    throw new RequestBodyError("Запрос слишком большой.", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) {
    if (allowEmpty) return {};
    throw new RequestBodyError("Пустой запрос.", 400);
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new RequestBodyError("Превышено время чтения запроса.", 408));
      void reader.cancel().catch(() => {});
    }, timeoutMs);
  });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new RequestBodyError("Запрос слишком большой.", 413);
      }
      chunks.push(value);
    }
    if (!size && allowEmpty) return {};
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new RequestBodyError("Некорректный JSON.", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new RequestBodyError("Ожидается JSON-объект.", 400);
    }
    return body as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
