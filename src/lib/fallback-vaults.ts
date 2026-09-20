import type { HarborVault } from "@/lib/types";

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
