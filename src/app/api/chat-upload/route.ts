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

type MediaType = "image" | "video" | "audio";

function getExtension(file: File) {
  const fromName = file.name.split(".").pop();
  if (fromName && fromName.length <= 8) return fromName.toLowerCase();
  return file.type.split("/").pop() || "bin";
}

function getMediaType(file: File): MediaType | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";

  const name = file.name.toLowerCase();
  if (/\.(jpg|jpeg|png|webp|gif|heic|heif)$/.test(name)) return "image";
  if (/\.(mp4|mov|webm|m4v)$/.test(name)) return "video";
  if (/\.(m4a|mp3|aac|wav|ogg|webm)$/.test(name)) return "audio";
  return null;
}

function getFolder(type: MediaType) {
  if (type === "image") return "images";
  if (type === "video") return "videos";
  return "voice";
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/chat-upload",
    allowed: ["image", "video", "audio"],
    bucket: bucket ? "set" : "missing",
    endpoint,
    region,
    accessKeyId: accessKeyId ? "set" : "missing",
    secretAccessKey: secretAccessKey ? "set" : "missing",
  });
}

export async function POST(request: NextRequest) {
  try {
    if (!bucket || !accessKeyId || !secretAccessKey) {
      return NextResponse.json(
        { error: "Не настроены переменные Yandex Object Storage." },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Файл не найден." }, { status: 400 });
    }

    const mediaType = getMediaType(file);

    if (!mediaType) {
      return NextResponse.json(
        { error: "Можно загружать только фото, видео и голосовые сообщения." },
        { status: 400 }
      );
    }

    const limits: Record<MediaType, number> = {
      image: 10 * 1024 * 1024,
      video: 80 * 1024 * 1024,
      audio: 25 * 1024 * 1024,
    };

    if (file.size > limits[mediaType]) {
      return NextResponse.json(
        { error: mediaType === "audio" ? "Голосовое слишком большое. Максимум 25 МБ." : mediaType === "video" ? "Видео слишком большое. Максимум 80 МБ." : "Фото слишком большое. Максимум 10 МБ." },
        { status: 400 }
      );
    }

    const key = `chats/${getFolder(mediaType)}/${randomUUID()}.${getExtension(file)}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: file.type || "application/octet-stream",
    }));

    const url = `https://${bucket}.storage.yandexcloud.net/${key}`;

    return NextResponse.json({
      ok: true,
      type: mediaType,
      url,
      path: key,
      name: file.name,
      size: file.size,
      mimeType: file.type,
    });
  } catch (error) {
    console.error("Chat upload error:", error);
    return NextResponse.json({ error: "Не получилось загрузить файл в чат." }, { status: 500 });
  }
}
