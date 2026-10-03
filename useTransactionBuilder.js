import { useState } from "react";
import { Contract, isAddress, parseUnits } from "ethers";
import { toast } from "sonner";
import { FLASH_ARBITRAGE_ABI } from "@/data/defiConfig";
import { api } from "@/lib/api";

const DEFAULT_FORM = {
  contractAddress: "",
  tokenBorrow: "",
  poolAddress: "",
  tokenDecimals: 18,
  amountToken: "1",
  minProfitToken: "0",
  routeData: "0x",
};

export function useTransactionBuilder({ settings, wallet, selectedOpportunity, onExecuted }) {
  const [form, setForm] = useState(() => ({ ...DEFAULT_FORM }));
  const [isSending, setIsSending] = useState(false);
  const [lastBuild, setLastBuild] = useState(null);
  const [buildError, setBuildError] = useState("");

  const requiresPool = settings.provider === "uniswap-v3";

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const hasTarget = requiresPool ? isAddress(form.poolAddress) : isAddress(form.tokenBorrow);
  const ready = Boolean(wallet.signer && isAddress(form.contractAddress) && hasTarget);

  const buildPayload = () => ({
    chain_id: settings.chain_id,
    provider: settings.provider,
    pair: settings.pair,
    contract_address: form.contractAddress || null,
    token_borrow: form.tokenBorrow || null,
    pool_address: form.poolAddress || null,
    loan_amount_raw: parseUnits(form.amountToken || "0", Number(form.tokenDecimals || 18)).toString(),
    min_profit_raw: parseUnits(form.minProfitToken || "0", Number(form.tokenDecimals || 18)).toString(),
    route_data: form.routeData || "0x",
  });

  const getLocalValidationError = () => {
    if (form.contractAddress && !isAddress(form.contractAddress)) return "Contract address must be a valid EVM address";
    if (!requiresPool && form.tokenBorrow && !isAddress(form.tokenBorrow)) return "Borrow token must be a valid EVM address";
    if (requiresPool && form.poolAddress && !isAddress(form.poolAddress)) return "Uniswap V3 pool must be a valid EVM address";
    if (form.routeData && !form.routeData.startsWith("0x")) return "Route data must be hex encoded and start with 0x";
    return "";
  };

  const buildTransaction = async () => {
    try {
      const validationMessage = getLocalValidationError();
      if (validationMessage) {
        setBuildError(validationMessage);
        toast.error(validationMessage);
        return;
      }
      const txBuild = await api.buildTransaction(buildPayload());
      setLastBuild(txBuild);
      setBuildError("");
      toast.success(txBuild.is_ready_to_send ? "Transaction ready for wallet" : "Transaction draft created");
    } catch (error) {
      setBuildError(error.message);
      toast.error(error.message);
    }
  };

  const executeTransaction = async () => {
    if (!ready) {
      toast.error("Connect wallet and enter valid contract/token addresses first");
      return;
    }
    if (wallet.chainId !== settings.chain_id) {
      await wallet.switchNetwork(settings.chain_id);
      return;
    }
    setIsSending(true);
    try {
      const payload = buildPayload();
      const txBuild = await api.buildTransaction(payload);
      setLastBuild(txBuild);
      const contract = new Contract(form.contractAddress, FLASH_ARBITRAGE_ABI, wallet.signer);
      let tx;
      if (requiresPool) {
        tx = await contract.executeUniswapV3FlashArb(form.poolAddress, payload.loan_amount_raw, "0", payload.min_profit_raw, form.routeData);
      } else {
        tx = await contract.executeBalancerFlashArb(form.tokenBorrow, payload.loan_amount_raw, payload.min_profit_raw, form.routeData);
      }
      toast.success("Transaction submitted to wallet network");
      await api.recordExecution({
        chain_id: settings.chain_id,
        provider: settings.provider,
        pair: settings.pair,
        tx_hash: tx.hash,
        net_profit_usd: selectedOpportunity?.net_profit_usd || null,
        status: "submitted",
      });
      onExecuted?.(tx.hash);
    } catch (error) {
      toast.error(error.shortMessage || error.message || "Transaction failed");
    } finally {
      setIsSending(false);
    }
  };

  return {
    form,
    updateField,
    requiresPool,
    isSending,
    lastBuild,
    buildError,
    buildTransaction,
    executeTransaction,
  };
}