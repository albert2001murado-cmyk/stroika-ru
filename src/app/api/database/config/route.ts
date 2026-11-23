import { databaseBackend } from "@/lib/database/postgres";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json({ protocol: "strova-data-v1", backend: databaseBackend() }, { headers: { "Cache-Control": "no-store" } });
}
