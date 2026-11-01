import { NextRequest } from "next/server";
import { accountFailure, accountJson } from "@/lib/account-api-server";
import { authorizeEngagementJob } from "@/lib/engagement-server";
import { runAppleExternalReports } from "@/lib/apple-external-server";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: NextRequest) { try { authorizeEngagementJob(request.headers.get("authorization") || ""); return accountJson(await runAppleExternalReports()); } catch (e) { return accountFailure(e); } }
