import { useEffect, useState } from "react";
import { AbiCoder, Contract, ContractFactory, Interface, isAddress } from "ethers";
import { Code2, Copy, ExternalLink, FileCode2, PlayCircle, Rocket, RadioTower, Save, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import BalancerFlashArbArtifact from "@/contracts/BalancerFlashArb.json";
import UniswapV3FlashArbArtifact from "@/contracts/UniswapV3FlashArb.json";

const files = [
  { name: "FlashArbitrageRouter.sol", path: "/app/contracts/FlashArbitrageRouter.sol", purpose: "Shared ownership, route metadata, and safety threshold logic." },
  { name: "BalancerFlashArb.sol", path: "/app/contracts/BalancerFlashArb.sol", purpose: "Balancer Vault flash loan receiver scaffold with repayment checks." },
  { name: "UniswapV3FlashArb.sol", path: "/app/contracts/UniswapV3FlashArb.sol", purpose: "Uniswap V3 flash callback scaffold with pool execution entrypoint." },
];

const defaultHelper = {
  network_id: "base-mainnet",
  provider: "uniswap-v3",
  contract_address: "",
  balancer_vault: "",
  max_trade_amount_raw: "0",
  notes: "",
};

const networkLabels = {
  "base-mainnet": "Base Mainnet",
  "base-sepolia": "Base Sepolia",
  "arbitrum-mainnet": "Arbitrum One",
  "arbitrum-sepolia": "Arbitrum Sepolia",
};

const networkChainIds = {
  "base-mainnet": 8453,
  "base-sepolia": 84532,
  "arbitrum-mainnet": 42161,
  "arbitrum-sepolia": 421614,
};

const testnetFaucetLinks = {
  "base-sepolia": "https://www.alchemy.com/faucets/base-sepolia",
  "arbitrum-sepolia": "https://www.alchemy.com/faucets/arbitrum-sepolia",
};

const mainnetNetworks = new Set(["base-mainnet", "arbitrum-mainnet"]);

const contractArtifacts = {
  BalancerFlashArb: BalancerFlashArbArtifact,
  UniswapV3FlashArb: UniswapV3FlashArbArtifact,
};

const baseUniswapPreset = {
  network_id: "base-mainnet",
  router_address: "0x2626664c2603336E57B271c5C0b26F421741e481",
  label: "Uniswap V3 Base Router",
  dex_type: "v3-swaprouter02",
  approved: true,
};

const baseWethUsdcPoolPreset = {
  label: "WETH/USDC Base 0.05% Pool",
  address: "0xd0b53D9277642d899DF5C87A3966A349A798F224",
};

const deployedBaseContract = "0x550f5b7571c256bcc94439B03b77b8Dc836F303B";
const approvalInterface = new Interface([
  "function setRouterApproval(address router,bool approved)",
  "function setPoolApproval(address pool,bool approved)",
]);
const baseRouterApprovalData = approvalInterface.encodeFunctionData("setRouterApproval", [baseUniswapPreset.router_address, true]);
const baseWethUsdcPoolApprovalData = approvalInterface.encodeFunctionData("setPoolApproval", [baseWethUsdcPoolPreset.address, true]);

async function copyText(text, successMessage) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      toast.success(successMessage);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    toast.success(successMessage);
  } catch {
    toast.error("Copy was blocked. Select the text and copy it manually.");
  }
}

function contractNameFor(provider) {
  return provider === "balancer" ? "BalancerFlashArb" : "UniswapV3FlashArb";
}

function looksLikeAddress(value) {
  return isAddress(value || "");
}

