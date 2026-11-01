import { NextRequest } from "next/server";
import {
  ownVerification,
  submitVerification,
} from "@/lib/account-verification-server";
import {
  verificationActor,
  verificationFailure,
  verificationJson,
  readVerificationBody,
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
        await readVerificationBody(request),
      ),
    );
  } catch (error) {
    return verificationFailure(error);
  }
}
