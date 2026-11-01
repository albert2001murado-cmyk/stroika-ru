import { NextRequest } from "next/server";
import { accountFailure, accountJson } from "@/lib/account-api-server";
import { authorizeEngagementJob } from "@/lib/engagement-server";
import { reconcileYookassaPayments } from "@/lib/yookassa-server";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: NextRequest) { try { authorizeEngagementJob(request.headers.get("authorization") || ""); return accountJson(await reconcileYookassaPayments()); } catch (e) { return accountFailure(e); } }
