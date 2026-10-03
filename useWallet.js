import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserProvider, formatEther } from "ethers";
import { toast } from "sonner";
import { WALLET_CHAINS, chainById } from "@/data/defiConfig";

const hasBrowserWindow = () => typeof window !== "undefined";

const getInjectedProvider = () => {
  if (!hasBrowserWindow()) return null;
  const injected = window.ethereum;
  if (!injected) return null;
  if (Array.isArray(injected.providers)) {
    return injected.providers.find((provider) => provider.isMetaMask) || injected.providers[0];
  }
  return injected;
};

const isMobileBrowser = () => {
  if (!hasBrowserWindow()) return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent);
};

const buildMetaMaskMobileLink = () => {
  if (!hasBrowserWindow()) return "";
  const cleanPath = `${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`.replace(/^https?:\/\//, "");
  return `https://metamask.app.link/dapp/${cleanPath}`;
};

const readSelectedAccount = (accounts) => accounts?.[0] || "";

export function useWallet() {
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState(null);
  const [balance, setBalance] = useState("");
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletError, setWalletError] = useState("");
  const [isMobile, setIsMobile] = useState(() => isMobileBrowser());
  const [isMetaMaskAvailable, setIsMetaMaskAvailable] = useState(() => Boolean(getInjectedProvider()));
  const [mobileDeepLink, setMobileDeepLink] = useState(() => buildMetaMaskMobileLink());

  const activeChain = useMemo(() => chainById(chainId), [chainId]);

  const refreshWallet = useCallback(async (browserProvider, selectedAccount) => {
    const network = await browserProvider.getNetwork();
    const nextChainId = Number(network.chainId);
    setChainId(nextChainId);
    if (selectedAccount) {
      const wei = await browserProvider.getBalance(selectedAccount);
      setBalance(Number(formatEther(wei)).toFixed(5));
    } else {
      setBalance("");
    }
  }, [setBalance, setChainId]);

  const connectFromAccounts = useCallback(async (injectedProvider, accounts, showSuccess) => {
    const selected = readSelectedAccount(accounts);
    const browserProvider = new BrowserProvider(injectedProvider);
    setProvider(browserProvider);
    setAccount(selected);
    if (selected) {
      const walletSigner = await browserProvider.getSigner();
      setSigner(walletSigner);
      await refreshWallet(browserProvider, selected);
      setWalletError("");
      if (showSuccess) toast.success("MetaMask wallet connected");
    } else {
      setSigner(null);
      await refreshWallet(browserProvider, "");
    }
  }, [refreshWallet]);

  const refreshConnectedWallet = useCallback(async () => {
    const injectedProvider = getInjectedProvider();
    if (!injectedProvider) return;
    const accounts = await injectedProvider.request({ method: "eth_accounts" });
    await connectFromAccounts(injectedProvider, accounts, false);
  }, [connectFromAccounts]);

  const connectWallet = useCallback(async () => {
    const injectedProvider = getInjectedProvider();
    if (!injectedProvider) {
      if (isMobileBrowser()) {
        const deepLink = buildMetaMaskMobileLink();
        setIsMobile(true);
        setMobileDeepLink(deepLink);
        setWalletError("Opening this app inside MetaMask Mobile so the wallet can connect.");
        toast.info("Opening MetaMask Mobile…");
        window.__lastMetaMaskDeepLink = deepLink;
        window.setTimeout(() => {
          window.location.assign(deepLink);
        }, 250);
        return;
      }
      const message = "MetaMask is not detected. Open this app in a browser with MetaMask enabled.";
      setWalletError(message);
      toast.error(message);
      return;
    }
    setIsConnecting(true);
    try {
      const accounts = await injectedProvider.request({ method: "eth_requestAccounts" });
      await connectFromAccounts(injectedProvider, accounts, true);
    } catch (error) {
      let message = error.message || "Wallet connection rejected";
      if (error.code === 4001) message = "MetaMask connection was rejected.";
      if (error.code === -32002) message = "MetaMask already has a pending connection request. Open MetaMask to continue.";
      setWalletError(message);
      toast.error(message);
    } finally {
      setIsConnecting(false);
    }
  }, [connectFromAccounts]);

  const switchNetwork = useCallback(async (targetChainId) => {
    const target = chainById(targetChainId);
    const injectedProvider = getInjectedProvider();
    if (!injectedProvider || !target) return;
    try {
      await injectedProvider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: target.chainHex }] });
      const accounts = await injectedProvider.request({ method: "eth_accounts" });
      await connectFromAccounts(injectedProvider, accounts, false);
      toast.success(`Switched to ${target.name}`);
    } catch (error) {
      if (error.code === 4902) {
        await injectedProvider.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: target.chainHex,
            chainName: target.name,
            nativeCurrency: target.nativeCurrency,
            rpcUrls: target.rpcUrls,
            blockExplorerUrls: target.blockExplorerUrls,
          }],
        });
        const accounts = await injectedProvider.request({ method: "eth_accounts" });
        await connectFromAccounts(injectedProvider, accounts, false);
      } else {
        toast.error(error.message || "Network switch failed");
      }
    }
  }, [connectFromAccounts]);

  useEffect(() => {
    setIsMobile(isMobileBrowser());
    setIsMetaMaskAvailable(Boolean(getInjectedProvider()));
    setMobileDeepLink(buildMetaMaskMobileLink());
    const injectedProvider = getInjectedProvider();
    if (!injectedProvider) return undefined;
    const restoreConnectedWallet = async () => {
      try {
        const accounts = await injectedProvider.request({ method: "eth_accounts" });
        if (accounts?.length) await connectFromAccounts(injectedProvider, accounts, false);
      } catch {
        // Silent restore failure: explicit Connect button still works.
      }
    };
    const handleAccounts = (accounts) => {
      connectFromAccounts(injectedProvider, accounts, false);
    };
    const handleChain = () => {
      connectFromAccounts(injectedProvider, account ? [account] : [], false);
    };
    restoreConnectedWallet();
    injectedProvider.on("accountsChanged", handleAccounts);
    injectedProvider.on("chainChanged", handleChain);
    return () => {
      injectedProvider.removeListener("accountsChanged", handleAccounts);
      injectedProvider.removeListener("chainChanged", handleChain);
    };
  }, [account, connectFromAccounts]);

  return {
    account,
    chainId,
    activeChain,
    balance,
    provider,
    signer,
    isConnecting,
    walletError,
    isMobile,
    isMetaMaskAvailable,
    mobileDeepLink,
    supportedChains: WALLET_CHAINS,
    connectWallet,
    switchNetwork,
    refreshConnectedWallet,
  };
}