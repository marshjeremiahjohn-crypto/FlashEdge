// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./FlashArbitrageRouter.sol";

interface IBalancerVaultMinimal {
    function flashLoan(address recipient, address[] calldata tokens, uint256[] calldata amounts, bytes calldata userData) external;
}

/// @notice Balancer flash-loan receiver with approved V2-router route execution.
/// @dev Testnet first. Approve only verified routers before executing any route.
contract BalancerFlashArb is FlashArbitrageRouter {
    IBalancerVaultMinimal public immutable vault;

    event BalancerFlashRequested(address indexed asset, uint256 amount, uint256 minProfitWei);
    event BalancerFlashRepaid(address indexed asset, uint256 repayment);

    constructor(address balancerVault, uint256 maxTradeAmount, address profitRecipient) FlashArbitrageRouter(maxTradeAmount, profitRecipient) {
        require(balancerVault != address(0), "ZERO_VAULT");
        vault = IBalancerVaultMinimal(balancerVault);
    }

    function executeBalancerFlashArb(address asset, uint256 amount, uint256 minProfitWei, bytes calldata routeData) external onlyOwner whenActive {
        require(asset != address(0), "ZERO_ASSET");
        _validateTrade(amount, minProfitWei, routeData);

        address[] memory tokens = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        tokens[0] = asset;
        amounts[0] = amount;

        emit BalancerFlashRequested(asset, amount, minProfitWei);
        vault.flashLoan(address(this), tokens, amounts, abi.encode(asset, amount, minProfitWei, routeData));
    }

    function receiveFlashLoan(address[] memory tokens, uint256[] memory amounts, uint256[] memory feeAmounts, bytes memory userData) external {
        require(msg.sender == address(vault), "ONLY_VAULT");
        (address asset, uint256 borrowedAmount, uint256 minProfitWei, bytes memory routeData) = abi.decode(userData, (address, uint256, uint256, bytes));
        require(tokens.length == 1 && tokens[0] == asset && amounts[0] == borrowedAmount, "FLASH_MISMATCH");

        (address finalToken,) = _executeV2Route(routeData, borrowedAmount);
        if (routeData.length > 0) {
            require(finalToken == asset, "ROUTE_MUST_END_ASSET");
        }

        uint256 repayment = borrowedAmount + feeAmounts[0];
        _repayAndSweep(asset, address(vault), repayment, minProfitWei);
        emit BalancerFlashRepaid(asset, repayment);
    }
}