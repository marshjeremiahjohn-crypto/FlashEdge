# FlashEdge Smart Contracts

This folder contains testnet-first Solidity scaffolding for the web app:

- `FlashArbitrageRouter.sol` — shared owner, pause, max trade safety controls, approved router allowlist, V2-style route execution, profit sweeping, and emergency withdrawal.
- `BalancerFlashArb.sol` — Balancer Vault flash-loan receiver with approved-router swap route execution, repayment, and minimum-profit checks.
- `UniswapV3FlashArb.sol` — Uniswap V3 flash callback receiver with approved-pool gating, approved-router route execution, repayment, and minimum-profit checks.

Deploy the relevant contract to Base Sepolia, Arbitrum Sepolia, or Polygon Amoy, then paste the deployed address into the app's transaction builder. The app never stores private keys; execution is signed from MetaMask.

Constructor signatures:

```solidity
new BalancerFlashArb(address balancerVault, uint256 maxTradeAmount, address profitRecipient)
new UniswapV3FlashArb(uint256 maxTradeAmount, address profitRecipient)
```

Route data format for V2-compatible routers:

```solidity
abi.encode(V2SwapStep[] steps, uint256 deadline)
```

Each `V2SwapStep` contains `router`, `tokenIn`, `tokenOut`, and `amountOutMin`. Routers must be approved by the owner with `setRouterApproval(router, true)` before execution. Uniswap V3 flash pools must be approved with `setPoolApproval(pool, true)`.

Before real liquidity use, run fork/testnet simulations, verify router/factory addresses, block taxed/honeypot tokens, and confirm the route ends in the borrowed token.