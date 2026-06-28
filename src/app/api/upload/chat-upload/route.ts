import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  return fromType || "jpg";
}

export async function POST(request: NextRequest) {
  try {
    if (!bucket || !accessKeyId || !secretAccessKey) {
      return NextResponse.json(
        {
          error:
            "Не настроены переменные Yandex Object Storage на сервере: YANDEX_S3_BUCKET, YANDEX_S3_ACCESS_KEY_ID или YANDEX_S3_SECRET_ACCESS_KEY.",
        },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Файл не найден." }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "В чат можно загружать только изображения." },
        { status: 400 }
      );
    }

    const maxSize = 10 * 1024 * 1024;

    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "Фото слишком большое. Максимум 10 МБ." },
        { status: 400 }
      );
    }

    const extension = getFileExtension(file);
    const key = `chats/images/${randomUUID()}.${extension}`;
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
      type: "image",
      url,
      path: key,
      name: file.name,
      size: file.size,
    });
  } catch (error) {
    console.error("Chat upload error:", error);

    return NextResponse.json(
      { error: "Не получилось загрузить фото в чат." },
      { status: 500 }
    );
  }
}
