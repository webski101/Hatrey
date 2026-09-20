import OpenAI from "openai";
import {
  AllocationDecisionSchema,
  type AllocationDecision,
  type ClaimRequest,
  type HarborVault,
  type Mandate,
} from "@/lib/types";

const SERV_BASE = "https://inference-api.openserv.ai/v1";

function getClient(): OpenAI | null {
  const key = process.env.SERV_API_KEY;
  if (!key) return null;
  return new OpenAI({
    apiKey: key,
    baseURL: SERV_BASE,
  });
}

export function hasServKey(): boolean {
  return Boolean(process.env.SERV_API_KEY);
}

function allocatableUsdc(mandate: Mandate): number {
  return Math.max(0, mandate.idleUsdc - mandate.liquidityBufferUsdc);
}

function maxRwaBudget(mandate: Mandate): number {
  return (mandate.idleUsdc * mandate.maxRwaPercent) / 100;
}

export function mockAllocate(input: {
  prompt: string;
  mandate: Mandate;
  vaults: HarborVault[];
  claims: ClaimRequest[];
}): {
  decision: AllocationDecision;
  shadowAgent: "passed" | "revised" | "skipped" | "exhausted";
} {
  const { prompt, mandate, vaults, claims } = input;
  const lower = prompt.toLowerCase();
  const openClaims = claims.filter((c) => c.status !== "settled");

  if (openClaims.some((c) => c.status === "claimable")) {
    const claim = openClaims.find((c) => c.status === "claimable")!;
    return {
      shadowAgent: "passed",
      decision: {
        action: "wait_for_claim",
        vaultId: claim.vaultId,
        vaultName: claim.vaultName,
        sizeUsdc: null,
        reasons: [
          "A claimable settlement is outstanding — capital is not idle cash until claimed.",
          "Harbor refuses new allocate/redeem while a claim step is ready.",
        ],
        settlement: claim.settlement,
        nextClaimStep: `Call vault_build_claim_${claim.kind} for request ${claim.id}`,
        mandateChecks: {
          bufferOk: true,
          ticketOk: true,
          whitelistOk: true,
          rwaCapOk: true,
        },
        confidence: 0.94,
      },
    };
  }

  if (openClaims.some((c) => c.status === "requested") && /redeem|withdraw/i.test(prompt)) {
    const claim = openClaims.find((c) => c.status === "requested")!;
    return {
      shadowAgent: "passed",
      decision: {
        action: "wait_for_claim",
        vaultId: claim.vaultId,
        vaultName: claim.vaultName,
        sizeUsdc: null,
        reasons: [
          "Prior request still in queue. Async capital is not spendable liquidity.",
          "Poll vault_request_status before treating funds as available.",
        ],
        settlement: claim.settlement,
        nextClaimStep: "Wait until status is claimable, then build claim tx",
        mandateChecks: {
          bufferOk: true,
          ticketOk: true,
          whitelistOk: true,
          rwaCapOk: true,
        },
        confidence: 0.9,
      },
    };
  }

  const eligible = vaults.filter((v) => {
    if (v.status !== "active") return false;
    if (mandate.permissionlessOnly && v.requiresWhitelist) return false;
    return true;
  });

  if (/hold|wait|do nothing|don't|dont/i.test(lower)) {
    return {
      shadowAgent: "passed",
      decision: {
        action: "hold",
        vaultId: null,
        vaultName: null,
        sizeUsdc: null,
        reasons: [
          "Operator asked to hold.",
          "Liquidity buffer and RWA cap remain unchanged.",
        ],
        settlement: null,
        nextClaimStep: null,
        mandateChecks: {
          bufferOk: true,
          ticketOk: true,
          whitelistOk: true,
          rwaCapOk: true,
        },
        confidence: 0.88,
      },
    };
  }

  if (eligible.length === 0) {
    return {
      shadowAgent: "passed",
      decision: {
        action: "refuse",
        vaultId: null,
        vaultName: null,
        sizeUsdc: null,
        reasons: [
          "No vaults pass the mandate (permissionless-only / active filter).",
          "KYC vaults are visible but Harbor will not allocate into them under this mandate.",
        ],
        settlement: null,
        nextClaimStep: null,
        mandateChecks: {
          bufferOk: true,
          ticketOk: true,
          whitelistOk: false,
          rwaCapOk: true,
        },
        confidence: 0.95,
      },
    };
  }

  const requestedMatch = lower.match(/\$?\s*([\d,]+(?:\.\d+)?)\s*(k|m)?/i);
  let requested = allocatableUsdc(mandate);
  if (requestedMatch) {
    let n = Number(requestedMatch[1].replace(/,/g, ""));
    const unit = requestedMatch[2]?.toLowerCase();
    if (unit === "k") n *= 1000;
    if (unit === "m") n *= 1_000_000;
    if (Number.isFinite(n) && n > 0) requested = n;
  }

  const bufferOk =
    mandate.idleUsdc - Math.min(requested, mandate.maxTicketUsdc) >=
    mandate.liquidityBufferUsdc;
  const ticketOk = requested <= mandate.maxTicketUsdc;
  const size = Math.min(
    requested,
    mandate.maxTicketUsdc,
    allocatableUsdc(mandate),
    maxRwaBudget(mandate),
  );
  const rwaCapOk = size <= maxRwaBudget(mandate) + 0.01;

  if (!bufferOk || size <= 0) {
    return {
      shadowAgent: "revised",
      decision: {
        action: "refuse",
        vaultId: null,
        vaultName: null,
        sizeUsdc: null,
        reasons: [
          `Liquidity buffer of $${mandate.liquidityBufferUsdc.toLocaleString()} would be breached.`,
          "Harbor refuses rather than maximize yield.",
        ],
        settlement: null,
        nextClaimStep: null,
        mandateChecks: {
          bufferOk: false,
          ticketOk,
          whitelistOk: true,
          rwaCapOk,
        },
        confidence: 0.97,
      },
    };
  }

  if (!ticketOk) {
    return {
      shadowAgent: "revised",
      decision: {
        action: "refuse",
        vaultId: eligible[0].id,
        vaultName: eligible[0].name,
        sizeUsdc: null,
        reasons: [
          `Requested size exceeds max ticket $${mandate.maxTicketUsdc.toLocaleString()}.`,
          "Split into smaller tickets or raise the mandate ceiling.",
        ],
        settlement: eligible[0].settlement,
        nextClaimStep: null,
        mandateChecks: {
          bufferOk,
          ticketOk: false,
          whitelistOk: !eligible[0].requiresWhitelist,
          rwaCapOk,
        },
        confidence: 0.93,
      },
    };
  }

  // Prefer permissionless with higher pps when available
  const vault = [...eligible].sort((a, b) => {
    const pa = a.pricePerShare ?? 1;
    const pb = b.pricePerShare ?? 1;
    return pb - pa;
  })[0];

  if (/redeem|withdraw|exit/i.test(lower)) {
    return {
      shadowAgent: "passed",
      decision: {
        action: "redeem",
        vaultId: vault.id,
        vaultName: vault.name,
        sizeUsdc: Math.min(size, 1000),
        reasons: [
          "Operator requested an exit path.",
          "Redeem queues shares — funds are not back until settlement/claim completes.",
        ],
        settlement: vault.settlement,
        nextClaimStep:
          vault.settlement === "async-erc7540"
            ? "After queue confirms, poll status then vault_build_claim_redeem"
            : "Queued redeem finalizes on vault cycle — do not report as settled on submit",
        mandateChecks: {
          bufferOk: true,
          ticketOk: true,
          whitelistOk: !vault.requiresWhitelist,
          rwaCapOk: true,
        },
        confidence: 0.86,
      },
    };
  }

  return {
    shadowAgent: "passed",
    decision: {
      action: "allocate",
      vaultId: vault.id,
      vaultName: vault.name,
      sizeUsdc: Number(size.toFixed(2)),
      reasons: [
        `Parks $${size.toLocaleString()} idle USDC under the RWA cap (${mandate.maxRwaPercent}%).`,
        vault.requiresWhitelist
          ? "Vault is whitelisted-eligible for this mandate."
          : "Permissionless vault — no KYC gate for agent deposit.",
        `Settlement is ${vault.settlement}; do not treat shares as liquid until claim/settle.`,
      ],
      settlement: vault.settlement,
      nextClaimStep:
        vault.settlement === "sync"
          ? null
          : "After deposit tx confirms, poll vault_request_status; claim when claimable",
      mandateChecks: {
        bufferOk: true,
        ticketOk: true,
        whitelistOk: !vault.requiresWhitelist,
        rwaCapOk: true,
      },
      confidence: 0.91,
    },
  };
}

