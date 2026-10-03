import "@/App.css";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { BarChart3, FileCode2, History, PlugZap, Radar, SatelliteDish } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import DashboardPage from "@/pages/DashboardPage";
import ContractsPage from "@/pages/ContractsPage";
import HistoryPage from "@/pages/HistoryPage";
import LiveDiscoveryPage from "@/pages/LiveDiscoveryPage";
import { useWallet } from "@/hooks/useWallet";
import { shortAddress } from "@/data/defiConfig";

const navItems = [
  { to: "/", label: "Dashboard", icon: BarChart3, testId: "nav-dashboard-link" },
  { to: "/live-discovery", label: "Live Discovery", icon: SatelliteDish, testId: "nav-live-discovery-link" },
  { to: "/contracts", label: "Contracts", icon: FileCode2, testId: "nav-contracts-link" },
  { to: "/history", label: "History", icon: History, testId: "nav-history-link" },
];

function HeaderWallet({ wallet }) {
  const connected = Boolean(wallet.account);
  let buttonLabel = "Connect MetaMask";
  if (wallet.isConnecting) {
    buttonLabel = "Connecting";
  } else if (connected) {
    buttonLabel = shortAddress(wallet.account);
  } else if (wallet.isMobile && !wallet.isMetaMaskAvailable) {
    buttonLabel = "Open in MetaMask";
  }

  return (
    <div data-testid="header-wallet-control" className="flex flex-wrap items-center gap-2">
      {connected && wallet.activeChain && (
        <Badge data-testid="header-wallet-network" className="rounded-none border border-[#00FF66]/30 bg-[#00FF66]/10 font-mono text-[#00FF66]">
          {wallet.activeChain.name}
        </Badge>
      )}
      <Button data-testid="header-connect-wallet-button" onClick={wallet.connectWallet} disabled={wallet.isConnecting} className="rounded-none bg-[#007AFF] text-white hover:bg-[#3395FF]">
        <PlugZap className="mr-2 h-4 w-4" /> {buttonLabel}
      </Button>
      {!connected && wallet.isMobile && !wallet.isMetaMaskAvailable && wallet.mobileDeepLink && (
        <a data-testid="header-open-metamask-mobile-link" className="sr-only" href={wallet.mobileDeepLink}>Open MetaMask Mobile</a>
      )}
    </div>
  );
}

function Layout() {
  const wallet = useWallet();
  return (
    <div data-testid="app-shell" className="min-h-screen bg-[#0A0A0A] text-white">
      <header data-testid="app-header" className="sticky top-0 z-40 border-b border-[#2A2A2A] bg-black/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1720px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <NavLink data-testid="brand-home-link" to="/" className="flex items-center gap-3 text-white">
            <span data-testid="brand-icon" className="grid h-10 w-10 place-items-center border border-[#2A2A2A] bg-[#121212]"><Radar className="h-5 w-5 text-[#00FF66]" /></span>
            <span><span data-testid="brand-title" className="block font-heading text-xl font-black tracking-tight">FlashEdge Command</span><span data-testid="brand-subtitle" className="block text-xs uppercase tracking-[0.2em] text-zinc-500">Arbitrage Control Room</span></span>
          </NavLink>
          <div className="flex flex-wrap items-center gap-3">
            <nav data-testid="primary-navigation" className="flex flex-wrap gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink data-testid={item.testId} key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => `flex items-center border px-4 py-2 text-sm transition-[background-color,border-color,color] ${isActive ? "border-[#007AFF] bg-[#007AFF] text-white" : "border-[#2A2A2A] bg-[#121212] text-zinc-300 hover:border-[#007AFF] hover:text-white"}`}>
                    <Icon className="mr-2 h-4 w-4" /> {item.label}
                  </NavLink>
                );
              })}
            </nav>
            <HeaderWallet wallet={wallet} />
          </div>
        </div>
      </header>
      <div data-testid="app-content" className="mx-auto max-w-[1720px] px-4 py-6 sm:px-6 lg:px-8">
        <Routes>
          <Route path="/" element={<DashboardPage wallet={wallet} />} />
          <Route path="/live-discovery" element={<LiveDiscoveryPage />} />
          <Route path="/contracts" element={<ContractsPage wallet={wallet} />} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
      </div>
      <Toaster richColors position="bottom-right" />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}

export default App;
