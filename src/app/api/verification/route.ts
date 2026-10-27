import { NextRequest } from "next/server";
import { readJsonObject } from "@/lib/request-body";
import {
  ownVerification,
  submitVerification,
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
    const user = await verificationActor(request);
    return verificationJson(await ownVerification(user.uid));
  } catch (error) {
    return verificationFailure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const user = await verificationActor(request);
    return verificationJson(
      await submitVerification(
        user.uid,
        await readJsonObject(request, false, 16_384),
      ),
    );
  } catch (error) {
    return verificationFailure(error);
  }
}
