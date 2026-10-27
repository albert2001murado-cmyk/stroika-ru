import { NextRequest } from "next/server";
import { readJsonObject } from "@/lib/request-body";
import {
  reviewVerification,
  verificationQueue,
} from "@/lib/account-verification-server";
import {
  verificationActor,
  verificationFailure,
  verificationJson,
} from "@/lib/verification-api-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    await verificationActor(request, true);
    return verificationJson(
      await verificationQueue(
        request.nextUrl.searchParams.get("status") || "pending",
        request.nextUrl.searchParams.get("after") || "",
      ),
    );
  } catch (error) {
    return verificationFailure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const user = await verificationActor(request, true);
    return verificationJson(
      await reviewVerification(
        user.uid,
        await readJsonObject(request, false, 4096),
      ),
    );
  } catch (error) {
    return verificationFailure(error);
  }
}
