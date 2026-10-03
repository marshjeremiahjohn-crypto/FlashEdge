import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Activity, Cpu, Gauge } from "lucide-react";
import { MetricCard } from "@/components/MetricCard";
import { WalletPanel } from "@/components/WalletPanel";
import { ControlPanel } from "@/components/ControlPanel";
import { OpportunityTable } from "@/components/OpportunityTable";
import { TransactionConsole } from "@/components/TransactionConsole";
import { CHAINS, DEXES } from "@/data/defiConfig";
import { api } from "@/lib/api";

const defaultSettings = {
  chain_id: CHAINS[0].chainId,
  provider: "balancer",
  pair: "WETH/USDC",
  loan_amount: 250000,
  selected_dexes: DEXES.map((dex) => dex.id),
  max_slippage_bps: 45,
  min_profit_usd: 25,
  gas_gwei: 0.35,
  route_depth: 2,
  risk_profile: "balanced",
};

export default function DashboardPage({ wallet }) {
  const [settings, setSettings] = useState(defaultSettings);
  const [scan, setScan] = useState(null);
  const [selectedOpportunity, setSelectedOpportunity] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [lastTxHash, setLastTxHash] = useState("");
  const didRunInitialScan = useRef(false);

  const opportunities = useMemo(() => scan?.opportunities || [], [scan?.opportunities]);
  const best = opportunities[0];
  const avgConfidence = useMemo(() => {
    if (!opportunities.length) return 0;
    const totalConfidence = opportunities.reduce((sum, item) => sum + item.confidence, 0);
    return Math.round(totalConfidence / opportunities.length);
  }, [opportunities]);

  const scanOpportunities = useCallback(async () => {
    setIsScanning(true);
    try {
      const data = await api.scan(settings);
      setScan(data);
      setSelectedOpportunity(data.opportunities[0] || null);
      toast.success(`Scan complete: ${data.opportunities.length} route(s)`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsScanning(false);
    }
  }, [settings]);

  const saveStrategy = useCallback(async () => {
    try {
      await api.saveStrategy({ ...settings, name: `${settings.pair} ${settings.provider} ${new Date().toLocaleTimeString()}` });
      toast.success("Strategy saved");
    } catch (error) {
      toast.error(error.message);
    }
  }, [settings]);

  const handleChainChange = useCallback(async (chainId) => {
    setSettings((current) => ({ ...current, chain_id: chainId }));
    if (wallet.account) await wallet.switchNetwork(chainId);
  }, [wallet]);

  useEffect(() => {
    if (didRunInitialScan.current) return;
    didRunInitialScan.current = true;
    scanOpportunities();
  }, [scanOpportunities]);

  return (
    <main data-testid="dashboard-page" className="space-y-6">
      <section data-testid="dashboard-hero" className="relative overflow-hidden border border-[#2A2A2A] bg-[#0A0A0A] p-6 sm:p-8">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1517241034903-9a4c3ab12f00?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxOTF8MHwxfHNlYXJjaHwyfHxkYXJrJTIwZ2VvbWV0cmljJTIwdGV4dHVyZSUyMGFic3RyYWN0fGVufDB8fHx8MTc4MDY0MDA3Mnww&ixlib=rb-4.1.0&q=85')] bg-cover bg-center opacity-20" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p data-testid="dashboard-hero-kicker" className="text-xs uppercase tracking-[0.2em] text-[#00FF66]">Multi-chain flash arbitrage console</p>
            <h1 data-testid="dashboard-hero-title" className="mt-4 max-w-4xl font-heading text-4xl font-black leading-none tracking-tight text-white sm:text-5xl lg:text-6xl">Tune routes. Simulate edge. Send wallet-signed flash transactions.</h1>
          </div>
          <div data-testid="dashboard-hero-status" className="flex items-center gap-3 border border-[#2A2A2A] bg-black/70 p-3 font-mono text-sm text-zinc-300">
            <Activity className="h-4 w-4 text-[#00FF66]" /> Engine online · Testnet-first
          </div>
        </div>
      </section>

      <WalletPanel wallet={wallet} selectedChainId={settings.chain_id} onChainChange={handleChainChange} chainOptions={CHAINS} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard testId="metric-best-profit" label="Best Net Profit" value={best ? `$${best.net_profit_usd}` : "$0.00"} detail={best ? `${best.buy_dex} → ${best.sell_dex}` : "Awaiting scan"} tone="profit" />
        <MetricCard testId="metric-route-count" label="Qualified Routes" value={String(opportunities.length)} detail={`${settings.selected_dexes.length} DEX venues enabled`} />
        <MetricCard testId="metric-confidence" label="Avg Confidence" value={`${avgConfidence}%`} detail={lastTxHash ? `Last tx ${lastTxHash.slice(0, 10)}…` : "No transaction submitted"} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        <ControlPanel settings={settings} setSettings={setSettings} onScan={scanOpportunities} onSave={saveStrategy} isScanning={isScanning} />
        <OpportunityTable opportunities={opportunities} selectedId={selectedOpportunity?.id} onSelect={setSelectedOpportunity} />
        <TransactionConsole settings={settings} wallet={wallet} selectedOpportunity={selectedOpportunity} onExecuted={setLastTxHash} />
      </div>

      <section data-testid="selected-opportunity-panel" className="grid grid-cols-1 gap-4 border border-[#2A2A2A] bg-[#121212] p-5 md:grid-cols-3">
        <div className="flex items-center gap-3">
          <Cpu data-testid="selected-opportunity-icon" className="h-5 w-5 text-[#007AFF]" />
          <div>
            <p data-testid="selected-opportunity-label" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Selected Route</p>
            <p data-testid="selected-opportunity-route" className="font-mono text-sm text-white">{selectedOpportunity ? selectedOpportunity.route.join(" / ") : "None"}</p>
          </div>
        </div>
        <div>
          <p data-testid="selected-opportunity-risk-label" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Risk Score</p>
          <p data-testid="selected-opportunity-risk" className="font-mono text-xl text-white">{selectedOpportunity?.risk_score || 0}/99</p>
        </div>
        <div>
          <p data-testid="selected-opportunity-window-label" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Execution Window</p>
          <p data-testid="selected-opportunity-window" className="font-mono text-xl text-[#00FF66]"><Gauge className="mr-2 inline h-5 w-5" />{selectedOpportunity?.execution_window_blocks || 0} blocks</p>
        </div>
      </section>
    </main>
  );
}