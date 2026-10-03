import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export default function HistoryPage() {
  const [executions, setExecutions] = useState([]);
  const [strategies, setStrategies] = useState([]);

  const load = useCallback(async () => {
    try {
      const [execData, strategyData] = await Promise.all([api.executions(), api.strategies()]);
      setExecutions(execData);
      setStrategies(strategyData);
    } catch (error) {
      toast.error(error.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const removeStrategy = useCallback(async (id) => {
    try {
      await api.deleteStrategy(id);
      await load();
      toast.success("Strategy removed");
    } catch (error) {
      toast.error(error.message);
    }
  }, [load]);

  return (
    <main data-testid="history-page" className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <section data-testid="execution-history-section" className="border border-[#2A2A2A] bg-[#121212] p-5">
        <p data-testid="execution-history-kicker" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Execution History</p>
        <h1 data-testid="execution-history-title" className="mt-3 font-heading text-3xl font-black tracking-tight text-white">Submitted transactions</h1>
        <div className="mt-5 overflow-x-auto border border-[#2A2A2A]">
          <Table data-testid="execution-history-table">
            <TableHeader data-testid="execution-history-header"><TableRow className="border-[#2A2A2A]"><TableHead data-testid="execution-hash-head" className="text-zinc-500">Hash</TableHead><TableHead data-testid="execution-pair-head" className="text-zinc-500">Pair</TableHead><TableHead data-testid="execution-status-head" className="text-zinc-500">Status</TableHead></TableRow></TableHeader>
            <TableBody data-testid="execution-history-body">
              {executions.length === 0 ? <TableRow data-testid="execution-empty-row"><TableCell data-testid="execution-empty-message" colSpan={3} className="py-8 text-center text-zinc-500">No wallet-signed executions recorded yet.</TableCell></TableRow> : executions.map((item) => (
                <TableRow data-testid={`execution-row-${item.id}`} key={item.id} className="border-[#2A2A2A]"><TableCell data-testid={`execution-hash-${item.id}`} className="font-mono text-[#00FF66]">{item.tx_hash.slice(0, 14)}…</TableCell><TableCell data-testid={`execution-pair-${item.id}`} className="text-white">{item.pair}</TableCell><TableCell data-testid={`execution-status-${item.id}`} className="text-zinc-400">{item.status}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section data-testid="saved-strategies-section" className="border border-[#2A2A2A] bg-[#121212] p-5">
        <p data-testid="saved-strategies-kicker" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Saved Strategies</p>
        <h1 data-testid="saved-strategies-title" className="mt-3 font-heading text-3xl font-black tracking-tight text-white">Reusable control presets</h1>
        <div data-testid="strategy-list" className="mt-5 space-y-3">
          {strategies.length === 0 ? <p data-testid="strategy-empty-message" className="border border-[#2A2A2A] p-5 text-center text-zinc-500">No saved strategies yet.</p> : strategies.map((item) => (
            <div data-testid={`strategy-row-${item.id}`} key={item.id} className="flex items-center justify-between gap-3 border border-[#2A2A2A] bg-black p-4">
              <div><p data-testid={`strategy-name-${item.id}`} className="font-mono text-sm text-white">{item.name}</p><p data-testid={`strategy-detail-${item.id}`} className="mt-1 text-xs text-zinc-500">{item.pair} · ${item.loan_amount} · {item.risk_profile}</p></div>
              <Button data-testid={`strategy-delete-button-${item.id}`} onClick={() => removeStrategy(item.id)} variant="outline" className="rounded-none border-[#2A2A2A] text-white hover:bg-[#FF3B30]/10 hover:text-white">Delete</Button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}