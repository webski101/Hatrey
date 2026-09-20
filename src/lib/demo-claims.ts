import type { ClaimRequest } from "@/lib/types";

/** Seed claim queue so demos show Harbor's settlement differentiator without on-chain history. */
export const DEMO_CLAIMS: ClaimRequest[] = [
  {
    id: "req_demo_deposit_01",
    vaultId: "6a26624ca7d16b245d665475",
    vaultName: "IX High Yield Bond (USDC) — Permissionless",
    kind: "deposit",
    amountLabel: "1,500 USDC → shares (queued)",
    status: "requested",
    settlement: "queued",
    requestedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    note: "Deposit submitted. Not settled — do not count as RWA position NAV yet.",
  },
  {
    id: "req_demo_redeem_02",
    vaultId: "6a952729732c2b84b55ce89d",
    vaultName: "IX High Yield Bond (USDC) — Avalanche Open",
    kind: "redeem",
    amountLabel: "800 shares → USDC",
    status: "claimable",
    settlement: "async-erc7540",
    requestedAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    note: "Claimable now. Harbor blocks new allocates until claim tx is built and sent.",
  },
];
