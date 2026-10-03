import { useCallback, useMemo } from "react";
import { Save, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { DEXES, PAIRS, PROVIDERS } from "@/data/defiConfig";

const riskProfiles = ["conservative", "balanced", "aggressive"];

export function ControlPanel({ settings, setSettings, onScan, onSave, isScanning }) {
  const slippageValue = useMemo(() => [settings.max_slippage_bps], [settings.max_slippage_bps]);
  const update = useCallback((key, value) => setSettings((current) => ({ ...current, [key]: value })), [setSettings]);
  const toggleDex = useCallback((dexId) => {
    const selected = settings.selected_dexes.includes(dexId)
      ? settings.selected_dexes.filter((id) => id !== dexId)
      : [...settings.selected_dexes, dexId];
    update("selected_dexes", selected);
  }, [settings.selected_dexes, update]);

  return (
    <section data-testid="control-panel" className="border border-[#2A2A2A] bg-[#121212] p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p data-testid="control-panel-kicker" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Strategy Matrix</p>
          <h2 data-testid="control-panel-title" className="mt-2 font-heading text-2xl font-black tracking-tight text-white">Adjust execution inputs</h2>
        </div>
        <SlidersHorizontal data-testid="control-panel-icon" className="h-5 w-5 text-[#007AFF]" />
      </div>

      <div className="space-y-4">
        <div data-testid="provider-control" className="space-y-2">
          <Label data-testid="provider-label" htmlFor="provider-select" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Provider</Label>
          <Select value={settings.provider} onValueChange={(value) => update("provider", value)}>
            <SelectTrigger id="provider-select" data-testid="provider-select-trigger" className="rounded-none border-[#2A2A2A] bg-black text-white"><SelectValue data-testid="provider-select-value" /></SelectTrigger>
            <SelectContent data-testid="provider-select-content" className="border-[#2A2A2A] bg-[#121212] text-white">
              {PROVIDERS.map((provider) => <SelectItem data-testid={`provider-select-item-${provider.id}`} key={provider.id} value={provider.id}>{provider.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div data-testid="pair-control" className="space-y-2">
          <Label data-testid="pair-label" htmlFor="pair-select" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Trading Pair</Label>
          <Select value={settings.pair} onValueChange={(value) => update("pair", value)}>
            <SelectTrigger id="pair-select" data-testid="pair-select-trigger" className="rounded-none border-[#2A2A2A] bg-black font-mono text-white"><SelectValue data-testid="pair-select-value" /></SelectTrigger>
            <SelectContent data-testid="pair-select-content" className="border-[#2A2A2A] bg-[#121212] text-white">
              {PAIRS.map((pair) => <SelectItem data-testid={`pair-select-item-${pair.replace("/", "-").toLowerCase()}`} key={pair} value={pair}>{pair}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div data-testid="loan-amount-control" className="space-y-2">
            <Label data-testid="loan-amount-label" htmlFor="loan-amount-input" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Loan USD</Label>
            <Input data-testid="loan-amount-input" id="loan-amount-input" value={settings.loan_amount} onChange={(event) => update("loan_amount", Number(event.target.value))} type="number" min="1" className="rounded-none border-[#2A2A2A] bg-black font-mono text-white" />
          </div>
          <div data-testid="min-profit-control" className="space-y-2">
            <Label data-testid="min-profit-label" htmlFor="min-profit-input" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Min Profit</Label>
            <Input data-testid="min-profit-input" id="min-profit-input" value={settings.min_profit_usd} onChange={(event) => update("min_profit_usd", Number(event.target.value))} type="number" min="0" className="rounded-none border-[#2A2A2A] bg-black font-mono text-white" />
          </div>
        </div>

        <div data-testid="slippage-control" className="space-y-3 border border-[#2A2A2A] p-3">
          <div className="flex justify-between gap-3">
            <Label data-testid="slippage-label" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Slippage Guard</Label>
            <span data-testid="slippage-value" className="font-mono text-sm text-white">{settings.max_slippage_bps} bps</span>
          </div>
          <Slider data-testid="slippage-slider" value={slippageValue} min={5} max={180} step={5} onValueChange={([value]) => update("max_slippage_bps", value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div data-testid="gas-control" className="space-y-2">
            <Label data-testid="gas-label" htmlFor="gas-input" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Gas Gwei</Label>
            <Input data-testid="gas-input" id="gas-input" value={settings.gas_gwei} onChange={(event) => update("gas_gwei", Number(event.target.value))} type="number" min="0" step="0.01" className="rounded-none border-[#2A2A2A] bg-black font-mono text-white" />
          </div>
          <div data-testid="risk-profile-control" className="space-y-2">
            <Label data-testid="risk-profile-label" htmlFor="risk-select" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Risk</Label>
            <Select value={settings.risk_profile} onValueChange={(value) => update("risk_profile", value)}>
              <SelectTrigger id="risk-select" data-testid="risk-profile-select-trigger" className="rounded-none border-[#2A2A2A] bg-black text-white"><SelectValue data-testid="risk-profile-select-value" /></SelectTrigger>
              <SelectContent data-testid="risk-profile-select-content" className="border-[#2A2A2A] bg-[#121212] text-white">
                {riskProfiles.map((risk) => <SelectItem data-testid={`risk-profile-select-item-${risk}`} key={risk} value={risk}>{risk}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div data-testid="dex-toggle-group" className="space-y-3 border border-[#2A2A2A] p-3">
          <p data-testid="dex-toggle-title" className="text-xs uppercase tracking-[0.2em] text-zinc-500">DEX Routes</p>
          {DEXES.map((dex) => (
            <div key={dex.id} className="flex items-center justify-between gap-3">
              <span data-testid={`dex-label-${dex.id}`} className="text-sm text-zinc-200">{dex.name}</span>
              <Switch data-testid={`dex-switch-${dex.id}`} checked={settings.selected_dexes.includes(dex.id)} onCheckedChange={() => toggleDex(dex.id)} />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button data-testid="save-strategy-button" onClick={onSave} variant="outline" className="rounded-none border-[#2A2A2A] bg-transparent text-white hover:border-[#007AFF] hover:bg-[#007AFF]/10 hover:text-white">
            <Save className="mr-2 h-4 w-4" /> Save
          </Button>
          <Button data-testid="scan-opportunities-button" onClick={onScan} disabled={isScanning} className="rounded-none bg-[#007AFF] text-white hover:bg-[#3395FF]">
            <Search className="mr-2 h-4 w-4" /> {isScanning ? "Scanning" : "Scan"}
          </Button>
        </div>
      </div>
    </section>
  );
}