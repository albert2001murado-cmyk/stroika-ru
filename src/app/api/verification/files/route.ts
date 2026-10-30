import { NextRequest } from "next/server";
import {
  acquireUploadSlot,
  limitedFormData,
  UploadSizeError,
  UploadTimeoutError,
} from "@/lib/api-guard";
import {
  verificationActor,
  verificationFailure,
  verificationJson,
} from "@/lib/verification-api-server";
import { saveVerificationAttachment } from "@/lib/verification-files-server";
import { VerificationError } from "@/lib/verification-errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  let release: (() => void) | undefined;
  try {
    const actor = await verificationActor(request);
    release = acquireUploadSlot() || undefined;
    if (!release)
      throw new VerificationError(
        "Загрузка занята. Повторите через несколько секунд.",
        429,
      );
    const body = await limitedFormData(request, 10 * 1024 * 1024 + 32_768),
      file = body.get("file");
    if (!(file instanceof File)) throw new VerificationError("Выберите файл.");
    return verificationJson({
      file: await saveVerificationAttachment(
        actor.uid,
        file,
        String(body.get("kind") || ""),
      ),
    });
  } catch (error) {
    if (error instanceof UploadSizeError)
      return verificationJson(
        { error: "Файл должен быть не больше 10 МБ." },
        413,
      );
    if (error instanceof UploadTimeoutError)
      return verificationJson(
        { error: "Загрузка заняла слишком много времени. Повторите." },
        408,
      );
    return verificationFailure(error);
  } finally {
    release?.();
  }
}
