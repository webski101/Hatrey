import type { HarborVault, VaultSettlement } from "@/lib/types";

const IXS_API_BASE =
  process.env.IXS_API_BASE_URL ?? "https://api-v2.ixs.finance";
const IXS_MCP_URL = process.env.IXS_MCP_URL ?? "https://api-v2.ixs.finance/mcp";

type IxsVaultRaw = {
  id: string;
  name: string;
  symbol: string;
  chainId: number;
  chainName: string;
  network: string;
  contractAddress: string;
  explorerUrl?: string | null;
  underlyingAsset?: {
    symbol?: string;
    decimals?: number;
    address?: string;
  };
  requiresWhitelist?: boolean;
  status?: string;
  productId?: string | null;
  transparency?: {
    description?: string;
    riskBullets?: string[];
  } | null;
  actions?: string[];
};

type IxsListResponse = {
  items?: IxsVaultRaw[];
};

export const FALLBACK_VAULTS: HarborVault[] = [
  {
    id: "6a26624ca7d16b245d665475",
    name: "IX High Yield Bond (USDC) — Permissionless",
    symbol: "ixv1",
    chainId: 56,
    chainName: "BNB Chain",
    network: "bsc",
    contractAddress: "0xc975a3EeF2e49F8eDdEf585340C43f15300fCB82",
    explorerUrl:
      "https://bscscan.com/address/0xc975a3EeF2e49F8eDdEf585340C43f15300fCB82",
    underlyingSymbol: "USDC",
    underlyingDecimals: 18,
    requiresWhitelist: false,
    status: "active",
    productId: "ixhyb",
    description:
      "Permissionless agent vault. USDC into institutional RWA yield on BNB Chain. Async/queued settlement — deposits are not cash until claimed.",
    riskBullets: [
      "Yield is not guaranteed.",
      "Redemptions may be queued.",
      "Value depends on off-chain custody.",
    ],
    actions: ["deposit", "redeem"],
    pricePerShare: 1.0124,
    settlement: "queued",
  },
  {
    id: "6a952729732c2b84b55ce89d",
    name: "IX High Yield Bond (USDC) — Avalanche Open",
    symbol: "IXHYB",
    chainId: 43114,
    chainName: "Avalanche C-Chain",
    network: "avalanche-mainnet",
    contractAddress: "0xaD01573b459805E3954398796203d830B57A8bD9",
    explorerUrl: "https://snowscan.xyz",
    underlyingSymbol: "USDC",
    underlyingDecimals: 6,
    requiresWhitelist: false,
    status: "active",
    productId: "ixhyb",
    description:
      "Open Avalanche route for IX High Yield Bond. Still subject to vault settlement cycles.",
    riskBullets: [
      "Performance risk on underlying bonds.",
      "Smart contract risk.",
    ],
    actions: ["deposit", "redeem"],
    pricePerShare: 1.0089,
    settlement: "async-erc7540",
  },
  {
    id: "6a8ecb61732c2b84b55ce88f",
    name: "IX High Yield Bond (USDC) — Permissioned BSC",
    symbol: "ix7540v1",
    chainId: 56,
    chainName: "BNB Chain",
    network: "bsc-mainnet",
    contractAddress: "0xD84129f506d1030Dd6b46Fe4A600d1E1c3b0802E",
    explorerUrl:
      "https://bscscan.com/address/0xD84129f506d1030Dd6b46Fe4A600d1E1c3b0802E",
    underlyingSymbol: "USDC",
    underlyingDecimals: 18,
    requiresWhitelist: true,
    status: "active",
    productId: "ixhyb",
    description:
      "KYC / whitelist required. Harbor refuses this vault when the mandate is permissionless-only.",
    riskBullets: [
      "Identity verification required before deposit.",
      "Jurisdiction restrictions apply.",
    ],
    actions: ["deposit", "redeem"],
    pricePerShare: 1.0152,
    settlement: "async-erc7540",
  },
];

