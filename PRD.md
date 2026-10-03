# FlashEdge Command PRD

## Original Problem Statement
A highly profitable defi arbitrage flash loan app with associated smart contracts and an adjustable user interface able to adjust such things as: chains, trading pairs, loan amounts and anything else you can think of that would benefit the user to be able to adjust it.

## User Choices
- Networks: Base Sepolia, Arbitrum Sepolia, Polygon Amoy, multi-chain testnet UI.
- Flash providers: Balancer flash loans and Uniswap V3 flash swaps.
- DEX routes: Uniswap V2/V3 compatible, SushiSwap compatible, Curve-style stable pools.
- Wallet: MetaMask / injected wallet.

## Architecture Decisions
- React frontend with ethers v6 for MetaMask wallet connection and wallet-signed transactions.
- FastAPI backend with MongoDB persistence for scans, saved strategies, transaction builds, and execution records.
- Testnet-first multi-chain configuration; frontend uses REACT_APP_BACKEND_URL and backend uses MONGO_URL only.
- Solidity scaffolds stored under /app/contracts for Balancer and Uniswap V3 flash execution patterns.
- No private keys stored or handled by backend; users sign execution through MetaMask.

## User Personas
- DeFi trader tuning arbitrage parameters before execution.
- Smart contract deployer needing flash-loan/flash-swap starter contracts.
- Strategy operator tracking scans, saved presets, and submitted transaction hashes.

## Core Requirements
- Adjustable chain, pair, provider, DEX routes, loan amount, slippage, gas, min profit, and risk controls.
- Profitability scanner with route ranking and clear opportunity metrics.
- Transaction builder for user-deployed contract addresses and MetaMask signing.
- Smart contract scaffolding for Balancer and Uniswap V3.
- Execution and strategy history.

## Implemented — 2026-06-05
- Built dark performance dashboard with wallet panel, adjustable strategy matrix, profitability chart/table, and transaction console.
- Implemented backend APIs: config, scan, recent scans, strategy CRUD, transaction build validation, execution records.
- Added MetaMask/injected wallet integration using ethers v6.
- Added Solidity scaffolds: FlashArbitrageRouter.sol, BalancerFlashArb.sol, UniswapV3FlashArb.sol.
- Added contracts and history pages with navigation.
- Added backend regression tests in /app/backend/tests/test_flash_arb_api.py.

## Current Limitations
- Opportunity scanner uses deterministic SIMULATED testnet spreads rather than live DEX liquidity feeds.
- Contract transaction execution requires user-deployed contract addresses and MetaMask wallet signing.
- Solidity contracts are scaffolds; concrete route-specific swap logic must be added before real liquidity use.

## Prioritized Backlog
### P0
- Integrate live DEX/router liquidity quotes for supported testnets.
- Add forked-chain simulation endpoint before transaction submission.
- Add deployed contract address registry per chain.

### P1
- Add SIWE wallet authentication and user-specific saved strategies.
- Add route ABI encoder for advanced multi-hop swap payloads.
- Add gas and revert simulation using public RPC or user-provided RPC.

### P2
- Add strategy comparison reports and performance analytics.
- Add alerting for profitable spreads.
- Add contract deployment helper workflow.

## Next Tasks
1. Replace SIMULATED scanner with live quote adapters.
2. Deploy and register testnet contracts.
3. Add swap route execution logic inside Solidity callbacks.
4. Add pre-flight simulation before MetaMask transaction prompt.


## Implemented — 2026-06-05 Code Review Fixes
- Fixed React hook dependency issues in wallet, dashboard, history, and toast hooks.
- Split TransactionConsole into focused hook/components: useTransactionBuilder, TransactionFields, and TransactionStatus.
- Refactored backend scanner and transaction builder into smaller validation/calculation helpers.
- Removed inline chart/slider objects that caused unnecessary render churn.
- Replaced nested ternaries and guarded visual-edits warning output.
- Fixed MongoDB insert response safety by avoiding mutated inserted documents in API responses.

