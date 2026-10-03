import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Radar, ShieldAlert, Search, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";

const defaultLiveFilters = {
  chains: ["base", "arbitrum"],
  feed: "both",
  min_liquidity_usd: 5000,
  max_liquidity_usd: 2500000,
  min_volume_24h_usd: 500,
  min_profit_usd: 25,
  focus_new_pools: true,
  focus_stable_mispricing: true,
  focus_microcaps: true,
  require_verified_dex: true,
  block_unknown_tax: true,
  limit: 40,
};

const chainOptions = [
  { id: "base", label: "Base Mainnet" },
  { id: "arbitrum", label: "Arbitrum One" },
];

function ChainToggle({ chain, enabled, onToggle }) {
  return (
    <div className="flex items-center justify-between gap-3 border border-[#2A2A2A] p-3">
      <span data-testid={`live-chain-label-${chain.id}`} className="text-sm text-zinc-200">{chain.label}</span>
      <Switch data-testid={`live-chain-switch-${chain.id}`} checked={enabled} onCheckedChange={() => onToggle(chain.id)} />
    </div>
  );
}

function LiveFilterPanel({ filters, setFilters, onScan, isScanning }) {
  const update = useCallback((key, value) => setFilters((current) => ({ ...current, [key]: value })), [setFilters]);
  const toggleChain = useCallback((chainId) => {
    setFilters((current) => {
      const chains = current.chains.includes(chainId) ? current.chains.filter((id) => id !== chainId) : [...current.chains, chainId];
      return { ...current, chains };
    });
  }, [setFilters]);

  return (
    <section data-testid="live-filter-panel" className="border border-[#2A2A2A] bg-[#121212] p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p data-testid="live-filter-kicker" className="text-xs uppercase tracking-[0.2em] text-[#00FF66]">Obscurity Filters</p>
          <h2 data-testid="live-filter-title" className="mt-2 font-heading text-2xl font-black tracking-tight text-white">Live discovery controls</h2>
        </div>
        <Radar data-testid="live-filter-icon" className="h-5 w-5 text-[#007AFF]" />
      </div>

      <div className="space-y-4">
        {chainOptions.map((chain) => <ChainToggle key={chain.id} chain={chain} enabled={filters.chains.includes(chain.id)} onToggle={toggleChain} />)}

        <div className="space-y-2">
          <Label data-testid="live-feed-label" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Feed</Label>
          <Select value={filters.feed} onValueChange={(value) => update("feed", value)}>
            <SelectTrigger data-testid="live-feed-select-trigger" className="rounded-none border-[#2A2A2A] bg-black text-white"><SelectValue /></SelectTrigger>
            <SelectContent data-testid="live-feed-select-content" className="border-[#2A2A2A] bg-[#121212] text-white">
              <SelectItem data-testid="live-feed-option-both" value="both">New + Trending</SelectItem>
              <SelectItem data-testid="live-feed-option-new" value="new">New pools only</SelectItem>
              <SelectItem data-testid="live-feed-option-trending" value="trending">Trending pools only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label data-testid="min-liquidity-label" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Min Liq</Label><Input data-testid="min-liquidity-input" type="number" value={filters.min_liquidity_usd} onChange={(e) => update("min_liquidity_usd", Number(e.target.value))} className="rounded-none border-[#2A2A2A] bg-black font-mono text-white" /></div>
          <div className="space-y-2"><Label data-testid="max-liquidity-label" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Max Liq</Label><Input data-testid="max-liquidity-input" type="number" value={filters.max_liquidity_usd} onChange={(e) => update("max_liquidity_usd", Number(e.target.value))} className="rounded-none border-[#2A2A2A] bg-black font-mono text-white" /></div>
          <div className="space-y-2"><Label data-testid="min-volume-label" className="text-xs uppercase tracking-[0.2em] text-zinc-500">24h Volume</Label><Input data-testid="min-volume-input" type="number" value={filters.min_volume_24h_usd} onChange={(e) => update("min_volume_24h_usd", Number(e.target.value))} className="rounded-none border-[#2A2A2A] bg-black font-mono text-white" /></div>
          <div className="space-y-2"><Label data-testid="live-min-profit-label" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Min Signal</Label><Input data-testid="live-min-profit-input" type="number" value={filters.min_profit_usd} onChange={(e) => update("min_profit_usd", Number(e.target.value))} className="rounded-none border-[#2A2A2A] bg-black font-mono text-white" /></div>
        </div>

        {[['focus_new_pools', 'New pools'], ['focus_stable_mispricing', 'Stable mispricing'], ['focus_microcaps', 'Micro-caps'], ['require_verified_dex', 'Require verified DEX'], ['block_unknown_tax', 'Block unknown token tax']].map(([key, label]) => (
          <div key={key} className="flex items-center justify-between gap-3 border border-[#2A2A2A] p-3">
            <span data-testid={`live-filter-label-${key}`} className="text-sm text-zinc-200">{label}</span>
            <Switch data-testid={`live-filter-switch-${key}`} checked={Boolean(filters[key])} onCheckedChange={(value) => update(key, value)} />
          </div>
        ))}

        <Button data-testid="live-obscure-scan-button" onClick={onScan} disabled={isScanning || filters.chains.length === 0} className="w-full rounded-none bg-[#007AFF] text-white hover:bg-[#3395FF]">
          <Search className="mr-2 h-4 w-4" /> {isScanning ? "Scanning live feeds" : "Scan obscure pairs"}
        </Button>
      </div>
    </section>
  );
}

function LiveOpportunityTable({ opportunities }) {
  return (
    <section data-testid="live-opportunity-section" className="border border-[#2A2A2A] bg-[#121212] p-5 xl:col-span-3">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><p data-testid="live-table-kicker" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Live Market Feed</p><h2 data-testid="live-table-title" className="mt-2 font-heading text-2xl font-black tracking-tight text-white">Overlooked pool candidates</h2></div>
        <Badge data-testid="live-source-badge" className="w-fit rounded-none border border-[#00FF66]/30 bg-[#00FF66]/10 text-[#00FF66]">LIVE public APIs</Badge>
      </div>
      <div className="overflow-x-auto border border-[#2A2A2A]">
        <Table data-testid="live-opportunity-table">
          <TableHeader data-testid="live-opportunity-header"><TableRow className="border-[#2A2A2A]"><TableHead data-testid="live-head-pair" className="text-zinc-500">Pair</TableHead><TableHead data-testid="live-head-liquidity" className="text-right text-zinc-500">Liquidity</TableHead><TableHead data-testid="live-head-volume" className="text-right text-zinc-500">Volume</TableHead><TableHead data-testid="live-head-edge" className="text-right text-zinc-500">Edge</TableHead><TableHead data-testid="live-head-risk" className="text-zinc-500">Safety</TableHead></TableRow></TableHeader>
          <TableBody data-testid="live-opportunity-body">
            {opportunities.length === 0 ? <TableRow data-testid="live-empty-row"><TableCell data-testid="live-empty-message" colSpan={5} className="py-10 text-center text-zinc-500">No live candidates under these filters. Relax liquidity, source, or risk controls.</TableCell></TableRow> : opportunities.map((item) => (
              <TableRow data-testid={`live-opportunity-row-${item.id}`} key={item.id} className="border-[#2A2A2A] hover:bg-[#007AFF]/10">
                <TableCell data-testid={`live-pair-${item.id}`} className="min-w-72 text-white"><span className="font-semibold">{item.pair_name}</span><p className="mt-1 font-mono text-xs text-zinc-500">{item.chain_name} · {item.dex_id}</p><p className="mt-1 break-all font-mono text-xs text-zinc-600">{item.pool_address}</p></TableCell>
                <TableCell data-testid={`live-liquidity-${item.id}`} className="text-right font-mono text-white">${item.liquidity_usd.toLocaleString()}</TableCell>
                <TableCell data-testid={`live-volume-${item.id}`} className="text-right font-mono text-zinc-300">${item.volume_24h_usd.toLocaleString()}</TableCell>
                <TableCell data-testid={`live-edge-${item.id}`} className="text-right font-mono text-[#00FF66]">{item.edge_score}<p className="text-xs text-zinc-500">${item.expected_profit_signal_usd}</p></TableCell>
                <TableCell data-testid={`live-risk-${item.id}`} className="min-w-72"><div className="flex flex-wrap gap-1">{item.risk_flags.slice(0, 4).map((flag) => <Badge data-testid={`live-risk-flag-${item.id}-${flag}`} key={flag} className="rounded-none border border-[#FFB020]/30 bg-[#FFB020]/10 text-[#FFB020]">{flag}</Badge>)}</div>{item.execution_blocked && <p data-testid={`live-block-reasons-${item.id}`} className="mt-2 text-xs text-[#FF8A84]">Blocked: {item.block_reasons.join(', ')}</p>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

export default function LiveDiscoveryPage() {
  const [filters, setFilters] = useState(defaultLiveFilters);
  const [scan, setScan] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const opportunities = useMemo(() => scan?.opportunities || [], [scan?.opportunities]);
  const unblockedCount = useMemo(() => opportunities.filter((item) => !item.execution_blocked).length, [opportunities]);

  const runScan = useCallback(async () => {
    setIsScanning(true);
    try {
      const data = await api.liveObscureScan(filters);
      setScan(data);
      toast.success(`Live scan found ${data.opportunities.length} candidate(s)`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsScanning(false);
    }
  }, [filters]);

  return (
    <main data-testid="live-discovery-page" className="space-y-6">
      <section data-testid="live-hero" className="border border-[#2A2A2A] bg-[#121212] p-6 sm:p-8">
        <p data-testid="live-hero-kicker" className="text-xs uppercase tracking-[0.2em] text-[#00FF66]">Base + Arbitrum mainnet discovery</p>
        <h1 data-testid="live-hero-title" className="mt-4 font-heading text-4xl font-black leading-none tracking-tight text-white sm:text-5xl">Find obscure pools competitors may overlook.</h1>
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div data-testid="live-metric-candidates" className="border border-[#2A2A2A] bg-black p-4"><p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Candidates</p><p className="mt-2 font-mono text-2xl text-white">{opportunities.length}</p></div>
          <div data-testid="live-metric-unblocked" className="border border-[#2A2A2A] bg-black p-4"><p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Unblocked</p><p className="mt-2 font-mono text-2xl text-[#00FF66]">{unblockedCount}</p></div>
          <div data-testid="live-metric-source" className="border border-[#2A2A2A] bg-black p-4"><p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Mode</p><p className="mt-2 font-mono text-lg text-white"><Zap className="mr-2 inline h-5 w-5 text-[#007AFF]" />LIVE scan</p></div>
        </div>
      </section>

      <section data-testid="live-safety-note" className="flex items-start gap-3 border border-[#FFB020]/30 bg-[#FFB020]/10 p-4 text-[#FFD08A]"><ShieldAlert className="mt-0.5 h-5 w-5" /><p className="text-sm">Mainnet discovery is live, but execution should stay blocked until a pool passes token-tax/honeypot checks, verified DEX checks, liquidity thresholds, and testnet/fork validation.</p></section>

      {scan?.source_warnings?.length > 0 && (
        <section data-testid="live-source-warning" className="border border-[#FFB020]/30 bg-black p-4 text-sm text-[#FFD08A]">
          Some public sources are rate-limited right now; showing partial live results from available feeds.
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        <LiveFilterPanel filters={filters} setFilters={setFilters} onScan={runScan} isScanning={isScanning} />
        <LiveOpportunityTable opportunities={opportunities} />
      </div>
    </main>
  );
}