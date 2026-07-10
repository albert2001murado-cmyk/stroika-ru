import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

const bucket = process.env.YANDEX_S3_BUCKET;
const endpoint = process.env.YANDEX_S3_ENDPOINT || "https://storage.yandexcloud.net";
const region = process.env.YANDEX_S3_REGION || "ru-central1";
const accessKeyId = process.env.YANDEX_S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.YANDEX_S3_SECRET_ACCESS_KEY;
const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";

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

function getExtension(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && ext.length <= 8) return ext;
  return file.type.split("/").pop() || "bin";
}

async function makeVoiceLouder(input: Buffer, originalExtension: string) {
  const jobId = randomUUID();
  const dir = path.join(os.tmpdir(), `stroika-voice-${jobId}`);
  const inputPath = path.join(dir, `input.${originalExtension || "m4a"}`);
  const outputPath = path.join(dir, "output.m4a");

  await mkdir(dir, { recursive: true });
  await writeFile(inputPath, input);

  try {
    await execFileAsync(ffmpegPath, [
      "-y",
      "-i",
      inputPath,
      "-af",
      [
        "highpass=f=70",
        "lowpass=f=14500",
        "dynaudnorm=f=180:g=21:p=0.95:m=18",
        "acompressor=threshold=-32dB:ratio=5:attack=8:release=220:makeup=16",
        "loudnorm=I=-9:TP=-0.3:LRA=4",
        "volume=2.4",
        "alimiter=limit=0.97:attack=5:release=50",
      ].join(","),
      "-ac",
      "1",
      "-ar",
      "44100",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      outputPath,
    ]);

    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/chat-upload",
    audioBoost: true,
    ffmpegPath,
    allowed: ["image", "video", "audio"],
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
      return NextResponse.json({ error: "Файл слишком большой." }, { status: 400 });
    }

    const original = Buffer.from(await file.arrayBuffer());

    let body = original;
    let contentType = file.type || "application/octet-stream";
    let extension = getExtension(file);

    if (mediaType === "audio") {
      body = await makeVoiceLouder(original, extension);
      contentType = "audio/mp4";
      extension = "m4a";
    }

    const folder = mediaType === "audio" ? "voice" : mediaType === "image" ? "images" : "videos";
    const key = `chats/${folder}/${randomUUID()}.${extension}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );

    const url = `https://${bucket}.storage.yandexcloud.net/${key}`;

    return NextResponse.json({
      ok: true,
      type: mediaType,
      url,
      path: key,
      name: file.name,
      size: body.length,
      mimeType: contentType,
      boosted: mediaType === "audio",
    });
  } catch (error: any) {
    console.error("Chat upload error:", error);

    const message = String(error?.message || "");
    if (message.includes("ENOENT") || message.includes("ffmpeg")) {
      return NextResponse.json(
        { error: "На сервере не установлен ffmpeg. Выполни: apt install -y ffmpeg" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Не получилось обработать и загрузить файл в чат." },
      { status: 500 }
    );
  }
}