## Verification
- JavaScript lint: pass.
- Python lint: pass.
- Backend regression tests: 10/10 pass.
- Frontend smoke test: dashboard scan, transaction validation, and history navigation pass.


## Implemented — 2026-06-07 Live Obscure-Pair Discovery
- Added `/live-discovery` route for Base Mainnet and Arbitrum One obscure-pool scanning.
- Added live backend endpoint `/api/live/obscure-scan` using GeckoTerminal public feeds plus DexScreener latest token-profile pair enrichment.
- Added adjustable filters for new pools, stable/pegged pair mispricing, volatile micro-caps, liquidity, volume, minimum profit signal, verified DEX requirement, and unknown token-tax/honeypot blocking.
- Added risk annotations: new_pool, high_volatility, one_sided_flow, low_liquidity, unverified_router_or_factory, unknown_tax_or_honeypot_risk.
- Added graceful third-party rate-limit handling so upstream 429s return partial live results with warnings instead of backend 500 errors.
- Added live-chain configuration for Base Mainnet and Arbitrum One.

## Verification
- Python lint: pass.
- Focused JavaScript lint for new live discovery files: pass.
- Backend regression tests: 14 passed, 1 skipped.
- Browser smoke test: `/live-discovery` loads, live scan renders candidates, and safety blocking displays correctly.

## Current Limitations
- Live scanner uses public APIs and may return partial results when upstream providers rate-limit.
- Token tax/honeypot detection is conservative heuristic blocking, not full dynamic buy/sell simulation.
- On-chain router/factory validation is not yet complete; current verification is metadata/known-DEX based.
- Existing `/api/opportunities/scan` remains SIMULATED for testnet strategy tuning.

## Next Tasks
1. Add dynamic honeypot/tax simulation before enabling any mainnet execution path.
2. Add on-chain factory/router validation for every candidate pool.
3. Add fork simulation and route calldata generation for selected live opportunities.


## Implemented — 2026-08-16 Mobile MetaMask Deep Link Fix
- Added mobile browser detection for wallet connection.
- Added MetaMask Mobile deeplink generation using `https://metamask.app.link/dapp/{current-host-and-route}`.
- Updated header and Dashboard wallet buttons to show `Open in MetaMask` on mobile browsers without an injected wallet.
- Preserved desktop no-provider error handling and injected MetaMask connection flow.

## Verification
- Frontend testing agent verified mobile no-provider deeplinks, injected-wallet connection, desktop no-provider error, and route navigation.
- Automation used MOCKED mobile user agent/window.ethereum; native app handoff still requires a real mobile device.


## Implemented — 2026-08-16 Alchemy RPC + Testnet Contract Readiness
- Added backend RPC configuration for user-provided Alchemy Base Mainnet, Base Sepolia, Arbitrum One, and Arbitrum Sepolia endpoints.
- Added `/api/rpc/status` with redacted provider/health/block responses; raw RPC URLs and API keys are not returned by the API.
- Added `/api/contracts/testnet-readiness` and deployment config save/list APIs.
- Upgraded Solidity contracts from scaffolds into testnet-ready executable route contracts with approved-router swap execution, profit recipient, emergency withdrawal, safety limits, Balancer flash-loan repayment, and Uniswap V3 flash-swap repayment.
- Updated Contracts page to show Base Sepolia and Arbitrum Sepolia RPC health.
- Replaced Recharts dashboard chart with a CSS chart to remove repeated sizing warnings.

## Verification
- Testing agent verified backend + frontend: 18 passed, 1 skipped, 0 failed.
- RPC status self-test: all four Alchemy endpoints healthy and chain IDs matched.
- Contracts page browser check: 2 healthy testnet cards and 3 contract files rendered.
- Dashboard browser check: CSS chart rendered and Recharts warnings removed.

## Security Note
- User-provided RPC keys are stored only in backend environment config and are not exposed through API responses. Rotate keys if this workspace/repository is shared externally.


