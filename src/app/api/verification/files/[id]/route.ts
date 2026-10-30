import { NextRequest, NextResponse } from "next/server";
import {
  verificationActor,
  verificationFailure,
  verificationJson,
} from "@/lib/verification-api-server";
import {
  readVerificationAttachment,
  removeVerificationAttachment,
} from "@/lib/verification-files-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const actor = await verificationActor(request),
      { id } = await context.params;
    const { file, bytes } = await readVerificationAttachment(actor, id);
    const name = encodeURIComponent(file.name).replace(
      /['()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16)}`,
    );
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `attachment; filename="verification-${id}"; filename*=UTF-8''${name}`,
        "Cache-Control": "private, no-store, max-age=0",
        Vary: "Authorization",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    return verificationFailure(error);
  }
}
export async function DELETE(request: NextRequest, context: Context) {
  try {
    const actor = await verificationActor(request),
      { id } = await context.params;
    return verificationJson(await removeVerificationAttachment(actor, id));
  } catch (error) {
    return verificationFailure(error);
  }
}
