import { Terminal, Send, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TransactionFields } from "@/components/TransactionFields";
import { TransactionStatus } from "@/components/TransactionStatus";
import { useTransactionBuilder } from "@/hooks/useTransactionBuilder";

export function TransactionConsole({ settings, wallet, selectedOpportunity, onExecuted }) {
  const txBuilder = useTransactionBuilder({ settings, wallet, selectedOpportunity, onExecuted });

  return (
    <section data-testid="transaction-console" className="border border-[#2A2A2A] bg-[#121212] p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p data-testid="transaction-console-kicker" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Transaction Builder</p>
          <h2 data-testid="transaction-console-title" className="mt-2 font-heading text-2xl font-black tracking-tight text-white">Wallet-signed execution</h2>
        </div>
        <Terminal data-testid="transaction-console-icon" className="h-5 w-5 text-[#00FF66]" />
      </div>

      <div className="space-y-4">
        <TransactionFields form={txBuilder.form} updateField={txBuilder.updateField} requiresPool={txBuilder.requiresPool} />
        <TransactionStatus lastBuild={txBuilder.lastBuild} buildError={txBuilder.buildError} />

        <Badge data-testid="transaction-safety-badge" className="rounded-none border border-[#FFB020]/30 bg-[#FFB020]/10 text-[#FFB020]">
          <ShieldAlert className="mr-1 h-3 w-3" /> User wallet signs; no private keys stored
        </Badge>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <Button data-testid="build-transaction-button" onClick={txBuilder.buildTransaction} variant="outline" className="rounded-none border-[#2A2A2A] bg-transparent text-white hover:border-[#007AFF] hover:bg-[#007AFF]/10 hover:text-white">Build</Button>
          <Button data-testid="execute-transaction-button" onClick={txBuilder.executeTransaction} disabled={txBuilder.isSending} className="rounded-none bg-[#00FF66] text-black hover:bg-[#66ff9d]">
            <Send className="mr-2 h-4 w-4" /> {txBuilder.isSending ? "Sending" : "Execute"}
          </Button>
        </div>
      </div>
    </section>
  );
}