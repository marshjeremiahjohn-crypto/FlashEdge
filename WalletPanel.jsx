import { Wallet, RadioTower, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { shortAddress } from "@/data/defiConfig";

export function WalletPanel({ wallet, selectedChainId, onChainChange, chainOptions }) {
  const connected = Boolean(wallet.account);
  const selectableChains = chainOptions || wallet.supportedChains;
  let walletButtonLabel = "Connect MetaMask";
  if (connected) {
    walletButtonLabel = "Reconnect";
  } else if (wallet.isConnecting) {
    walletButtonLabel = "Connecting";
  } else if (wallet.isMobile && !wallet.isMetaMaskAvailable) {
    walletButtonLabel = "Open in MetaMask";
  }

  return (
    <section data-testid="wallet-panel" className="border border-[#2A2A2A] bg-black/60 p-4 backdrop-blur-xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div data-testid="wallet-panel-icon" className="grid h-10 w-10 place-items-center border border-[#2A2A2A] bg-[#121212]">
            <Wallet className="h-5 w-5 text-[#007AFF]" />
          </div>
          <div>
            <p data-testid="wallet-panel-label" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Wallet Control</p>
            <p data-testid="wallet-account-display" className="font-mono text-sm text-white">{shortAddress(wallet.account)}</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select value={String(selectedChainId)} onValueChange={(value) => onChainChange(Number(value))}>
            <SelectTrigger data-testid="chain-select-trigger" className="h-10 min-w-48 rounded-none border-[#2A2A2A] bg-[#121212] text-white">
              <SelectValue data-testid="chain-select-value" />
            </SelectTrigger>
            <SelectContent data-testid="chain-select-content" className="border-[#2A2A2A] bg-[#121212] text-white">
              {selectableChains.map((chain) => (
                <SelectItem data-testid={`chain-select-item-${chain.id}`} key={chain.id} value={String(chain.chainId)}>{chain.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {connected && wallet.activeChain ? (
            <Badge data-testid="wallet-network-badge" className="rounded-none border border-[#00FF66]/30 bg-[#00FF66]/10 font-mono text-[#00FF66]">
              <RadioTower className="mr-1 h-3 w-3" /> {wallet.activeChain.name} · {wallet.balance}
            </Badge>
          ) : (
            <Badge data-testid="wallet-network-badge" className="rounded-none border border-[#FFB020]/30 bg-[#FFB020]/10 text-[#FFB020]">Network pending</Badge>
          )}
          <Button data-testid="connect-wallet-button" onClick={wallet.connectWallet} disabled={wallet.isConnecting} className="rounded-none bg-[#007AFF] text-white hover:bg-[#3395FF]">
            <PlugZap className="mr-2 h-4 w-4" /> {walletButtonLabel}
          </Button>
          {!connected && wallet.isMobile && !wallet.isMetaMaskAvailable && wallet.mobileDeepLink && (
            <a data-testid="wallet-open-metamask-mobile-link" className="sr-only" href={wallet.mobileDeepLink}>Open MetaMask Mobile</a>
          )}
        </div>
      </div>
      {wallet.walletError && (
        <p data-testid="wallet-error-message" className="mt-3 border border-[#FF3B30]/40 bg-[#FF3B30]/10 p-3 text-sm text-[#FF8A84]">
          {wallet.walletError}
        </p>
      )}
    </section>
  );
}