## Implemented — 2026-08-16 Wallet Role Configuration
- Configured owner wallet: `0x65eaa9c97d856b9115b1e19be49a3d7f17209150`.
- Configured profit wallet: `0xfa21e8b14a9d245132c64fce6d6e8ba07a417910`.
- Added wallet role display to Contracts page.
- Saved testnet deployment presets for Base Sepolia and Arbitrum Sepolia across Balancer and Uniswap V3 providers.

## Verification
- JavaScript lint: pass.
- Python lint: pass.
- Deployment config API saved four presets successfully.
- Browser check confirmed owner/profit wallets render on Contracts page.


## Implemented — 2026-08-16 Full Execution Lab
- Added router allowlist backend APIs and Contracts page manager.
- Added route calldata builder for approved V2-compatible swap steps using ABI encoding.
- Added preflight simulation API and UI using configured RPCs for eth_getCode, eth_call, and gas estimate.
- Fixed deployment-helper readiness race by disabling save until owner/profit wallets load.
- Added regression tests for router allowlist and preflight simulation.

## Verification
- Full backend tests before final patch: 29 passed, 1 skipped.
- Final race-condition verification: 11/11 targeted tests passed.
- Testing agent verified router save/delete, calldata validation/encoding, preflight result panel, routes, wallet mocks, and readiness race fix.
- Existing /api/opportunities/scan remains SIMULATED by design.


## Implemented — 2026-08-17 MetaMask Contract Deploy Button
- Compiled BalancerFlashArb and UniswapV3FlashArb into frontend contract artifacts.
- Added `Deploy with MetaMask` button to the Contracts deployment helper.
- Deploy flow validates owner wallet, selected testnet, constructor args, Balancer vault, and max trade value before opening MetaMask.
- Submitted deployments are saved with status `submitted`, deployed address, and deploy transaction note.
- Added ESLint v9 flat config so command-line lint works.

## Verification
- Testing agent verified deploy button visibility, no-wallet safety, wrong-owner block, wrong-network switch request, provider artifact switch, Balancer vault validation, mocked deploy submission path, and UI stability.
- Follow-up regression verified exact lint command exits 0 and backend regression passed: 34 passed, 1 skipped.
- Real deployment still requires user MetaMask signature and testnet gas.


## Implemented — 2026-08-18 Editable Wallet Roles
- Added backend wallet role APIs: GET/POST `/api/contracts/wallet-roles`.
- Added Mongo-backed wallet role override with environment wallet fallback.
- Updated contract readiness to reflect saved owner/profit wallet roles.
- Added Contracts page `Edit wallet roles` UI.
- Deploy with MetaMask now uses the updated owner wallet for validation.

## Verification
- Testing agent verified backend wallet role APIs, invalid address rejection, readiness override, frontend save/update flow, and deploy owner-check behavior.
- Full backend regression: 39 passed, 1 skipped.
- Exact frontend lint command passed.


## Implemented — 2026-08-19 Wallet Role Paste Fix
- Owner/profit wallet edit fields now support explicit paste-event handling.
- Added mobile-friendly input settings: no autocorrect, no autocapitalization, no spellcheck, text input mode.
- Pasted wallet values are trimmed before save.

## Verification
- Testing agent verified paste events for owner/profit fields, save flow, displayed wallet card updates, and exact ESLint command.
- `/api/opportunities/scan` remains SIMULATED by design.


## Implemented — 2026-08-19 Deploy Network/Balance Clarity Fix
- Wallet network switching now refreshes connected account, network, and gas balance after switch/add-chain.
- Deployment helper now shows selected deploy network, wallet network, wallet gas balance, and faucet link.
- Deploy is blocked with a clear message when selected testnet has zero gas balance.
- Reset wallet roles to intended values: owner `0x65eaa9c97d856b9115b1e19be49a3d7f17209150`, profit `0xfa21e8b14a9d245132c64fce6d6e8ba07a417910`.

## Verification
- Testing agent verified warning panel, faucet links, zero-balance block, switch-network refresh, wallet role cards, and lint command.
- Wallet provider validation used MOCKED MetaMask; `/api/opportunities/scan` remains SIMULATED.


