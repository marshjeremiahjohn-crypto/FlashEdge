import { useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export function OpportunityTable({ opportunities, onSelect, selectedId }) {
  const chartData = useMemo(() => opportunities.map((item, index) => ({
    name: `R${index + 1}`,
    profit: item.net_profit_usd,
    spread: item.spread_bps,
  })), [opportunities]);
  const maxProfit = useMemo(() => Math.max(1, ...chartData.map((item) => item.profit)), [chartData]);
  return (
    <section data-testid="opportunity-panel" className="border border-[#2A2A2A] bg-[#121212] p-5 lg:col-span-2">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p data-testid="opportunity-panel-kicker" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Profitability Scanner</p>
          <h2 data-testid="opportunity-panel-title" className="mt-2 font-heading text-2xl font-black tracking-tight text-white">Route intelligence</h2>
        </div>
        <Badge data-testid="scanner-mode-badge" className="w-fit rounded-none border border-[#FFB020]/30 bg-[#FFB020]/10 text-[#FFB020]">SIMULATED testnet feed</Badge>
      </div>

      <div data-testid="profit-chart" className="flex h-52 items-end gap-2 border border-[#2A2A2A] bg-black/40 p-3">
        {chartData.length === 0 ? (
          <div data-testid="profit-chart-empty" className="grid h-full w-full place-items-center text-sm text-zinc-500">Awaiting profitable routes</div>
        ) : chartData.map((item) => {
          const heightPercent = Math.max(8, Math.round((item.profit / maxProfit) * 100));
          return (
            <div data-testid={`profit-chart-bar-${item.name}`} key={item.name} className="flex h-full min-w-10 flex-1 flex-col justify-end gap-2">
              <div className="flex items-end justify-center" style={{ height: `${heightPercent}%` }}>
                <div className="w-full border border-[#00FF66]/40 bg-[#00FF66]/20 shadow-[0_0_18px_rgba(0,255,102,0.15)]" style={{ height: "100%" }} />
              </div>
              <div className="text-center font-mono text-[10px] text-zinc-500">{item.name}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 overflow-x-auto border border-[#2A2A2A]">
        <Table data-testid="opportunity-table">
          <TableHeader data-testid="opportunity-table-header">
            <TableRow className="border-[#2A2A2A] hover:bg-transparent">
              <TableHead data-testid="opportunity-head-route" className="text-zinc-500">Route</TableHead>
              <TableHead data-testid="opportunity-head-spread" className="text-right text-zinc-500">Spread</TableHead>
              <TableHead data-testid="opportunity-head-profit" className="text-right text-zinc-500">Net</TableHead>
              <TableHead data-testid="opportunity-head-confidence" className="text-right text-zinc-500">Confidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody data-testid="opportunity-table-body">
            {opportunities.length === 0 ? (
              <TableRow data-testid="opportunity-empty-row" className="border-[#2A2A2A]">
                <TableCell data-testid="opportunity-empty-message" colSpan={4} className="py-10 text-center text-zinc-500">No qualifying route yet. Lower the minimum profit or scan another pair.</TableCell>
              </TableRow>
            ) : opportunities.map((item) => (
              <TableRow data-testid={`opportunity-row-${item.id}`} key={item.id} onClick={() => onSelect(item)} className={`cursor-pointer border-[#2A2A2A] transition-[background-color] hover:bg-[#007AFF]/10 ${selectedId === item.id ? "bg-[#007AFF]/10" : ""}`}>
                <TableCell data-testid={`opportunity-route-${item.id}`} className="min-w-64 text-sm text-white">
                  <span className="font-medium">{item.buy_dex}</span><span className="text-zinc-500"> → </span><span className="font-medium">{item.sell_dex}</span>
                  <p data-testid={`opportunity-chain-${item.id}`} className="mt-1 text-xs text-zinc-500">{item.chain_name} · {item.pair}</p>
                </TableCell>
                <TableCell data-testid={`opportunity-spread-${item.id}`} className="text-right font-mono text-[#00FF66]">{item.spread_bps} bps</TableCell>
                <TableCell data-testid={`opportunity-profit-${item.id}`} className="text-right font-mono text-[#00FF66]">${item.net_profit_usd}</TableCell>
                <TableCell data-testid={`opportunity-confidence-${item.id}`} className="text-right font-mono text-white">{item.confidence}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}