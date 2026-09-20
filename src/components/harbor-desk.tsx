"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Anchor, Loader2, ShieldAlert, Waves } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DEFAULT_MANDATE,
  type ClaimRequest,
  type DecisionLedgerEntry,
  type HarborVault,
  type Mandate,
} from "@/lib/types";

type VaultsResponse = {
  vaults: HarborVault[];
  source: "live" | "fallback";
  error?: string;
};

const PROMPT_EXAMPLES = [
  "Park $2,500 idle USDC in licensed RWA",
  "Redeem $800 from the Avalanche vault",
  "Should we hold until claims settle?",
  "Allocate everything to the highest yield vault",
];

export function HarborDesk() {
  const [mandate, setMandate] = useState<Mandate>(DEFAULT_MANDATE);
  const [vaults, setVaults] = useState<HarborVault[]>([]);
  const [vaultSource, setVaultSource] = useState<"live" | "fallback" | "loading">(
    "loading",
  );
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [claims, setClaims] = useState<ClaimRequest[]>([]);
  const [servConfigured, setServConfigured] = useState(false);
  const [prompt, setPrompt] = useState(PROMPT_EXAMPLES[0]);
  const [ledger, setLedger] = useState<DecisionLedgerEntry[]>([]);
  const [txNote, setTxNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quoteMemo, setQuoteMemo] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [quotePending, startQuote] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [vRes, cRes] = await Promise.all([
          fetch("/api/vaults"),
          fetch("/api/claims"),
        ]);
        const vData = (await vRes.json()) as VaultsResponse;
        const cData = (await cRes.json()) as {
          claims: ClaimRequest[];
          servConfigured: boolean;
        };
        if (cancelled) return;
        setVaults(vData.vaults);
        setVaultSource(vData.source);
        setVaultError(vData.error ?? null);
        setClaims(cData.claims);
        setServConfigured(cData.servConfigured);
      } catch (e) {
        if (!cancelled) {
          setVaultSource("fallback");
          setVaultError(e instanceof Error ? e.message : "Failed to load vaults");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const conflicts = useMemo(() => {
    const notes: string[] = [];
    if (mandate.maxRwaPercent > 80 && mandate.liquidityBufferUsdc < 2000) {
      notes.push(
        "High RWA cap with a thin buffer — yield vs liquidity conflict.",
      );
    }
    if (mandate.permissionlessOnly) {
      notes.push(
        "Permissionless-only: KYC vaults stay visible but Harbor will refuse them.",
      );
    }
    if (mandate.maxTicketUsdc > mandate.idleUsdc - mandate.liquidityBufferUsdc) {
      notes.push(
        "Max ticket exceeds allocatable idle after buffer — tickets will be capped or refused.",
      );
    }
    return notes;
  }, [mandate]);

  function updateMandate<K extends keyof Mandate>(key: K, value: Mandate[K]) {
    setMandate((m) => ({ ...m, [key]: value }));
  }

  function runAllocate() {
    setError(null);
    setTxNote(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/allocate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, mandate, claims }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Allocate failed");
        setLedger((prev) => [data.entry as DecisionLedgerEntry, ...prev]);
        setTxNote(data.txNote || null);
        setServConfigured(Boolean(data.servConfigured));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Allocate failed");
      }
    });
  }

  function runQuote(paid: boolean) {
    setQuoteError(null);
    setQuoteMemo(null);
    startQuote(async () => {
      try {
        const res = await fetch("/api/quote", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(paid ? { "X-Harbor-Paid": "demo" } : {}),
          },
          body: JSON.stringify({
            mandate,
            idleUsdc: mandate.idleUsdc,
            prompt: `Should $${mandate.idleUsdc} idle USDC sit in licensed IXS RWA right now?`,
          }),
        });
        const data = await res.json();
        if (res.status === 402) {
          setQuoteError(
            `${data.paywallHint ?? "Payment required"} ($${data.priceUsdc} USDC)`,
          );
          return;
        }
        if (!res.ok) throw new Error(data.error ?? "Quote failed");
        setQuoteMemo(data.memo as string);
      } catch (e) {
        setQuoteError(e instanceof Error ? e.message : "Quote failed");
      }
    });
  }

  function advanceClaim(id: string) {
    setClaims((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        if (c.status === "requested") {
          return {
            ...c,
            status: "claimable",
            note: "Now claimable — build claim tx before new allocates.",
          };
        }
        if (c.status === "claimable") {
          return {
            ...c,
            status: "settled",
            note: "Settled. Capital may return to idle / RWA NAV.",
          };
        }
        return c;
      }),
    );
  }

  const latest = ledger[0];

  return (
    <div className="harbor-shell min-h-screen">
      <header className="harbor-nav">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="harbor-mark" aria-hidden>
              <Anchor className="size-4" />
            </div>
            <div>
              <p className="font-display text-xl tracking-tight text-[var(--harbor-ink)]">
                Harbor
              </p>
              <p className="text-xs text-[var(--harbor-mute)]">
                IXS RWA desk · OpenServ Edition 01
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="harbor-chip">
              {servConfigured ? "SERV live" : "Mock reasoner"}
            </Badge>
            <Badge variant="outline" className="harbor-chip">
              Vaults {vaultSource === "loading" ? "…" : vaultSource}
            </Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8 sm:px-6">
        <section className="harbor-hero">
          <div className="harbor-hero-copy">
            <p className="harbor-kicker">
              <Waves className="size-3.5" />
              Fiduciary for agent treasuries
            </p>
            <h1 className="font-display text-4xl leading-[1.05] tracking-tight text-[var(--harbor-ink)] sm:text-5xl">
              Harbor
            </h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--harbor-mute)] sm:text-base">
              Write a mandate. SERV decides allocate, hold, redeem, or wait for
              claim. IXS builds unsigned vault txs — Harbor never pretends a
              queued ERC-7540 request is cash.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button onClick={() => document.getElementById("desk")?.scrollIntoView({ behavior: "smooth" })}>
                Open the desk
              </Button>
              <Button variant="outline" onClick={() => runQuote(false)}>
                Probe quote API
              </Button>
            </div>
          </div>
          <div className="harbor-hero-panel" aria-hidden>
            <div className="harbor-tide" />
            <div className="harbor-tide harbor-tide-2" />
            <p className="relative z-10 font-display text-2xl text-[var(--harbor-foam)]">
              Idle USDC → licensed RWA
            </p>
            <p className="relative z-10 mt-2 max-w-xs text-sm text-[var(--harbor-foam)]/75">
              Settlement-aware. Mandate-gated. Auditable.
            </p>
          </div>
        </section>

        {!servConfigured && (
          <div className="harbor-banner mt-6">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              No <code className="font-mono text-xs">SERV_API_KEY</code> — using
              the deterministic mock reasoner. Add a key from{" "}
              <a
                className="underline underline-offset-2"
                href="https://console.openserv.ai"
                target="_blank"
                rel="noreferrer"
              >
                console.openserv.ai
              </a>{" "}
              and enable org data collection to be hackathon-eligible.
            </p>
          </div>
        )}

        {vaultError && vaultSource === "fallback" && (
          <div className="harbor-banner harbor-banner-warn mt-3">
            <p>
              IXS live feed unavailable ({vaultError}). Showing cached vault
              board so the desk stays demoable.
            </p>
          </div>
        )}

        <div id="desk" className="mt-10 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="harbor-panel space-y-5">
            <div>
              <h2 className="font-display text-2xl text-[var(--harbor-ink)]">
                Mandate
              </h2>
              <p className="mt-1 text-sm text-[var(--harbor-mute)]">
                Conflicting rules are a feature — Harbor surfaces them before it
                acts.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`Idle USDC · $${mandate.idleUsdc.toLocaleString()}`}>
                <Slider
                  value={[mandate.idleUsdc]}
                  min={0}
                  max={100000}
                  step={100}
                  onValueChange={(v) => {
                    const val = Array.isArray(v) ? v[0] : v;
                    updateMandate("idleUsdc", Number(val));
                  }}
                />
              </Field>
              <Field
                label={`Max RWA · ${mandate.maxRwaPercent}%`}
              >
                <Slider
                  value={[mandate.maxRwaPercent]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(v) => {
                    const val = Array.isArray(v) ? v[0] : v;
                    updateMandate("maxRwaPercent", Number(val));
                  }}
                />
              </Field>
              <Field
                label={`Liquidity buffer · $${mandate.liquidityBufferUsdc.toLocaleString()}`}
              >
                <Slider
                  value={[mandate.liquidityBufferUsdc]}
                  min={0}
                  max={50000}
                  step={100}
                  onValueChange={(v) => {
                    const val = Array.isArray(v) ? v[0] : v;
                    updateMandate("liquidityBufferUsdc", Number(val));
                  }}
                />
              </Field>
              <Field
                label={`Max ticket · $${mandate.maxTicketUsdc.toLocaleString()}`}
              >
                <Slider
                  value={[mandate.maxTicketUsdc]}
                  min={0}
                  max={50000}
                  step={100}
                  onValueChange={(v) => {
                    const val = Array.isArray(v) ? v[0] : v;
                    updateMandate("maxTicketUsdc", Number(val));
                  }}
                />
              </Field>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--harbor-line)] bg-[var(--harbor-wash)] px-3 py-2.5">
              <div>
                <Label htmlFor="perm">Permissionless vaults only</Label>
                <p className="text-xs text-[var(--harbor-mute)]">
                  Refuse KYC / whitelist vaults
                </p>
              </div>
              <Switch
                id="perm"
                checked={mandate.permissionlessOnly}
                onCheckedChange={(v) =>
                  updateMandate("permissionlessOnly", Boolean(v))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Standing notes</Label>
              <Textarea
                id="notes"
                value={mandate.operatorNotes}
                onChange={(e) => updateMandate("operatorNotes", e.target.value)}
                rows={3}
              />
            </div>

            {conflicts.length > 0 && (
              <ul className="space-y-1.5 rounded-lg border border-amber-700/20 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">
                {conflicts.map((c) => (
                  <li key={c}>· {c}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="harbor-panel space-y-4">
            <div>
              <h2 className="font-display text-2xl text-[var(--harbor-ink)]">
                Allocator
              </h2>
              <p className="mt-1 text-sm text-[var(--harbor-mute)]">
                Chat the desk. Refusals are winning behavior.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {PROMPT_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className="rounded-full border border-[var(--harbor-line)] bg-white/60 px-3 py-1 text-xs text-[var(--harbor-ink)] transition hover:border-[var(--harbor-sea)]"
                  onClick={() => setPrompt(ex)}
                >
                  {ex}
                </button>
              ))}
            </div>

            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="Park idle USDC…"
            />

            <Button className="w-full" disabled={pending || !prompt.trim()} onClick={runAllocate}>
              {pending ? (
                <>
                  <Loader2 className="animate-spin" />
                  Reasoning…
                </>
              ) : (
                "Ask Harbor"
              )}
            </Button>

            {error && (
              <p className="text-sm text-red-700" role="alert">
                {error}
              </p>
            )}

            {latest && (
              <DecisionCard entry={latest} txNote={txNote} />
            )}
          </section>
        </div>

        <Tabs defaultValue="vaults" className="mt-8">
          <TabsList className="harbor-tabs">
            <TabsTrigger value="vaults">Vault board</TabsTrigger>
            <TabsTrigger value="claims">Claim queue</TabsTrigger>
            <TabsTrigger value="ledger">Decision ledger</TabsTrigger>
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
          </TabsList>

          <TabsContent value="vaults" className="mt-4">
            <div className="grid gap-3 md:grid-cols-2">
              {vaultSource === "loading" && (
                <p className="text-sm text-[var(--harbor-mute)]">Loading IXS vaults…</p>
              )}
              {vaults.map((v) => (
                <VaultCard key={v.id} vault={v} mandate={mandate} />
              ))}
              {vaultSource !== "loading" && vaults.length === 0 && (
                <p className="text-sm text-[var(--harbor-mute)]">
                  No vaults returned. Check IXS connectivity.
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="claims" className="mt-4">
            <div className="space-y-3">
              <p className="text-sm text-[var(--harbor-mute)]">
                Async capital is not cash. Advance a claim to see Harbor block or
                clear allocates.
              </p>
              {claims.map((c) => (
                <div key={c.id} className="harbor-row">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-[var(--harbor-ink)]">
                        {c.kind} · {c.vaultName}
                      </p>
                      <p className="text-sm text-[var(--harbor-mute)]">
                        {c.amountLabel}
                      </p>
                      <p className="mt-1 text-xs text-[var(--harbor-mute)]">
                        {c.note}
                      </p>
                    </div>
                    <Badge
                      variant={
                        c.status === "claimable"
                          ? "default"
                          : c.status === "settled"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {c.status}
                    </Badge>
                  </div>
                  {c.status !== "settled" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      onClick={() => advanceClaim(c.id)}
                    >
                      {c.status === "requested"
                        ? "Mark claimable"
                        : "Mark settled"}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="ledger" className="mt-4">
            <ScrollArea className="h-[420px] rounded-xl border border-[var(--harbor-line)] bg-white/50 p-3">
              {ledger.length === 0 ? (
                <p className="p-4 text-sm text-[var(--harbor-mute)]">
                  Empty ledger. Ask Harbor for an allocation decision.
                </p>
              ) : (
                <div className="space-y-3">
                  {ledger.map((e) => (
                    <DecisionCard key={e.id} entry={e} compact />
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="revenue" className="mt-4">
            <div className="harbor-panel space-y-4">
              <div>
                <h3 className="font-display text-xl">Paid allocation memo</h3>
                <p className="mt-1 text-sm text-[var(--harbor-mute)]">
                  <code className="text-xs">POST /api/quote</code> — other agents
                  pay $0.25 USDC for “should idle USDC sit in licensed RWA right
                  now?” Demo paywall via <code className="text-xs">X-Harbor-Paid</code>.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={quotePending} onClick={() => runQuote(false)}>
                  Call unpaid (expect 402)
                </Button>
                <Button disabled={quotePending} onClick={() => runQuote(true)}>
                  {quotePending ? "Quoting…" : "Pay demo & unlock"}
                </Button>
              </div>
              {quoteError && (
                <p className="rounded-lg border border-amber-700/20 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  {quoteError}
                </p>
              )}
              {quoteMemo && (
                <pre className="overflow-x-auto rounded-lg bg-[var(--harbor-deep)] p-4 text-xs leading-relaxed text-[var(--harbor-foam)] whitespace-pre-wrap">
                  {quoteMemo}
                </pre>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-t border-[var(--harbor-line)] py-8 text-center text-xs text-[var(--harbor-mute)]">
        Harbor · OpenServ hackathon track: IXS Vaults · Submissions close 28 Sep
        2026 00:00 UTC
      </footer>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function VaultCard({
  vault,
  mandate,
}: {
  vault: HarborVault;
  mandate: Mandate;
}) {
  const blocked = mandate.permissionlessOnly && vault.requiresWhitelist;
  return (
    <article className={`harbor-row ${blocked ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium text-[var(--harbor-ink)]">{vault.name}</h3>
          <p className="text-xs text-[var(--harbor-mute)]">
            {vault.chainName} · {vault.symbol}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge variant={vault.requiresWhitelist ? "outline" : "default"}>
            {vault.requiresWhitelist ? "KYC" : "Permissionless"}
          </Badge>
          <Badge variant="secondary">{vault.settlement}</Badge>
        </div>
      </div>
      <p className="mt-2 line-clamp-3 text-sm text-[var(--harbor-mute)]">
        {vault.description ?? "IXS licensed RWA vault."}
      </p>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--harbor-mute)]">
        <span>
          PPS{" "}
          {vault.pricePerShare != null
            ? vault.pricePerShare.toFixed(4)
            : "—"}
        </span>
        <span className="font-mono">
          {vault.contractAddress.slice(0, 6)}…{vault.contractAddress.slice(-4)}
        </span>
        {blocked && <span className="text-amber-800">Mandate refuse</span>}
      </div>
    </article>
  );
}

function DecisionCard({
  entry,
  txNote,
  compact,
}: {
  entry: DecisionLedgerEntry;
  txNote?: string | null;
  compact?: boolean;
}) {
  const d = entry.decision;
  return (
    <article className="harbor-row animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge
          variant={
            d.action === "refuse" || d.action === "wait_for_claim"
              ? "outline"
              : "default"
          }
        >
          {d.action}
        </Badge>
        <div className="flex gap-1.5 text-[10px] uppercase tracking-wide text-[var(--harbor-mute)]">
          <span>{entry.source}</span>
          <span>·</span>
          <span>shadow {entry.shadowAgent}</span>
        </div>
      </div>
      {!compact && (
        <p className="mt-2 text-sm text-[var(--harbor-mute)]">“{entry.prompt}”</p>
      )}
      <p className="mt-2 text-sm font-medium text-[var(--harbor-ink)]">
        {d.vaultName ?? "No vault"}
        {d.sizeUsdc != null ? ` · $${d.sizeUsdc.toLocaleString()}` : ""}
      </p>
      <ul className="mt-2 space-y-1 text-sm text-[var(--harbor-mute)]">
        {d.reasons.map((r) => (
          <li key={r}>· {r}</li>
        ))}
      </ul>
      {d.nextClaimStep && (
        <p className="mt-2 rounded-md bg-[var(--harbor-wash)] px-2 py-1.5 text-xs text-[var(--harbor-ink)]">
          Next: {d.nextClaimStep}
        </p>
      )}
      {!compact && (
        <>
          <Separator className="my-3" />
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {Object.entries(d.mandateChecks).map(([k, v]) => (
              <div key={k} className="rounded-md border border-[var(--harbor-line)] px-2 py-1">
                <span className="text-[var(--harbor-mute)]">{k}</span>
                <p className={v ? "text-emerald-800" : "text-red-700"}>
                  {v ? "ok" : "fail"}
                </p>
              </div>
            ))}
          </div>
          {entry.txSteps.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs font-medium text-[var(--harbor-ink)]">
                Unsigned tx steps
              </p>
              {entry.txSteps.map((s, i) => (
                <p key={`${s.type}-${i}`} className="font-mono text-[11px] text-[var(--harbor-mute)]">
                  {s.type}: {s.description}
                </p>
              ))}
              {txNote && (
                <p className="text-[11px] text-[var(--harbor-mute)]">{txNote}</p>
              )}
            </div>
          )}
        </>
      )}
    </article>
  );
}
