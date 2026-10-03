import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function TransactionFields({ form, updateField, requiresPool }) {
  return (
    <>
      <div className="space-y-2">
        <Label data-testid="contract-address-label" htmlFor="contract-address-input" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Flash Arb Contract</Label>
        <Input data-testid="contract-address-input" id="contract-address-input" value={form.contractAddress} onChange={(event) => updateField("contractAddress", event.target.value)} placeholder="0x... deployed contract" className="rounded-none border-[#2A2A2A] bg-black font-mono text-white" />
      </div>

      {requiresPool ? (
        <div className="space-y-2">
          <Label data-testid="pool-address-label" htmlFor="pool-address-input" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Uniswap V3 Pool</Label>
          <Input data-testid="pool-address-input" id="pool-address-input" value={form.poolAddress} onChange={(event) => updateField("poolAddress", event.target.value)} placeholder="0x... pool address" className="rounded-none border-[#2A2A2A] bg-black font-mono text-white" />
        </div>
      ) : (
        <div className="space-y-2">
          <Label data-testid="borrow-token-label" htmlFor="borrow-token-input" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Borrow Token</Label>
          <Input data-testid="borrow-token-input" id="borrow-token-input" value={form.tokenBorrow} onChange={(event) => updateField("tokenBorrow", event.target.value)} placeholder="0x... ERC20 token" className="rounded-none border-[#2A2A2A] bg-black font-mono text-white" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label data-testid="token-amount-label" htmlFor="token-amount-input" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Token Amount</Label>
          <Input data-testid="token-amount-input" id="token-amount-input" value={form.amountToken} onChange={(event) => updateField("amountToken", event.target.value)} className="rounded-none border-[#2A2A2A] bg-black font-mono text-white" />
        </div>
        <div className="space-y-2">
          <Label data-testid="token-decimals-label" htmlFor="token-decimals-input" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Decimals</Label>
          <Input data-testid="token-decimals-input" id="token-decimals-input" type="number" value={form.tokenDecimals} onChange={(event) => updateField("tokenDecimals", event.target.value)} className="rounded-none border-[#2A2A2A] bg-black font-mono text-white" />
        </div>
      </div>

      <div className="space-y-2">
        <Label data-testid="min-profit-token-label" htmlFor="min-profit-token-input" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Minimum Profit Tokens</Label>
        <Input data-testid="min-profit-token-input" id="min-profit-token-input" value={form.minProfitToken} onChange={(event) => updateField("minProfitToken", event.target.value)} className="rounded-none border-[#2A2A2A] bg-black font-mono text-white" />
      </div>

      <div className="space-y-2">
        <Label data-testid="route-data-label" htmlFor="route-data-input" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Route Data Hex</Label>
        <Textarea data-testid="route-data-input" id="route-data-input" value={form.routeData} onChange={(event) => updateField("routeData", event.target.value)} className="min-h-20 rounded-none border-[#2A2A2A] bg-black font-mono text-xs text-white" />
      </div>
    </>
  );
}