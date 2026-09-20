import { NextResponse } from "next/server";
import { listVaults } from "@/lib/ixs";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await listVaults();
  return NextResponse.json(result);
}
