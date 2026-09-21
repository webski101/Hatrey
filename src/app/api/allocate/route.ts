import { NextResponse } from "next/server";
import { z } from "zod";
import { DEMO_CLAIMS } from "@/lib/demo-claims";
import { buildDepositSteps, buildRedeemSteps, listVaults } from "@/lib/ixs";
import { allocateWithServ, hasServKey } from "@/lib/serv";
import { MandateSchema, type DecisionLedgerEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  prompt: z.string().min(1),
  mandate: MandateSchema,
  claims: z
    .array(
      z.object({
        id: z.string(),
        vaultId: z.string(),
        vaultName: z.string(),
        kind: z.enum(["deposit", "redeem"]),
        amountLabel: z.string(),
        status: z.enum(["requested", "claimable", "settled"]),
        settlement: z.enum(["sync", "async-erc7540", "queued", "unknown"]),
        requestedAt: z.string(),
        note: z.string(),
      }),
    )
    .optional(),
  ownerAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional()
    .default("0xHatreyDemo000000000000000000000000000001"),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const { vaults } = await listVaults();
    const claims = body.claims?.length ? body.claims : DEMO_CLAIMS;

    const result = await allocateWithServ({
      prompt: body.prompt,
      mandate: body.mandate,
      vaults,
      claims,
    });

    let txSteps: DecisionLedgerEntry["txSteps"] = [];
    let txNote = "";

    if (
      result.decision.action === "allocate" &&
      result.decision.vaultId &&
      result.decision.sizeUsdc
    ) {
      const built = await buildDepositSteps({
        vaultId: result.decision.vaultId,
        ownerAddress: body.ownerAddress,
        assetAmount: String(result.decision.sizeUsdc),
      });
      txSteps = built.steps;
      txNote = built.note;
    }

    if (
      result.decision.action === "redeem" &&
      result.decision.vaultId &&
      result.decision.sizeUsdc
    ) {
      const built = await buildRedeemSteps({
        vaultId: result.decision.vaultId,
        ownerAddress: body.ownerAddress,
        shareAmount: String(result.decision.sizeUsdc),
      });
      txSteps = built.steps;
      txNote = built.note;
    }

    const entry: DecisionLedgerEntry = {
      id: `dec_${Date.now()}`,
      createdAt: new Date().toISOString(),
      prompt: body.prompt,
      mandate: body.mandate,
      decision: result.decision,
      source: result.source,
      shadowAgent: result.shadowAgent,
      txSteps,
    };

    return NextResponse.json({
      entry,
      txNote,
      servConfigured: hasServKey(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Allocate failed",
      },
      { status: 400 },
    );
  }
}