## Implemented — 2026-08-19 Mainnet Deployment Path
- Deployment helper now defaults to Base Mainnet + UniswapV3FlashArb.
- Added Base Mainnet and Arbitrum One choices to deployment and router allowlist selectors.
- Added mainnet warning copy and real-gas messaging with no testnet faucet link on mainnet.
- Reset owner/profit wallet roles to intended values.
- Updated contracts hero copy from testnet-only to general executable flash contracts.

## Verification
- Testing agent verified mainnet defaults, constructor args, mainnet warnings, selector choices, wallet roles, lint command, and UI rendering.
- Real mainnet deployment still requires user MetaMask signature and enough real gas.
- Existing opportunity scanner remains SIMULATED.


## Implemented — 2026-08-19 Deployment Warning Copy Fix
- Updated deployment warning panel to separate connected site account from MetaMask network.
- Changed no-wallet copy to explain MetaMask may be open but the site still needs account permission.
- Changed wrong-account and wrong-network deploy toasts to identify the actual account/network issue.

## Verification
- Testing agent verified Contracts page warning panel copy, no-wallet helper copy, page rendering, and exact lint command.
- Wrong account/network toast branches require real MetaMask confirmation because automated wallet provider state is MOCKED.


## Implemented — 2026-08-19 Owner Match Fix
- Normalized connected wallet and owner slot before comparison using trim + lowercase.
- Added visible deploy panel lines for connected site account, owner slot, and owner match yes/no.
- Wrong-account deploy message now shows full connected and owner slot addresses.

## Verification
- Testing agent verified same address with different case shows owner match yes, wrong-account message includes full addresses, lint passes, and deployment helper still renders.
- Wallet validation used MOCKED MetaMask; live user should see the same normalized behavior.


## Implemented — 2026-08-19 Base Uniswap Router Preset
- Saved Base Mainnet Uniswap V3 router preset: `0x2626664c2603336e57b271c5c0b26f421741e481`.
- Added `Save Base Uniswap router preset` button to avoid manual entry mistakes/404 navigation.
- Preflight simulation now defaults to Base Mainnet and deployed contract `0x550f5b7571c256bcc94439B03b77b8Dc836F303B`.

## Verification
- Testing agent verified preset button saves/refreshes without 404, stays on `/contracts`, preflight defaults are correct, lint passes, and focused backend tests passed 9/9.
- Router preset is metadata only; on-chain router approval still needs MetaMask transaction later.


## Implemented — 2026-08-19 Base Mainnet Router Approval Fix
- Replaced useless `0x` preflight default with real `setRouterApproval` calldata for Base Uniswap router.
- Added `Load router approval` and `Approve Base router` buttons.
- Checked deployed contract on-chain owner/profit and synced app wallet roles to actual deployed contract state:
  - owner: `0xfa21e8b14a9d245132c64fce6d6e8ba07a417910`
  - profitRecipient: `0x65eaa9c97d856b9115b1e19be49a3d7f17209150`
- Router approval preflight now succeeds with gas estimate.

## Verification
- Testing agent verified roles, valid calldata, preflight success, approval button, router/deployment records, and lint.
- Real on-chain approval still requires manual MetaMask signature from owner wallet `0xfa21...7910` on Base Mainnet.


## Implemented — 2026-08-19 Base WETH/USDC Pool Approval
- Selected Base Mainnet Uniswap V3 WETH/USDC 0.05% pool: `0xd0b53D9277642d899DF5C87A3966A349A798F224`.
- Added `Load WETH/USDC pool` and `Approve WETH/USDC pool` buttons.
- Pool approval preflight succeeds with gas estimate.

## Verification
- Testing agent verified UI buttons, encoded calldata, backend preflight success, wallet guardrails, existing router buttons, and lint.
- Real pool approval still requires manual MetaMask signature from owner wallet `0xfa21...7910` on Base Mainnet.
