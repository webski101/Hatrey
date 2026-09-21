# Hatrey

Mandate-gated RWA treasury desk for the **OpenServ Hackathon Edition 01 — IXS Vaults** track.

Hatrey is a fiduciary for **agent treasuries**. An operator writes a mandate (idle USDC, RWA cap, liquidity buffer, permissionless-only, max ticket). **SERV Reasoning** decides `allocate` / `hold` / `redeem` / `wait_for_claim` / `refuse`. **IXS** REST + MCP supply live vaults and unsigned deposit/redeem calldata. Hatrey never treats a queued ERC-7540 request as cash.

## Why this exists

IXS already ships vaults and MCP tools. Most hackathon entries will wrap “deposit USDC.” Hatrey is the missing **policy + settlement-aware allocator + audit ledger + paid quote API**.

## Stack

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- SERV Reasoning API (`inference-api.openserv.ai`) with `serv_shadow_agent` + `serv_prompt_guard`
- IXS Vault REST (`/vaults`) and MCP (`/mcp`)

## Run locally

```bash
npm install
cp .env.example .env.local   # optional SERV_API_KEY
npm run dev
```

Open [http://127.0.0.1:43131](http://127.0.0.1:43131).

Without `SERV_API_KEY`, Hatrey uses a deterministic mock reasoner so the desk stays fully demoable.

## Environment

| Variable | Required | Description |
| --- | --- | --- |
| `SERV_API_KEY` | No | OpenServ console API key. Enables live SERV + shadow agent. |
| `SERV_MODEL` | No | Defaults to `gpt-4.1-mini`. |
| `IXS_API_BASE_URL` | No | Defaults to `https://api-v2.ixs.finance`. |
| `IXS_MCP_URL` | No | Defaults to `https://api-v2.ixs.finance/mcp`. |

## Desk surfaces

1. **Mandate** — sliders + permissionless switch; surfaces rule conflicts.
2. **Allocator** — chat the desk; refusals and claim waits are first-class.
3. **Vault board** — live IXS vaults (permissionless vs KYC, settlement).
4. **Claim queue** — demo async settlement; advance claims to see Hatrey block allocates.
5. **Decision ledger** — every ask with mandate checks + unsigned tx steps.
6. **Revenue** — `POST /api/quote` returns HTTP 402 until `X-Hatrey-Paid: demo`.

## API

- `GET /api/vaults` — IXS vault board (live with fallback)
- `POST /api/allocate` — mandate + prompt → decision + unsigned steps
- `GET /api/claims` — demo claim queue
- `GET|POST /api/quote` — paid allocation memo ($0.25 demo)

## Hackathon entry checklist

1. Create an account at [console.openserv.ai](https://console.openserv.ai) and enable **data collection** at `/settings/organization`.
2. Create an API key; put it in `.env.local` as `SERV_API_KEY`.
3. Ship a public demo + GitHub.
4. Before **28 September 2026, 00:00 UTC**: post on X with name, concept, images, links, tag **@openservai**, then fill the official form linked from [openserv.ai/hackathon](https://www.openserv.ai/hackathon).

## License

MIT
