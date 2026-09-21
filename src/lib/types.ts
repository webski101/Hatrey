import { z } from "zod";

export const MandateSchema = z.object({
  idleUsdc: z.number().min(0).default(10000),
  maxRwaPercent: z.number().min(0).max(100).default(60),
  liquidityBufferUsdc: z.number().min(0).default(2500),
  permissionlessOnly: z.boolean().default(true),
  maxTicketUsdc: z.number().min(0).default(5000),
  redeemCooldownHours: z.number().min(0).default(24),
  operatorNotes: z.string().default(""),
});

export type Mandate = z.infer<typeof MandateSchema>;

export const DEFAULT_MANDATE: Mandate = {
  idleUsdc: 10000,
  maxRwaPercent: 60,
  liquidityBufferUsdc: 2500,
  permissionlessOnly: true,
  maxTicketUsdc: 5000,
  redeemCooldownHours: 24,
  operatorNotes: "Park idle USDC only. Never treat queued redemptions as cash.",
};

export type VaultSettlement = "sync" | "async-erc7540" | "queued" | "unknown";

export type HatreyVault = {
  id: string;
  name: string;
  symbol: string;
  chainId: number;
  chainName: string;
  network: string;
  contractAddress: string;
  explorerUrl: string | null;
  underlyingSymbol: string;
  underlyingDecimals: number;
  requiresWhitelist: boolean;
  status: string;
  productId: string | null;
  description: string | null;
  riskBullets: string[];
  actions: string[];
  pricePerShare: number | null;
  settlement: VaultSettlement;
};

export type AllocationAction =
  | "allocate"
  | "hold"
  | "redeem"
  | "wait_for_claim"
  | "refuse";

export const AllocationDecisionSchema = z.object({
  action: z.enum([
    "allocate",
    "hold",
    "redeem",
    "wait_for_claim",
    "refuse",
  ]),
  vaultId: z.string().nullable(),
  vaultName: z.string().nullable(),
  sizeUsdc: z.number().nullable(),
  reasons: z.array(z.string()).min(1),
  settlement: z.enum(["sync", "async-erc7540", "queued", "unknown"]).nullable(),
  nextClaimStep: z.string().nullable(),
  mandateChecks: z.object({
    bufferOk: z.boolean(),
    ticketOk: z.boolean(),
    whitelistOk: z.boolean(),
    rwaCapOk: z.boolean(),
  }),
  confidence: z.number().min(0).max(1),
});

export type AllocationDecision = z.infer<typeof AllocationDecisionSchema>;

export type ClaimStatus = "requested" | "claimable" | "settled";

export type ClaimRequest = {
  id: string;
  vaultId: string;
  vaultName: string;
  kind: "deposit" | "redeem";
  amountLabel: string;
  status: ClaimStatus;
  settlement: VaultSettlement;
  requestedAt: string;
  note: string;
};

export type TxStep = {
  type: string;
  to?: string;
  data?: string;
  value?: string;
  description: string;
};

export type DecisionLedgerEntry = {
  id: string;
  createdAt: string;
  prompt: string;
  mandate: Mandate;
  decision: AllocationDecision;
  source: "serv" | "mock";
  shadowAgent: "passed" | "revised" | "skipped" | "exhausted";
  txSteps: TxStep[];
};

export type QuoteResponse = {
  priced: boolean;
  priceUsdc: number;
  paywallHint: string;
  decision: AllocationDecision;
  memo: string;
  source: "serv" | "mock";
};