function shortWallet(value) {
  if (!value) return "not connected";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function normalizeWallet(value) {
  return (value || "").trim().toLowerCase();
}

function constructorArgsFor(form, profitWallet) {
  if (form.provider === "balancer") {
    return [form.balancer_vault || "<BALANCER_VAULT>", form.max_trade_amount_raw || "0", profitWallet || "<PROFIT_WALLET>"];
  }
  return [form.max_trade_amount_raw || "0", profitWallet || "<PROFIT_WALLET>"];
}

function DeploymentHelper({ readiness, wallet }) {
  const [form, setForm] = useState(defaultHelper);
  const [deployments, setDeployments] = useState([]);
  const [deployStatus, setDeployStatus] = useState(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const wallets = readiness?.wallets || {};
  const walletsReady = Boolean(wallets.owner_wallet && wallets.profit_wallet);
  const normalizedConnectedAccount = normalizeWallet(wallet.account);
  const normalizedOwnerWallet = normalizeWallet(wallets.owner_wallet);
  const ownerMatchesConnected = Boolean(normalizedConnectedAccount && normalizedConnectedAccount === normalizedOwnerWallet);
  const contractName = contractNameFor(form.provider);
  const constructorArgs = constructorArgsFor(form, wallets.profit_wallet);
  const targetChainId = networkChainIds[form.network_id];
  const isWalletOnTargetNetwork = wallet.chainId === targetChainId;
  const selectedNetworkLabel = networkLabels[form.network_id];
  const walletBalanceNumber = Number(wallet.balance || 0);
  const isMainnetDeploy = mainnetNetworks.has(form.network_id);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const loadDeployments = async () => {
    try {
      setDeployments(await api.contractDeployments());
    } catch (error) {
      toast.error(error.message);
    }
  };

  useEffect(() => { loadDeployments(); }, []);

  const copyArgs = async () => {
    await copyText(JSON.stringify(constructorArgs), "Constructor args copied");
  };

  const saveDeployment = async () => {
    try {
      if (!walletsReady) {
        toast.error("Wallet roles are still loading. Try again in a moment.");
        return;
      }
      await api.saveContractDeployment({
        network_id: form.network_id,
        provider: form.provider,
        contract_name: contractName,
        contract_address: form.contract_address,
        constructor_args: constructorArgs,
        owner_wallet: wallets.owner_wallet,
        profit_wallet: wallets.profit_wallet,
        status: "deployed",
        notes: form.notes,
      });
      toast.success("Deployment saved");
      setForm((current) => ({ ...current, contract_address: "", notes: "" }));
      await loadDeployments();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const saveDeploymentRecord = async (contractAddress, status, notes) => {
    await api.saveContractDeployment({
      network_id: form.network_id,
      provider: form.provider,
      contract_name: contractName,
      contract_address: contractAddress,
      constructor_args: constructorArgs,
      owner_wallet: wallets.owner_wallet,
      profit_wallet: wallets.profit_wallet,
      status,
      notes,
    });
    await loadDeployments();
  };

  const deployWithMetaMask = async () => {
    try {
      if (!walletsReady) {
        toast.error("Wallet roles are still loading.");
        return;
      }
      if (!wallet.account || !wallet.signer) {
        await wallet.connectWallet();
        toast.info("MetaMask is open, but this site still needs wallet permission. Approve/connect the owner account, then tap deploy again.");
        return;
      }
      if (!ownerMatchesConnected) {
        toast.error(`Owner mismatch. Connected: ${wallet.account || "not connected"}. Owner slot: ${wallets.owner_wallet || "not set"}.`);
        return;
      }
      if (wallet.chainId !== targetChainId) {
        await wallet.switchNetwork(targetChainId);
        toast.info(`Wrong network: switch MetaMask network to ${networkLabels[form.network_id]}, then tap deploy again.`);
        return;
      }
      await wallet.refreshConnectedWallet?.();
      if (Number(wallet.balance || 0) <= 0) {
        toast.error(`No gas detected on ${selectedNetworkLabel}. You need gas on that exact network.`);
        return;
      }
      if (form.provider === "balancer" && !looksLikeAddress(form.balancer_vault)) {
        toast.error("Balancer deployment needs a valid testnet Vault address.");
        return;
      }
      if (!/^\d+$/.test(form.max_trade_amount_raw)) {
        toast.error("Max Trade Raw must be an integer string.");
        return;
      }

      setIsDeploying(true);
      setDeployStatus(null);
      const artifact = contractArtifacts[contractName];
      const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet.signer);
      const contract = await factory.deploy(...constructorArgs);
      const address = await contract.getAddress();
      const tx = contract.deploymentTransaction();
      const txHash = tx?.hash || "pending";
      setDeployStatus({ address, txHash, status: "submitted" });
      setForm((current) => ({ ...current, contract_address: address, notes: `MetaMask deploy tx ${txHash}` }));
      await saveDeploymentRecord(address, "submitted", `MetaMask deploy tx ${txHash}`);
      toast.success("Deployment submitted. Wait for confirmation before using it.");
    } catch (error) {
      toast.error(error.shortMessage || error.message || "Deployment failed");
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <section data-testid="deployment-helper-section" className="border border-[#2A2A2A] bg-[#121212] p-5">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p data-testid="deployment-helper-kicker" className="text-xs uppercase tracking-[0.2em] text-[#00FF66]">Deployment Helper</p>
          <h2 data-testid="deployment-helper-title" className="mt-2 font-heading text-2xl font-black tracking-tight text-white">Prepare contract deployment</h2>
        </div>
        <a data-testid="open-remix-link" href="https://remix.ethereum.org" target="_blank" rel="noreferrer" className="inline-flex w-fit items-center border border-[#2A2A2A] px-4 py-2 text-sm text-white hover:border-[#007AFF]">
          <ExternalLink className="mr-2 h-4 w-4" /> Open Remix
        </a>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-2">
          <Label data-testid="deploy-network-label" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Network</Label>
          <Select value={form.network_id} onValueChange={(value) => update("network_id", value)}>
            <SelectTrigger data-testid="deploy-network-select" className="rounded-none border-[#2A2A2A] bg-black text-white"><SelectValue /></SelectTrigger>
            <SelectContent data-testid="deploy-network-content" className="border-[#2A2A2A] bg-[#121212] text-white">
              <SelectItem data-testid="deploy-network-base-mainnet" value="base-mainnet">Base Mainnet</SelectItem>
              <SelectItem data-testid="deploy-network-base-sepolia" value="base-sepolia">Base Sepolia</SelectItem>
              <SelectItem data-testid="deploy-network-arbitrum-mainnet" value="arbitrum-mainnet">Arbitrum One</SelectItem>
              <SelectItem data-testid="deploy-network-arbitrum-sepolia" value="arbitrum-sepolia">Arbitrum Sepolia</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label data-testid="deploy-provider-label" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Contract</Label>
          <Select value={form.provider} onValueChange={(value) => update("provider", value)}>
            <SelectTrigger data-testid="deploy-provider-select" className="rounded-none border-[#2A2A2A] bg-black text-white"><SelectValue /></SelectTrigger>
            <SelectContent data-testid="deploy-provider-content" className="border-[#2A2A2A] bg-[#121212] text-white">
              <SelectItem data-testid="deploy-provider-balancer" value="balancer">BalancerFlashArb</SelectItem>
              <SelectItem data-testid="deploy-provider-uniswap-v3" value="uniswap-v3">UniswapV3FlashArb</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label data-testid="deploy-max-trade-label" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Max Trade Raw</Label>
          <Input data-testid="deploy-max-trade-input" value={form.max_trade_amount_raw} onChange={(event) => update("max_trade_amount_raw", event.target.value)} className="rounded-none border-[#2A2A2A] bg-black font-mono text-white" />
        </div>
      </div>

      {form.provider === "balancer" && (
        <div className="mt-4 space-y-2">
          <Label data-testid="deploy-vault-label" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Balancer Vault Address</Label>
          <Input data-testid="deploy-vault-input" value={form.balancer_vault} onChange={(event) => update("balancer_vault", event.target.value)} placeholder="0x... Balancer Vault" className="rounded-none border-[#2A2A2A] bg-black font-mono text-white" />
        </div>
      )}

      <div data-testid="constructor-summary" className="mt-4 border border-[#2A2A2A] bg-black p-4">
        <p data-testid="constructor-contract-name" className="font-mono text-sm text-[#00FF66]">{contractName}</p>
        <p data-testid="constructor-network-name" className="mt-1 text-xs text-zinc-500">{networkLabels[form.network_id]} · Owner {wallets.owner_wallet || "not set"}</p>
        <p data-testid="constructor-args-value" className="mt-3 break-all font-mono text-xs text-zinc-300">[{constructorArgs.join(", ")}]</p>
        <Button data-testid="copy-constructor-args-button" onClick={copyArgs} className="mt-4 rounded-none bg-[#007AFF] text-white hover:bg-[#3395FF]"><Copy className="mr-2 h-4 w-4" /> Copy constructor args</Button>
        <Button data-testid="deploy-with-metamask-button" onClick={deployWithMetaMask} disabled={!walletsReady || isDeploying} className="ml-0 mt-3 rounded-none bg-[#00FF66] text-black hover:bg-[#66ff9d] disabled:bg-zinc-700 disabled:text-zinc-400 sm:ml-3">
          <Rocket className="mr-2 h-4 w-4" /> {isDeploying ? "Open MetaMask" : "Deploy with MetaMask"}
        </Button>
      </div>

      <div data-testid="deploy-network-warning" className={`mt-4 border p-4 text-sm ${isWalletOnTargetNetwork && walletBalanceNumber > 0 ? "border-[#00FF66]/30 bg-[#00FF66]/10 text-[#B8FFD1]" : "border-[#FF3B30]/40 bg-[#FF3B30]/10 text-[#FFB4AE]"}`}>
        <p data-testid="deploy-network-warning-title" className="font-mono">Deploy network: {selectedNetworkLabel}</p>
        <p data-testid="deploy-wallet-network-value" className="mt-1">Connected site account: {shortWallet(wallet.account)}</p>
        <p data-testid="deploy-owner-slot-value" className="mt-1">Owner slot: {shortWallet(wallets.owner_wallet)}</p>
        <p data-testid="deploy-owner-match-value" className="mt-1">Owner match: {ownerMatchesConnected ? "yes" : "no"}</p>
        <p data-testid="deploy-wallet-active-network-value" className="mt-1">MetaMask network: {wallet.activeChain?.name || "not connected to this site"}</p>
        <p data-testid="deploy-wallet-balance-value" className="mt-1">Wallet gas balance on this network: {wallet.balance || "0"}</p>
        {(!isWalletOnTargetNetwork || walletBalanceNumber <= 0) && (
          <p data-testid="deploy-gas-help" className="mt-2">
            {!wallet.account && "MetaMask may be open, but this site is not connected to your account yet. Tap Connect MetaMask first. "}
            {wallet.account && !isWalletOnTargetNetwork && `Your MetaMask network must be ${selectedNetworkLabel}. `}
            {wallet.account && isWalletOnTargetNetwork && walletBalanceNumber <= 0 && (isMainnetDeploy ? `You need real ETH on ${selectedNetworkLabel} for deployment gas.` : `Your mainnet ETH does not count here. Add testnet ETH on ${selectedNetworkLabel}.`)}
            {!isMainnetDeploy && <a data-testid="deploy-faucet-link" className="ml-1 text-[#00FF66] underline" href={testnetFaucetLinks[form.network_id]} target="_blank" rel="noreferrer">Open faucet</a>}
          </p>
        )}
      </div>

      {isMainnetDeploy && (
        <div data-testid="mainnet-deploy-warning" className="mt-4 border border-[#FF3B30]/50 bg-[#FF3B30]/10 p-4 text-sm text-[#FFB4AE]">
          Mainnet deployment uses real gas and real funds. Start with UniswapV3FlashArb, max trade raw 0, and do not execute trades until preflight passes.
        </div>
      )}

      {deployStatus && (
        <div data-testid="deploy-status-panel" className="mt-4 border border-[#00FF66]/30 bg-[#00FF66]/10 p-4 text-sm text-[#B8FFD1]">
          <p data-testid="deploy-status-address" className="break-all font-mono">Address: {deployStatus.address}</p>
          <p data-testid="deploy-status-tx" className="mt-1 break-all font-mono">Tx: {deployStatus.txHash}</p>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_220px]">
        <div className="space-y-2">
          <Label data-testid="deployed-address-label" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Deployed Contract Address</Label>
          <Input data-testid="deployed-address-input" value={form.contract_address} onChange={(event) => update("contract_address", event.target.value)} placeholder="0x... after deployment" className="rounded-none border-[#2A2A2A] bg-black font-mono text-white" />
        </div>
        <Button data-testid="save-deployment-button" onClick={saveDeployment} disabled={!walletsReady} className="self-end rounded-none bg-[#00FF66] text-black hover:bg-[#66ff9d] disabled:bg-zinc-700 disabled:text-zinc-400"><Save className="mr-2 h-4 w-4" /> Save deployment</Button>
      </div>

      <div data-testid="saved-deployments-list" className="mt-5 space-y-2">
        {deployments.length === 0 ? <p data-testid="saved-deployments-empty" className="border border-[#2A2A2A] p-4 text-sm text-zinc-500">No deployed contracts saved yet.</p> : deployments.slice(0, 6).map((item) => (
          <div data-testid={`saved-deployment-${item.id}`} key={item.id} className="flex flex-col gap-2 border border-[#2A2A2A] bg-black p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p data-testid={`saved-deployment-name-${item.id}`} className="font-mono text-sm text-white">{item.contract_name} · {networkLabels[item.network_id] || item.network_id}</p>
              <p data-testid={`saved-deployment-address-${item.id}`} className="break-all font-mono text-xs text-[#00FF66]">{item.contract_address}</p>
            </div>
            {item.explorer_url && <a data-testid={`saved-deployment-explorer-${item.id}`} href={item.explorer_url} target="_blank" rel="noreferrer" className="text-sm text-[#007AFF] hover:text-white">Explorer</a>}
          </div>
        ))}
      </div>
    </section>
  );
}

function WalletRoleEditor({ readiness, onSaved }) {
  const [form, setForm] = useState({ owner_wallet: "", profit_wallet: "" });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setForm({
      owner_wallet: readiness?.wallets?.owner_wallet || "",
      profit_wallet: readiness?.wallets?.profit_wallet || "",
    });
  }, [readiness?.wallets?.owner_wallet, readiness?.wallets?.profit_wallet]);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const pasteAddress = (key) => (event) => {
    const text = event.clipboardData?.getData("text")?.trim();
    if (!text) return;
    event.preventDefault();
    update(key, text);
  };

  const saveRoles = async () => {
    setIsSaving(true);
    try {
      await api.updateWalletRoles(form);
      toast.success("Wallet roles updated");
      await onSaved?.();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section data-testid="wallet-role-editor-section" className="border border-[#2A2A2A] bg-[#121212] p-5">
      <h2 data-testid="wallet-role-editor-title" className="font-heading text-2xl font-black tracking-tight text-white">Edit wallet roles</h2>
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_180px]">
        <div className="space-y-2">
          <Label data-testid="edit-owner-wallet-label" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Owner Wallet</Label>
          <Input data-testid="edit-owner-wallet-input" value={form.owner_wallet} onChange={(event) => update("owner_wallet", event.target.value.trim())} onPaste={pasteAddress("owner_wallet")} inputMode="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="rounded-none border-[#2A2A2A] bg-black font-mono text-white" />
        </div>
        <div className="space-y-2">
          <Label data-testid="edit-profit-wallet-label" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Profit Wallet</Label>
          <Input data-testid="edit-profit-wallet-input" value={form.profit_wallet} onChange={(event) => update("profit_wallet", event.target.value.trim())} onPaste={pasteAddress("profit_wallet")} inputMode="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="rounded-none border-[#2A2A2A] bg-black font-mono text-white" />
        </div>
        <Button data-testid="save-wallet-roles-button" onClick={saveRoles} disabled={isSaving} className="self-end rounded-none bg-[#00FF66] text-black hover:bg-[#66ff9d]">
          <Save className="mr-2 h-4 w-4" /> {isSaving ? "Saving" : "Save roles"}
        </Button>
      </div>
    </section>
  );
}

function RouterAllowlistManager() {
  const [form, setForm] = useState({ network_id: "base-sepolia", router_address: "", label: "", dex_type: "v2-compatible", approved: true });
  const [routers, setRouters] = useState([]);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const loadRouters = async () => {
    try {
      setRouters(await api.routerAllowlist());
    } catch (error) {
      toast.error(error.message);
    }
  };

  useEffect(() => { loadRouters(); }, []);

  const saveRouter = async () => {
    try {
      await api.saveRouterAllowlist(form);
      toast.success("Router allowlisted");
      setForm((current) => ({ ...current, router_address: "", label: "" }));
      await loadRouters();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const saveBasePreset = async () => {
    try {
      await api.saveRouterAllowlist(baseUniswapPreset);
      toast.success("Base Uniswap router saved");
      await loadRouters();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const deleteRouter = async (id) => {
    try {
      await api.deleteRouterAllowlist(id);
      toast.success("Router removed");
      await loadRouters();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <section data-testid="router-allowlist-section" className="border border-[#2A2A2A] bg-[#121212] p-5">
      <div className="mb-5 flex items-center gap-3">
        <ShieldCheck data-testid="router-allowlist-icon" className="h-5 w-5 text-[#00FF66]" />
        <h2 data-testid="router-allowlist-title" className="font-heading text-2xl font-black tracking-tight text-white">Router allowlist manager</h2>
      </div>
      <Button data-testid="save-base-uniswap-router-preset-button" onClick={saveBasePreset} className="mb-4 rounded-none bg-[#007AFF] text-white hover:bg-[#3395FF]">
        Save Base Uniswap router preset
      </Button>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <Select value={form.network_id} onValueChange={(value) => update("network_id", value)}>
          <SelectTrigger data-testid="router-network-select" className="rounded-none border-[#2A2A2A] bg-black text-white"><SelectValue /></SelectTrigger>
          <SelectContent data-testid="router-network-content" className="border-[#2A2A2A] bg-[#121212] text-white">
            <SelectItem data-testid="router-network-base-mainnet" value="base-mainnet">Base Mainnet</SelectItem>
            <SelectItem data-testid="router-network-base-sepolia" value="base-sepolia">Base Sepolia</SelectItem>
            <SelectItem data-testid="router-network-arbitrum-mainnet" value="arbitrum-mainnet">Arbitrum One</SelectItem>
            <SelectItem data-testid="router-network-arbitrum-sepolia" value="arbitrum-sepolia">Arbitrum Sepolia</SelectItem>
          </SelectContent>
        </Select>
        <Input data-testid="router-label-input" value={form.label} onChange={(event) => update("label", event.target.value)} placeholder="DEX label" className="rounded-none border-[#2A2A2A] bg-black text-white" />
        <Input data-testid="router-address-input" value={form.router_address} onChange={(event) => update("router_address", event.target.value)} placeholder="0x... router" className="rounded-none border-[#2A2A2A] bg-black font-mono text-white" />
        <Button data-testid="save-router-button" onClick={saveRouter} className="rounded-none bg-[#00FF66] text-black hover:bg-[#66ff9d]"><Save className="mr-2 h-4 w-4" /> Save router</Button>
      </div>
      <div data-testid="router-list" className="mt-4 space-y-2">
        {routers.length === 0 ? <p data-testid="router-list-empty" className="border border-[#2A2A2A] p-4 text-sm text-zinc-500">No routers allowlisted yet.</p> : routers.map((router) => (
          <div data-testid={`router-row-${router.id}`} key={router.id} className="flex flex-col gap-2 border border-[#2A2A2A] bg-black p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p data-testid={`router-label-${router.id}`} className="font-mono text-sm text-white">{router.label} · {networkLabels[router.network_id] || router.network_id}</p>
              <p data-testid={`router-address-${router.id}`} className="break-all font-mono text-xs text-[#00FF66]">{router.router_address}</p>
            </div>
            <Button data-testid={`delete-router-button-${router.id}`} onClick={() => deleteRouter(router.id)} variant="outline" className="rounded-none border-[#2A2A2A] text-white hover:bg-[#FF3B30]/10 hover:text-white"><Trash2 className="mr-2 h-4 w-4" /> Remove</Button>
          </div>
        ))}
      </div>
    </section>
  );
}

function RouteCalldataBuilder() {
  const [steps, setSteps] = useState([{ router: "", tokenIn: "", tokenOut: "", amountOutMin: "0" }]);
  const [deadlineMinutes, setDeadlineMinutes] = useState(20);
  const [routeData, setRouteData] = useState("0x");

  const updateStep = (index, key, value) => setSteps((current) => current.map((step, stepIndex) => stepIndex === index ? { ...step, [key]: value } : step));
  const addStep = () => setSteps((current) => [...current, { router: "", tokenIn: "", tokenOut: "", amountOutMin: "0" }]);
  const removeStep = (index) => setSteps((current) => current.filter((_, stepIndex) => stepIndex !== index));

  const buildRouteData = async () => {
    try {
      for (const step of steps) {
        if (!looksLikeAddress(step.router) || !looksLikeAddress(step.tokenIn) || !looksLikeAddress(step.tokenOut)) {
          toast.error("Every route step needs valid router/token addresses");
          return;
        }
        if (!/^\d+$/.test(step.amountOutMin)) {
          toast.error("amountOutMin must be an integer string");
          return;
        }
      }
      const deadline = Math.floor(Date.now() / 1000) + Number(deadlineMinutes || 20) * 60;
      const abi = AbiCoder.defaultAbiCoder();
      const encoded = abi.encode([
        "tuple(address router,address tokenIn,address tokenOut,uint256 amountOutMin)[]",
        "uint256",
      ], [steps, deadline]);
      setRouteData(encoded);
      await copyText(encoded, "Route calldata copied");
    } catch (error) {
      toast.error(error.message || "Route encoding failed");
    }
  };

  return (
    <section data-testid="route-builder-section" className="border border-[#2A2A2A] bg-[#121212] p-5">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p data-testid="route-builder-kicker" className="text-xs uppercase tracking-[0.2em] text-[#00FF66]">Route Calldata Builder</p>
          <h2 data-testid="route-builder-title" className="mt-2 font-heading text-2xl font-black tracking-tight text-white">Encode approved-router swaps</h2>
        </div>
        <Button data-testid="add-route-step-button" onClick={addStep} variant="outline" className="rounded-none border-[#2A2A2A] text-white hover:bg-[#007AFF]/10 hover:text-white">Add step</Button>
      </div>
      <div data-testid="route-steps-list" className="space-y-3">
        {steps.map((step, index) => (
          <div data-testid={`route-step-${index}`} key={`step-${index}`} className="grid grid-cols-1 gap-3 border border-[#2A2A2A] bg-black p-3 lg:grid-cols-[1fr_1fr_1fr_180px_90px]">
            <Input data-testid={`route-step-router-${index}`} value={step.router} onChange={(event) => updateStep(index, "router", event.target.value)} placeholder="router" className="rounded-none border-[#2A2A2A] bg-[#121212] font-mono text-white" />
            <Input data-testid={`route-step-token-in-${index}`} value={step.tokenIn} onChange={(event) => updateStep(index, "tokenIn", event.target.value)} placeholder="token in" className="rounded-none border-[#2A2A2A] bg-[#121212] font-mono text-white" />
            <Input data-testid={`route-step-token-out-${index}`} value={step.tokenOut} onChange={(event) => updateStep(index, "tokenOut", event.target.value)} placeholder="token out" className="rounded-none border-[#2A2A2A] bg-[#121212] font-mono text-white" />
            <Input data-testid={`route-step-min-out-${index}`} value={step.amountOutMin} onChange={(event) => updateStep(index, "amountOutMin", event.target.value)} placeholder="min out raw" className="rounded-none border-[#2A2A2A] bg-[#121212] font-mono text-white" />
            <Button data-testid={`remove-route-step-${index}`} onClick={() => removeStep(index)} disabled={steps.length === 1} variant="outline" className="rounded-none border-[#2A2A2A] text-white hover:bg-[#FF3B30]/10 hover:text-white">Remove</Button>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[220px_1fr]">
        <Input data-testid="route-deadline-input" value={deadlineMinutes} onChange={(event) => setDeadlineMinutes(event.target.value)} type="number" className="rounded-none border-[#2A2A2A] bg-black font-mono text-white" />
        <Button data-testid="build-route-calldata-button" onClick={buildRouteData} className="rounded-none bg-[#007AFF] text-white hover:bg-[#3395FF]"><Copy className="mr-2 h-4 w-4" /> Build + copy route data</Button>
      </div>
      <p data-testid="route-data-output" className="mt-4 max-h-28 overflow-y-auto break-all border border-[#2A2A2A] bg-black p-3 font-mono text-xs text-zinc-300">{routeData}</p>
    </section>
  );
}

function PreflightSimulationPanel({ readiness, wallet }) {
  const [form, setForm] = useState({ network_id: "base-mainnet", from_address: readiness?.wallets?.owner_wallet || "", to_address: deployedBaseContract, tx_data: baseRouterApprovalData, value: "0x0" });
  const [result, setResult] = useState(null);
  const [isApproving, setIsApproving] = useState(false);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (readiness?.wallets?.owner_wallet) {
      setForm((current) => ({ ...current, from_address: current.from_address || readiness.wallets.owner_wallet }));
    }
  }, [readiness?.wallets?.owner_wallet]);

  const runSimulation = async () => {
    try {
      const data = await api.preflightSimulation(form);
      setResult(data);
      toast.success(data.call_success ? "Preflight call succeeded" : "Preflight completed with warnings");
    } catch (error) {
      toast.error(error.message);
    }
  };

  const useBaseRouterApproval = () => {
    setForm((current) => ({ ...current, network_id: "base-mainnet", to_address: deployedBaseContract, tx_data: baseRouterApprovalData, value: "0x0" }));
    toast.success("Loaded Base router approval calldata");
  };

  const useBaseWethUsdcPoolApproval = () => {
    setForm((current) => ({ ...current, network_id: "base-mainnet", to_address: deployedBaseContract, tx_data: baseWethUsdcPoolApprovalData, value: "0x0" }));
    toast.success("Loaded WETH/USDC pool approval calldata");
  };

  const sendBaseRouterApproval = async () => {
    setIsApproving(true);
    try {
      const owner = readiness?.wallets?.owner_wallet?.toLowerCase();
      if (!wallet.account || !wallet.signer) {
        await wallet.connectWallet();
        toast.info("Connect the owner wallet, then tap approve again.");
        return;
      }
      if (wallet.account.toLowerCase() !== owner) {
        toast.error(`Wrong wallet. Connect owner ${readiness?.wallets?.owner_wallet}.`);
        return;
      }
      if (wallet.chainId !== 8453) {
        await wallet.switchNetwork(8453);
        toast.info("Switch to Base Mainnet, then tap approve again.");
        return;
      }
      const contract = new Contract(deployedBaseContract, UniswapV3FlashArbArtifact.abi, wallet.signer);
      const tx = await contract.setRouterApproval(baseUniswapPreset.router_address, true);
      toast.success(`Router approval submitted: ${tx.hash.slice(0, 10)}…`);
    } catch (error) {
      toast.error(error.shortMessage || error.message || "Router approval failed");
    } finally {
      setIsApproving(false);
    }
  };

  const sendBasePoolApproval = async () => {
    setIsApproving(true);
    try {
      const owner = readiness?.wallets?.owner_wallet?.toLowerCase();
      if (!wallet.account || !wallet.signer) {
        await wallet.connectWallet();
        toast.info("Connect the owner wallet, then tap approve again.");
        return;
      }
      if (wallet.account.toLowerCase() !== owner) {
        toast.error(`Wrong wallet. Connect owner ${readiness?.wallets?.owner_wallet}.`);
        return;
      }
      if (wallet.chainId !== 8453) {
        await wallet.switchNetwork(8453);
        toast.info("Switch to Base Mainnet, then tap approve again.");
        return;
      }
      const contract = new Contract(deployedBaseContract, UniswapV3FlashArbArtifact.abi, wallet.signer);
      const tx = await contract.setPoolApproval(baseWethUsdcPoolPreset.address, true);
      toast.success(`Pool approval submitted: ${tx.hash.slice(0, 10)}…`);
    } catch (error) {
      toast.error(error.shortMessage || error.message || "Pool approval failed");
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <section data-testid="preflight-simulation-section" className="border border-[#2A2A2A] bg-[#121212] p-5">
      <div className="mb-5 flex items-center gap-3">
        <PlayCircle data-testid="preflight-icon" className="h-5 w-5 text-[#00FF66]" />
        <h2 data-testid="preflight-title" className="font-heading text-2xl font-black tracking-tight text-white">Fork/testnet preflight simulation</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Select value={form.network_id} onValueChange={(value) => update("network_id", value)}>
          <SelectTrigger data-testid="preflight-network-select" className="rounded-none border-[#2A2A2A] bg-black text-white"><SelectValue /></SelectTrigger>
          <SelectContent data-testid="preflight-network-content" className="border-[#2A2A2A] bg-[#121212] text-white">
            <SelectItem data-testid="preflight-network-base-sepolia" value="base-sepolia">Base Sepolia</SelectItem>
            <SelectItem data-testid="preflight-network-arbitrum-sepolia" value="arbitrum-sepolia">Arbitrum Sepolia</SelectItem>
            <SelectItem data-testid="preflight-network-base-mainnet" value="base-mainnet">Base Mainnet</SelectItem>
            <SelectItem data-testid="preflight-network-arbitrum-mainnet" value="arbitrum-mainnet">Arbitrum One</SelectItem>
          </SelectContent>
        </Select>
        <Input data-testid="preflight-from-input" value={form.from_address} onChange={(event) => update("from_address", event.target.value)} placeholder="from wallet" className="rounded-none border-[#2A2A2A] bg-black font-mono text-white" />
        <Input data-testid="preflight-to-input" value={form.to_address} onChange={(event) => update("to_address", event.target.value)} placeholder="contract address" className="rounded-none border-[#2A2A2A] bg-black font-mono text-white" />
        <Input data-testid="preflight-value-input" value={form.value} onChange={(event) => update("value", event.target.value)} placeholder="0x0" className="rounded-none border-[#2A2A2A] bg-black font-mono text-white" />
      </div>
      <Input data-testid="preflight-data-input" value={form.tx_data} onChange={(event) => update("tx_data", event.target.value)} placeholder="0x calldata" className="mt-3 rounded-none border-[#2A2A2A] bg-black font-mono text-white" />
      <div data-testid="approval-shortcuts" className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
        <Button data-testid="use-base-router-approval-button" onClick={useBaseRouterApproval} variant="outline" className="rounded-none border-[#2A2A2A] text-white hover:bg-[#007AFF]/10 hover:text-white">Load router approval</Button>
        <Button data-testid="use-base-weth-usdc-pool-approval-button" onClick={useBaseWethUsdcPoolApproval} variant="outline" className="rounded-none border-[#2A2A2A] text-white hover:bg-[#007AFF]/10 hover:text-white">Load WETH/USDC pool</Button>
        <Button data-testid="run-preflight-button" onClick={runSimulation} className="rounded-none bg-[#00FF66] text-black hover:bg-[#66ff9d]"><PlayCircle className="mr-2 h-4 w-4" /> Run preflight</Button>
        <Button data-testid="approve-base-router-button" onClick={sendBaseRouterApproval} disabled={isApproving} className="rounded-none bg-[#007AFF] text-white hover:bg-[#3395FF]">{isApproving ? "Opening MetaMask" : "Approve Base router"}</Button>
        <Button data-testid="approve-base-weth-usdc-pool-button" onClick={sendBasePoolApproval} disabled={isApproving} className="rounded-none bg-[#007AFF] text-white hover:bg-[#3395FF]">{isApproving ? "Opening MetaMask" : "Approve WETH/USDC pool"}</Button>
      </div>
      {result && (
        <div data-testid="preflight-result" className="mt-4 border border-[#2A2A2A] bg-black p-4 text-sm text-zinc-300">
          <p data-testid="preflight-result-status" className="font-mono text-[#00FF66]">RPC {String(result.rpc_healthy)} · Code {String(result.contract_has_code)} · Call {String(result.call_success)}</p>
          <p data-testid="preflight-result-gas" className="mt-1 text-zinc-500">Gas estimate: {result.gas_estimate || "n/a"}</p>
          {result.warnings?.length > 0 && <p data-testid="preflight-result-warnings" className="mt-2 text-[#FFB020]">{result.warnings.join(" · ")}</p>}
          {result.error && <p data-testid="preflight-result-error" className="mt-2 text-[#FF8A84]">{result.error}</p>}
        </div>
      )}
    </section>
  );
}

export default function ContractsPage({ wallet }) {
  const [readiness, setReadiness] = useState(null);

  const loadReadiness = async () => {
    try {
      setReadiness(await api.contractReadiness());
    } catch (error) {
      toast.error(error.message);
    }
  };

  useEffect(() => {
    loadReadiness();
  }, []);

  const copyName = async (name) => {
    await copyText(name, "Contract filename copied");
  };

  return (
    <main data-testid="contracts-page" className="space-y-6">
      <section data-testid="contracts-hero" className="border border-[#2A2A2A] bg-[#121212] p-6 sm:p-8">
        <p data-testid="contracts-hero-kicker" className="text-xs uppercase tracking-[0.2em] text-[#00FF66]">Smart contract workspace</p>
        <h1 data-testid="contracts-hero-title" className="mt-4 font-heading text-4xl font-black leading-none tracking-tight text-white sm:text-5xl">Executable flash contracts</h1>
        <p data-testid="contracts-hero-copy" className="mt-4 max-w-3xl text-sm leading-relaxed text-zinc-400">Contracts now include approved-router route execution, profit sweeping, emergency withdrawal, and testnet-first safety controls. Deploy from your owner wallet, then paste deployed addresses into the transaction builder.</p>
      </section>

      <section data-testid="testnet-rpc-status-section" className="border border-[#2A2A2A] bg-[#121212] p-5">
        <div className="mb-4 flex items-center gap-3">
          <RadioTower data-testid="testnet-rpc-status-icon" className="h-5 w-5 text-[#00FF66]" />
          <h2 data-testid="testnet-rpc-status-title" className="font-heading text-2xl font-black tracking-tight text-white">Testnet RPC readiness</h2>
        </div>
        <div data-testid="testnet-rpc-status-grid" className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {(readiness?.testnet_rpcs || []).map((rpc) => (
            <div data-testid={`testnet-rpc-card-${rpc.id}`} key={rpc.id} className="border border-[#2A2A2A] bg-black p-4">
              <div className="flex items-center justify-between gap-3">
                <p data-testid={`testnet-rpc-name-${rpc.id}`} className="font-mono text-sm text-white">{rpc.name}</p>
                <Badge data-testid={`testnet-rpc-health-${rpc.id}`} className={`rounded-none border ${rpc.healthy ? "border-[#00FF66]/30 bg-[#00FF66]/10 text-[#00FF66]" : "border-[#FFB020]/30 bg-[#FFB020]/10 text-[#FFB020]"}`}>{rpc.healthy ? "Healthy" : "Check needed"}</Badge>
              </div>
              <p data-testid={`testnet-rpc-provider-${rpc.id}`} className="mt-2 text-xs text-zinc-500">{rpc.provider} · Chain {rpc.expected_chain_id}</p>
              <p data-testid={`testnet-rpc-block-${rpc.id}`} className="mt-1 font-mono text-xs text-zinc-400">Latest block: {rpc.latest_block || "pending"}</p>
            </div>
          ))}
        </div>
      </section>

      <section data-testid="wallet-role-section" className="grid grid-cols-1 gap-3 border border-[#2A2A2A] bg-[#121212] p-5 md:grid-cols-2">
        <div data-testid="owner-wallet-card" className="border border-[#2A2A2A] bg-black p-4">
          <p data-testid="owner-wallet-label" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Owner Wallet</p>
          <p data-testid="owner-wallet-value" className="mt-2 break-all font-mono text-sm text-white">{readiness?.wallets?.owner_wallet || "Not set"}</p>
        </div>
        <div data-testid="profit-wallet-card" className="border border-[#2A2A2A] bg-black p-4">
          <p data-testid="profit-wallet-label" className="text-xs uppercase tracking-[0.2em] text-zinc-500">Profit Wallet</p>
          <p data-testid="profit-wallet-value" className="mt-2 break-all font-mono text-sm text-[#00FF66]">{readiness?.wallets?.profit_wallet || "Not set"}</p>
        </div>
      </section>

      <WalletRoleEditor readiness={readiness} onSaved={loadReadiness} />

      <DeploymentHelper readiness={readiness} wallet={wallet} />
      <RouterAllowlistManager />
      <RouteCalldataBuilder />
      <PreflightSimulationPanel readiness={readiness} wallet={wallet} />

      <div data-testid="contract-file-grid" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {files.map((file) => (
          <section data-testid={`contract-file-card-${file.name.toLowerCase().replaceAll(".", "-")}`} key={file.name} className="border border-[#2A2A2A] bg-[#121212] p-5 transition-[transform,border-color] duration-200 hover:-translate-y-1 hover:border-[#007AFF]">
            <FileCode2 data-testid={`contract-file-icon-${file.name}`} className="h-6 w-6 text-[#007AFF]" />
            <h2 data-testid={`contract-file-name-${file.name}`} className="mt-4 font-heading text-xl font-black tracking-tight text-white">{file.name}</h2>
            <p data-testid={`contract-file-purpose-${file.name}`} className="mt-3 text-sm leading-relaxed text-zinc-400">{file.purpose.replace("scaffold", "contract")}</p>
            <p data-testid={`contract-file-path-${file.name}`} className="mt-4 break-all font-mono text-xs text-zinc-500">{file.path}</p>
            <Button data-testid={`contract-copy-button-${file.name}`} onClick={() => copyName(file.name)} className="mt-5 rounded-none bg-[#007AFF] text-white hover:bg-[#3395FF]"><Copy className="mr-2 h-4 w-4" /> Copy name</Button>
          </section>
        ))}
      </div>

      <section data-testid="contract-safety-section" className="border border-[#2A2A2A] bg-black p-5">
        <div className="flex items-center gap-3">
          <Code2 data-testid="contract-safety-icon" className="h-5 w-5 text-[#00FF66]" />
          <Badge data-testid="contract-safety-badge" className="rounded-none border border-[#00FF66]/30 bg-[#00FF66]/10 text-[#00FF66]">Testnet-first execution</Badge>
        </div>
        <p data-testid="contract-safety-copy" className="mt-4 text-sm leading-relaxed text-zinc-400">The app never stores deployment private keys. Contract deployment should happen from the deployer wallet, while app execution is signed through MetaMask.</p>
      </section>
    </main>
  );
}