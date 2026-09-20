import { NextResponse } from "next/server";
import { hasServKey } from "@/lib/serv";
import { DEMO_CLAIMS } from "@/lib/demo-claims";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    claims: DEMO_CLAIMS,
    servConfigured: hasServKey(),
    note: "Demo claim queue illustrates settlement-aware refusals. Wire wallet history via IXS MCP vault_request_status for production.",
  });
}
