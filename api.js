const configuredBackend = process.env.REACT_APP_BACKEND_URL || "http://localhost:8001";
const BACKEND_URL = configuredBackend.replace(/\/$/, "");
export const API_URL = `${BACKEND_URL.endsWith("/api") ? BACKEND_URL : `${BACKEND_URL}/api`}`;

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    let message = data.detail || data.message || text || `Request failed with status ${response.status}`;
    if (Array.isArray(message)) {
      message = message.map((item) => item.msg || item.message || JSON.stringify(item)).join("; ");
    }
    throw new Error(String(message));
  }
  return data;
}

export const api = {
  config: () => request("/config"),
  scan: (payload) => request("/opportunities/scan", { method: "POST", body: JSON.stringify(payload) }),
  recentScans: () => request("/opportunities/recent"),
  saveStrategy: (payload) => request("/strategies", { method: "POST", body: JSON.stringify(payload) }),
  strategies: () => request("/strategies"),
  deleteStrategy: (id) => request(`/strategies/${id}`, { method: "DELETE" }),
  buildTransaction: (payload) => request("/transactions/build", { method: "POST", body: JSON.stringify(payload) }),
  recordExecution: (payload) => request("/executions", { method: "POST", body: JSON.stringify(payload) }),
  executions: () => request("/executions"),
  liveObscureScan: (payload) => request("/live/obscure-scan", { method: "POST", body: JSON.stringify(payload) }),
  recentLiveObscureScans: () => request("/live/obscure-scans/recent"),
  rpcStatus: () => request("/rpc/status"),
  contractReadiness: () => request("/contracts/testnet-readiness"),
  walletRoles: () => request("/contracts/wallet-roles"),
  updateWalletRoles: (payload) => request("/contracts/wallet-roles", { method: "POST", body: JSON.stringify(payload) }),
  saveContractDeployment: (payload) => request("/contracts/deployments", { method: "POST", body: JSON.stringify(payload) }),
  contractDeployments: () => request("/contracts/deployments"),
  saveRouterAllowlist: (payload) => request("/contracts/router-allowlist", { method: "POST", body: JSON.stringify(payload) }),
  routerAllowlist: () => request("/contracts/router-allowlist"),
  deleteRouterAllowlist: (id) => request(`/contracts/router-allowlist/${id}`, { method: "DELETE" }),
  preflightSimulation: (payload) => request("/simulation/preflight", { method: "POST", body: JSON.stringify(payload) }),
};