function mapVault(raw: IxsVaultRaw, settlement: VaultSettlement = "unknown"): HarborVault {
  return {
    id: raw.id,
    name: raw.name,
    symbol: raw.symbol,
    chainId: raw.chainId,
    chainName: raw.chainName,
    network: raw.network,
    contractAddress: raw.contractAddress,
    explorerUrl: raw.explorerUrl ?? null,
    underlyingSymbol: raw.underlyingAsset?.symbol ?? "USDC",
    underlyingDecimals: raw.underlyingAsset?.decimals ?? 6,
    requiresWhitelist: Boolean(raw.requiresWhitelist),
    status: raw.status ?? "unknown",
    productId: raw.productId ?? null,
    description: raw.transparency?.description ?? null,
    riskBullets: raw.transparency?.riskBullets ?? [],
    actions: raw.actions ?? [],
    pricePerShare: null,
    settlement,
  };
}

async function mcpCall(
  method: string,
  params: Record<string, unknown> = {},
  id = 1,
): Promise<unknown> {
  const res = await fetch(IXS_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`IXS MCP HTTP ${res.status}`);
  }

  const text = await res.text();
  // Streamable HTTP may return SSE-style lines or plain JSON
  const jsonLine = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("{") || l.startsWith("data:"));

  if (!jsonLine) {
    throw new Error("Empty IXS MCP response");
  }

  const payload = jsonLine.startsWith("data:")
    ? jsonLine.slice(5).trim()
    : jsonLine;

  return JSON.parse(payload);
}

export async function listVaults(): Promise<{
  vaults: HarborVault[];
  source: "live" | "fallback";
  error?: string;
}> {
  try {
    const res = await fetch(`${IXS_API_BASE}/vaults`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      throw new Error(`IXS REST HTTP ${res.status}`);
    }
    const data = (await res.json()) as IxsListResponse;
    const items = data.items ?? [];
    if (items.length === 0) {
      return { vaults: FALLBACK_VAULTS, source: "fallback", error: "Empty vault list" };
    }

    const vaults = await Promise.all(
      items.map(async (item) => {
        let settlement: VaultSettlement = item.requiresWhitelist
          ? "async-erc7540"
          : "queued";
        let pricePerShare: number | null = null;

        try {
          const detail = await getVaultDetail(item.id);
          if (detail) {
            settlement = detail.settlement;
            pricePerShare = detail.pricePerShare;
          }
        } catch {
          // keep inferred settlement
        }

        return {
          ...mapVault(item, settlement),
          pricePerShare,
        };
      }),
    );

    return { vaults, source: "live" };
  } catch (err) {
    return {
      vaults: FALLBACK_VAULTS,
      source: "fallback",
      error: err instanceof Error ? err.message : "IXS fetch failed",
    };
  }
}