export async function allocateWithServ(input: {
  prompt: string;
  mandate: Mandate;
  vaults: HarborVault[];
  claims: ClaimRequest[];
}): Promise<{
  decision: AllocationDecision;
  shadowAgent: "passed" | "revised" | "skipped" | "exhausted";
  source: "serv" | "mock";
}> {
  const client = getClient();
  if (!client) {
    const mock = mockAllocate(input);
    return { ...mock, source: "mock" };
  }

  const system = `You are Harbor, a fiduciary desk for agent treasuries allocating idle USDC into licensed IXS RWA vaults.

Hard rules:
1. Never maximize yield at the expense of the mandate.
2. Refuse if liquidity buffer would break, ticket size exceeds max, RWA % cap would break, or vault requires whitelist while permissionlessOnly is true.
3. Never treat queued ERC-7540 / async deposits or redeems as settled cash. Prefer wait_for_claim when a claim is outstanding.
4. Prefer permissionless vaults when mandate.permissionlessOnly is true.
5. Output ONLY valid JSON matching the schema. No markdown.

Schema:
{
  "action": "allocate" | "hold" | "redeem" | "wait_for_claim" | "refuse",
  "vaultId": string | null,
  "vaultName": string | null,
  "sizeUsdc": number | null,
  "reasons": string[],
  "settlement": "sync" | "async-erc7540" | "queued" | "unknown" | null,
  "nextClaimStep": string | null,
  "mandateChecks": {
    "bufferOk": boolean,
    "ticketOk": boolean,
    "whitelistOk": boolean,
    "rwaCapOk": boolean
  },
  "confidence": number
}`;

  const user = JSON.stringify(
    {
      operatorPrompt: input.prompt,
      mandate: input.mandate,
      vaults: input.vaults.map((v) => ({
        id: v.id,
        name: v.name,
        requiresWhitelist: v.requiresWhitelist,
        settlement: v.settlement,
        pricePerShare: v.pricePerShare,
        chainName: v.chainName,
        status: v.status,
      })),
      openClaims: input.claims.filter((c) => c.status !== "settled"),
    },
    null,
    2,
  );

  try {
    const completion = await client.chat.completions.create({
      model: process.env.SERV_MODEL ?? "gpt-4.1-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      tools: [
        { type: "function", function: { name: "serv_prompt_guard" } },
        {
          type: "function",
          function: {
            name: "serv_shadow_agent",
            description: "Validate fiduciary output",
            parameters: {
              type: "object",
              properties: {
                hint: {
                  type: "string",
                  default:
                    "Refuse if mandate breaks, whitelist unmet, or a claim is still outstanding. Never imply queued capital is settled.",
                },
                max_iterations: { type: "integer", default: 3 },
              },
            },
          },
        },
      ],
    });

    const text = completion.choices[0]?.message?.content ?? "{}";
    const parsed = AllocationDecisionSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      const mock = mockAllocate(input);
      return { ...mock, source: "mock", shadowAgent: "exhausted" };
    }
    return {
      decision: parsed.data,
      shadowAgent: "passed",
      source: "serv",
    };
  } catch {
    const mock = mockAllocate(input);
    return { ...mock, source: "mock" };
  }
}
