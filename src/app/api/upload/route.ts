import { uploadGuard, limitedFormData, UploadSizeError, acquireUploadSlot, UploadTimeoutError } from "@/lib/api-guard";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const bucket = process.env.YANDEX_S3_BUCKET;
const endpoint = process.env.YANDEX_S3_ENDPOINT || "https://storage.yandexcloud.net";
const region = process.env.YANDEX_S3_REGION || "ru-central1";
const accessKeyId = process.env.YANDEX_S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.YANDEX_S3_SECRET_ACCESS_KEY;

const s3 = new S3Client({
  region,
  endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: accessKeyId || "",
    secretAccessKey: secretAccessKey || "",
  },
});

const mediaExtensions: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "image/heic": "heic", "image/heif": "heif", "image/avif": "avif",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/x-m4v": "m4v",
};
function getFileExtension(file: File) { return mediaExtensions[file.type]; }
function getMediaType(file: File): "image" | "video" | null {
  if (!mediaExtensions[file.type]) return null;
  return file.type.startsWith("image/") ? "image" : "video";
}

export async function GET() { return NextResponse.json({ ok: true }); }

export async function POST(request: NextRequest) {
  const denied = await uploadGuard(request);
  if (denied) return denied;
  const release = acquireUploadSlot();
  if (!release) return NextResponse.json({ error: "Загрузка занята. Повторите через несколько секунд." }, { status: 429, headers: { "Retry-After": "5" } });
  try {
    if (!bucket || !accessKeyId || !secretAccessKey) {
      return NextResponse.json(
        {
          error:
            "Не настроены переменные YANDEX_S3_BUCKET, YANDEX_S3_ACCESS_KEY_ID или YANDEX_S3_SECRET_ACCESS_KEY.",
        },
        { status: 500 }
      );
    }

    const formData = await limitedFormData(request);
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Файл не найден." }, { status: 400 });
    }

    const mediaType = getMediaType(file);

    if (!mediaType) {
      return NextResponse.json(
        { error: "Можно загружать только фото и видео." },
        { status: 400 }
      );
    }

    const maxImageSize = 10 * 1024 * 1024;
    const maxVideoSize = 80 * 1024 * 1024;

    if (mediaType === "image" && file.size > maxImageSize) {
      return NextResponse.json(
        { error: "Фото слишком большое. Максимум 10 МБ." },
        { status: 400 }
      );
    }

    if (mediaType === "video" && file.size > maxVideoSize) {
      return NextResponse.json(
        { error: "Видео слишком большое. Максимум 80 МБ." },
        { status: 400 }
      );
    }

    const extension = getFileExtension(file);
    const folder = mediaType === "image" ? "photos" : "videos";
    const key = `listings/${folder}/${randomUUID()}.${extension}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: file.type,
      })
    );

    const url = `https://${bucket}.storage.yandexcloud.net/${key}`;

    return NextResponse.json({
      type: mediaType,
      url,
      path: key,
      name: file.name,
      size: file.size,
    });
  } catch (error) {
    if (error instanceof UploadTimeoutError) return NextResponse.json({ error: "Загрузка заняла слишком много времени. Повторите." }, { status: 408 });
    if (error instanceof UploadSizeError) return NextResponse.json({ error: "Файл слишком большой. Максимум 80 МБ." }, { status: 413 });
    console.error("Yandex upload error:", error);

    return NextResponse.json(
      { error: "Не получилось загрузить файл в Yandex Object Storage." },
      { status: 500 }
    );
  } finally { release(); }
}