export async function getVaultDetail(vaultId: string): Promise<{
  settlement: VaultSettlement;
  pricePerShare: number | null;
} | null> {
  try {
    const res = await fetch(`${IXS_API_BASE}/vaults/${vaultId}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      settlement?: string;
      pricePerShare?: number | string;
      metrics?: { pricePerShare?: number | string };
    };

    const settlementRaw =
      data.settlement ??
      (typeof (data as { kind?: string }).kind === "string"
        ? (data as { kind?: string }).kind
        : undefined);

    let settlement: VaultSettlement = "unknown";
    if (settlementRaw === "sync") settlement = "sync";
    else if (settlementRaw === "async-erc7540") settlement = "async-erc7540";
    else if (settlementRaw === "queued") settlement = "queued";

    const pps =
      data.pricePerShare ?? data.metrics?.pricePerShare ?? null;
    const pricePerShare =
      pps === null || pps === undefined ? null : Number(pps);

    return {
      settlement,
      pricePerShare: Number.isFinite(pricePerShare) ? pricePerShare : null,
    };
  } catch {
    return null;
  }
}

export async function checkWhitelist(
  vaultId: string,
  walletAddress: string,
): Promise<{ allowed: boolean; source: "mcp" | "inferred"; note: string }> {
  try {
    await mcpCall("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "harbor", version: "0.1.0" },
    });
    const result = await mcpCall(
      "tools/call",
      {
        name: "vault_check_whitelist",
        arguments: { vaultId, walletAddress },
      },
      2,
    );

    const content = extractMcpText(result);
    const allowed =
      /true|allow|eligible|whitelisted/i.test(content) &&
      !/false|not.?eligible|denied|blocked/i.test(content);

    return {
      allowed,
      source: "mcp",
      note: content.slice(0, 280) || "Whitelist check completed via IXS MCP.",
    };
  } catch {
    const vaults = await listVaults();
    const vault = vaults.vaults.find((v) => v.id === vaultId);
    if (!vault) {
      return {
        allowed: false,
        source: "inferred",
        note: "Vault not found; treating as blocked.",
      };
    }
    return {
      allowed: !vault.requiresWhitelist,
      source: "inferred",
      note: vault.requiresWhitelist
        ? "MCP unavailable. Vault requires whitelist — Harbor refuses until verified."
        : "MCP unavailable. Permissionless vault inferred as open.",
    };
  }
}

export async function buildDepositSteps(input: {
  vaultId: string;
  ownerAddress: string;
  assetAmount: string;
}): Promise<{ steps: { type: string; to?: string; data?: string; value?: string; description: string }[]; note: string; source: "mcp" | "mock" }> {
  try {
    await mcpCall("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "harbor", version: "0.1.0" },
    });
    const result = await mcpCall(
      "tools/call",
      {
        name: "vault_build_request_deposit",
        arguments: input,
      },
      3,
    );
    const text = extractMcpText(result);
    const steps = parseTxSteps(text, "deposit");
    return {
      steps,
      note: "Unsigned calldata from IXS MCP. Harbor never invents calldata.",
      source: "mcp",
    };
  } catch {
    return {
      source: "mock",
      note: "IXS MCP write path unavailable — showing unsigned preview steps for demo. Wire MCP to get real calldata.",
      steps: [
        {
          type: "erc20_approve_exact",
          description: `Approve vault spender for ${input.assetAmount} USDC (mock)`,
        },
        {
          type: "vault_request_deposit",
          description: `Request deposit into vault ${input.vaultId.slice(0, 8)}… (mock unsigned)`,
        },
      ],
    };
  }
}

export async function buildRedeemSteps(input: {
  vaultId: string;
  ownerAddress: string;
  shareAmount: string;
}): Promise<{ steps: { type: string; to?: string; data?: string; value?: string; description: string }[]; note: string; source: "mcp" | "mock" }> {
  try {
    await mcpCall("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "harbor", version: "0.1.0" },
    });
    const result = await mcpCall(
      "tools/call",
      {
        name: "vault_build_request_redeem",
        arguments: input,
      },
      4,
    );
    const text = extractMcpText(result);
    return {
      steps: parseTxSteps(text, "redeem"),
      note: "Unsigned redeem calldata from IXS MCP.",
      source: "mcp",
    };
  } catch {
    return {
      source: "mock",
      note: "IXS MCP write path unavailable — mock redeem queue step for demo.",
      steps: [
        {
          type: "vault_request_redeem",
          description: `Queue redeem of ${input.shareAmount} shares (mock unsigned)`,
        },
      ],
    };
  }
}

function extractMcpText(result: unknown): string {
  const root = result as {
    result?: { content?: Array<{ text?: string }> };
    content?: Array<{ text?: string }>;
  };
  const content = root.result?.content ?? root.content ?? [];
  return content.map((c) => c.text ?? "").join("\n");
}

function parseTxSteps(
  text: string,
  fallbackType: string,
): { type: string; to?: string; data?: string; value?: string; description: string }[] {
  try {
    const parsed = JSON.parse(text) as {
      steps?: Array<Record<string, unknown>>;
      transactions?: Array<Record<string, unknown>>;
    };
    const raw = parsed.steps ?? parsed.transactions ?? [];
    if (Array.isArray(raw) && raw.length > 0) {
      return raw.map((step, i) => ({
        type: String(step.type ?? step.name ?? `${fallbackType}_${i + 1}`),
        to: typeof step.to === "string" ? step.to : undefined,
        data: typeof step.data === "string" ? step.data : undefined,
        value: typeof step.value === "string" ? step.value : undefined,
        description: String(
          step.description ?? step.type ?? `Unsigned ${fallbackType} step ${i + 1}`,
        ),
      }));
    }
  } catch {
    // fall through
  }

  if (!text.trim()) {
    return [
      {
        type: fallbackType,
        description: `Unsigned ${fallbackType} payload (empty MCP body)`,
      },
    ];
  }

  return [
    {
      type: fallbackType,
      description: text.slice(0, 240),
    },
  ];
}
