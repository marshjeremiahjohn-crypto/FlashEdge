// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20Minimal {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IV2RouterLike {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

/// @notice Shared safety and route-execution module for testnet-first flash arbitrage.
/// @dev No private keys are ever stored by the web app; execution is signed by the owner wallet.
abstract contract FlashArbitrageRouter {
    struct V2SwapStep {
        address router;
        address tokenIn;
        address tokenOut;
        uint256 amountOutMin;
    }

    address public owner;
    address public profitRecipient;
    uint256 public maxTradeAmount;
    bool public paused;

    mapping(address => bool) public approvedRouters;

    event OwnerUpdated(address indexed previousOwner, address indexed nextOwner);
    event ProfitRecipientUpdated(address indexed previousRecipient, address indexed nextRecipient);
    event SafetyUpdated(uint256 maxTradeAmount, bool paused);
    event RouterApprovalUpdated(address indexed router, bool approved);
    event RouteEvaluated(bytes routeData, uint256 minProfitWei);
    event RouteStepExecuted(address indexed router, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    event ProfitSwept(address indexed token, address indexed recipient, uint256 amount);
    event EmergencyWithdrawal(address indexed token, address indexed recipient, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    modifier whenActive() {
        require(!paused, "PAUSED");
        _;
    }

    constructor(uint256 _maxTradeAmount, address _profitRecipient) {
        require(_profitRecipient != address(0), "ZERO_PROFIT_RECIPIENT");
        owner = msg.sender;
        profitRecipient = _profitRecipient;
        maxTradeAmount = _maxTradeAmount;
    }

    function transferOwnership(address nextOwner) external onlyOwner {
        require(nextOwner != address(0), "ZERO_OWNER");
        emit OwnerUpdated(owner, nextOwner);
        owner = nextOwner;
    }

    function setProfitRecipient(address nextRecipient) external onlyOwner {
        require(nextRecipient != address(0), "ZERO_PROFIT_RECIPIENT");
        emit ProfitRecipientUpdated(profitRecipient, nextRecipient);
        profitRecipient = nextRecipient;
    }

    function setSafety(uint256 nextMaxTradeAmount, bool nextPaused) external onlyOwner {
        maxTradeAmount = nextMaxTradeAmount;
        paused = nextPaused;
        emit SafetyUpdated(nextMaxTradeAmount, nextPaused);
    }

    function setRouterApproval(address router, bool approved) external onlyOwner {
        require(router != address(0), "ZERO_ROUTER");
        approvedRouters[router] = approved;
        emit RouterApprovalUpdated(router, approved);
    }

    function emergencyWithdraw(address token, address recipient, uint256 amount) external onlyOwner {
        require(recipient != address(0), "ZERO_RECIPIENT");
        _safeTransfer(token, recipient, amount);
        emit EmergencyWithdrawal(token, recipient, amount);
    }

    function _validateTrade(uint256 amount, uint256 minProfitWei, bytes memory routeData) internal {
        require(amount > 0, "ZERO_AMOUNT");
        require(maxTradeAmount == 0 || amount <= maxTradeAmount, "AMOUNT_TOO_HIGH");
        emit RouteEvaluated(routeData, minProfitWei);
    }

    function _executeV2Route(bytes memory routeData, uint256 initialAmount) internal returns (address finalToken, uint256 finalAmount) {
        if (routeData.length == 0) {
            return (address(0), initialAmount);
        }

        (V2SwapStep[] memory steps, uint256 deadline) = abi.decode(routeData, (V2SwapStep[], uint256));
        require(steps.length > 0, "EMPTY_ROUTE");
        require(deadline >= block.timestamp, "ROUTE_EXPIRED");

        uint256 currentAmount = initialAmount;
        address currentToken = steps[0].tokenIn;
        for (uint256 i = 0; i < steps.length; i++) {
            V2SwapStep memory step = steps[i];
            require(approvedRouters[step.router], "ROUTER_NOT_APPROVED");
            require(step.tokenIn == currentToken, "TOKEN_PATH_BREAK");
            require(step.tokenOut != address(0), "ZERO_TOKEN_OUT");

            _safeApprove(step.tokenIn, step.router, 0);
            _safeApprove(step.tokenIn, step.router, currentAmount);

            address[] memory path = new address[](2);
            path[0] = step.tokenIn;
            path[1] = step.tokenOut;
            uint256 beforeBalance = _balanceOf(step.tokenOut);
            IV2RouterLike(step.router).swapExactTokensForTokens(currentAmount, step.amountOutMin, path, address(this), deadline);
            uint256 afterBalance = _balanceOf(step.tokenOut);
            currentAmount = afterBalance - beforeBalance;
            require(currentAmount >= step.amountOutMin, "INSUFFICIENT_STEP_OUT");
            currentToken = step.tokenOut;
            emit RouteStepExecuted(step.router, step.tokenIn, step.tokenOut, currentAmount, afterBalance);
        }

        return (currentToken, currentAmount);
    }

    function _repayAndSweep(address token, address repayTo, uint256 repayment, uint256 minProfitWei) internal {
        uint256 balance = _balanceOf(token);
        require(balance >= repayment + minProfitWei, "INSUFFICIENT_PROFIT");
        if (repayment > 0) {
            _safeTransfer(token, repayTo, repayment);
        }
        uint256 remaining = _balanceOf(token);
        if (remaining > 0) {
            _safeTransfer(token, profitRecipient, remaining);
            emit ProfitSwept(token, profitRecipient, remaining);
        }
    }

    function _balanceOf(address token) internal view returns (uint256) {
        return IERC20Minimal(token).balanceOf(address(this));
    }

    function _safeTransfer(address token, address recipient, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(IERC20Minimal.transfer.selector, recipient, amount));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "TRANSFER_FAILED");
    }

    function _safeApprove(address token, address spender, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(IERC20Minimal.approve.selector, spender, amount));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "APPROVE_FAILED");
    }
}