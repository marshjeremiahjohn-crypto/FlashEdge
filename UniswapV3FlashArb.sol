// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./FlashArbitrageRouter.sol";

interface IUniswapV3PoolMinimal {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function flash(address recipient, uint256 amount0, uint256 amount1, bytes calldata data) external;
}

/// @notice Uniswap V3 flash-swap receiver with approved V2-router route execution.
/// @dev Testnet first. Approve pools and routers only after verification.
contract UniswapV3FlashArb is FlashArbitrageRouter {
    mapping(address => bool) public approvedPools;

    event PoolApprovalUpdated(address indexed pool, bool approved);
    event UniswapFlashRequested(address indexed pool, uint256 amount0, uint256 amount1, uint256 minProfitWei);
    event UniswapFlashRepaid(address indexed pool, uint256 repayment0, uint256 repayment1);

    constructor(uint256 maxTradeAmount, address profitRecipient) FlashArbitrageRouter(maxTradeAmount, profitRecipient) {}

    function setPoolApproval(address pool, bool approved) external onlyOwner {
        require(pool != address(0), "ZERO_POOL");
        approvedPools[pool] = approved;
        emit PoolApprovalUpdated(pool, approved);
    }

    function executeUniswapV3FlashArb(address pool, uint256 amount0, uint256 amount1, uint256 minProfitWei, bytes calldata routeData) external onlyOwner whenActive {
        require(approvedPools[pool], "POOL_NOT_APPROVED");
        require(amount0 == 0 || amount1 == 0, "ONE_SIDED_FLASH_ONLY");
        _validateTrade(amount0 + amount1, minProfitWei, routeData);
        emit UniswapFlashRequested(pool, amount0, amount1, minProfitWei);
        IUniswapV3PoolMinimal(pool).flash(address(this), amount0, amount1, abi.encode(pool, amount0, amount1, minProfitWei, routeData));
    }

    function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external {
        (address pool, uint256 amount0, uint256 amount1, uint256 minProfitWei, bytes memory routeData) = abi.decode(data, (address, uint256, uint256, uint256, bytes));
        require(msg.sender == pool && approvedPools[pool], "UNTRUSTED_POOL");

        address token0 = IUniswapV3PoolMinimal(pool).token0();
        address token1 = IUniswapV3PoolMinimal(pool).token1();
        address borrowedToken = amount0 > 0 ? token0 : token1;
        uint256 borrowedAmount = amount0 > 0 ? amount0 : amount1;

        (address finalToken,) = _executeV2Route(routeData, borrowedAmount);
        if (routeData.length > 0) {
            require(finalToken == borrowedToken, "ROUTE_MUST_END_BORROWED");
        }

        uint256 repayment0 = amount0 + fee0;
        uint256 repayment1 = amount1 + fee1;
        if (repayment0 > 0) {
            _repayAndSweep(token0, pool, repayment0, borrowedToken == token0 ? minProfitWei : 0);
        }
        if (repayment1 > 0) {
            _repayAndSweep(token1, pool, repayment1, borrowedToken == token1 ? minProfitWei : 0);
        }
        emit UniswapFlashRepaid(pool, repayment0, repayment1);
    }
}