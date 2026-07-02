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

function getFileExtension(file: File) {
  const fromName = file.name.split(".").pop();

  if (fromName && fromName.length <= 8) {
    return fromName.toLowerCase();
  }

  const fromType = file.type.split("/").pop();

  return fromType || "bin";
}

function getMediaType(file: File): "image" | "video" | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return null;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/upload",
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
        {
          error:
            "Не настроены переменные YANDEX_S3_BUCKET, YANDEX_S3_ACCESS_KEY_ID или YANDEX_S3_SECRET_ACCESS_KEY.",
        },
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
    console.error("Yandex upload error:", error);

    return NextResponse.json(
      { error: "Не получилось загрузить файл в Yandex Object Storage." },
      { status: 500 }
    );
  }
}
