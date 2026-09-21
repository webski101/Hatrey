import { NextResponse } from "next/server";
import { z } from "zod";
import { DEMO_CLAIMS } from "@/lib/demo-claims";
import { listVaults } from "@/lib/ixs";
import { allocateWithServ, hasServKey } from "@/lib/serv";
import { MandateSchema, type QuoteResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  idleUsdc: z.number().positive().optional(),
  mandate: MandateSchema.partial().optional(),
  prompt: z.string().optional(),
});

const PRICE_USDC = 0.25;

export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => ({}));
    const body = BodySchema.parse(raw);
    const paymentHeader = req.headers.get("x-payment") ?? req.headers.get("x-hatrey-paid");

    if (!paymentHeader) {
      return NextResponse.json(
        {
          error: "Payment required",
          priceUsdc: PRICE_USDC,
          paywallHint:
            "Send header X-Hatrey-Paid: demo (or wire x402) to unlock the allocation memo.",
          priced: true,
        },
        { status: 402 },
      );
    }

    const mandate = MandateSchema.parse({
      ...body.mandate,
      idleUsdc: body.idleUsdc ?? body.mandate?.idleUsdc ?? 10000,
    });

    const { vaults } = await listVaults();
    const result = await allocateWithServ({
      prompt:
        body.prompt ??
        `Should $${mandate.idleUsdc} idle USDC sit in licensed IXS RWA right now?`,
      mandate,
      vaults,
      claims: DEMO_CLAIMS,
    });

    const memo = [
      `Hatrey quote — ${result.decision.action.toUpperCase()}`,
      `Size: ${result.decision.sizeUsdc ?? "n/a"} USDC`,
      `Vault: ${result.decision.vaultName ?? "none"}`,
      `Settlement: ${result.decision.settlement ?? "n/a"}`,
      "",
      "Reasons:",
      ...result.decision.reasons.map((r) => `• ${r}`),
      "",
      result.decision.nextClaimStep
        ? `Next claim step: ${result.decision.nextClaimStep}`
        : "No claim step pending from this quote.",
      "",
      `Reasoning source: ${result.source}${hasServKey() ? " (SERV)" : " (deterministic mock — set SERV_API_KEY)"}`,
    ].join("\n");

    const payload: QuoteResponse = {
      priced: true,
      priceUsdc: PRICE_USDC,
      paywallHint: "Paid via X-Hatrey-Paid demo header. Replace with x402 for production.",
      decision: result.decision,
      memo,
      source: result.source,
    };

    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Quote failed" },
      { status: 400 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/quote",
    method: "POST",
    priceUsdc: PRICE_USDC,
    description:
      "Paid allocation memo for agent treasuries: should idle USDC sit in licensed IXS RWA right now?",
    headers: {
      "X-Hatrey-Paid": "demo",
    },
  });
}
