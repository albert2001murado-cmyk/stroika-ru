import type { AccountType } from "@/types";
import { lookupCompanyByInn } from "@/lib/company-registry-server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      inn?: string;
      accountType?: AccountType;
    };

    if (body.accountType !== "ip" && body.accountType !== "ooo") {
      return NextResponse.json(
        { error: "Выберите ИП или ООО." },
        { status: 400 }
      );
    }

    const company = await lookupCompanyByInn(body.inn || "", body.accountType);
    return NextResponse.json(
      { company },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не получилось проверить ИНН.";
    const status = message.includes("DADATA_API_KEY") ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
