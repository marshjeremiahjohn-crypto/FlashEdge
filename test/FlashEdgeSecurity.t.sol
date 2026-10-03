// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../FlashArbitrageRouter.sol";
import "../BalancerFlashArb.sol";
import "../UniswapV3FlashArb.sol";

contract RouterHarness is FlashArbitrageRouter {
    constructor(uint256 maxTradeAmount, address recipient) FlashArbitrageRouter(maxTradeAmount, recipient) {}

    function validate(uint256 amount, uint256 minProfitWei, bytes calldata routeData) external {
        _validateTrade(amount, minProfitWei, routeData);
    }

    function runRoute(bytes calldata routeData, uint256 amount) external returns (address, uint256) {
        return _executeV2Route(routeData, amount);
    }
}

contract MockVault {
    function flashLoan(address, address[] calldata, uint256[] calldata, bytes calldata) external {}
}

contract FlashEdgeSecurityTest {
    function testOwnerAndProfitRecipientInitialize() public {
        RouterHarness router = new RouterHarness(100 ether, address(0xBEEF));
        require(router.owner() == address(this), "owner");
        require(router.profitRecipient() == address(0xBEEF), "recipient");
        require(router.maxTradeAmount() == 100 ether, "max");
    }

    function testSetSafetyPausesAndChangesLimit() public {
        RouterHarness router = new RouterHarness(100, address(this));
        router.setSafety(50, true);
        require(router.paused(), "pause");
        require(router.maxTradeAmount() == 50, "limit");
    }

    function testRouterApproval() public {
        RouterHarness router = new RouterHarness(100, address(this));
        address target = address(0x1234);
        router.setRouterApproval(target, true);
        require(router.approvedRouters(target), "approval");
    }

    function testValidateRejectsZeroAmount() public {
        RouterHarness router = new RouterHarness(100, address(this));
        (bool ok,) = address(router).call(abi.encodeCall(router.validate, (0, 0, bytes(""))));
        require(!ok, "zero amount accepted");
    }

    function testValidateRejectsAmountAboveLimit() public {
        RouterHarness router = new RouterHarness(100, address(this));
        (bool ok,) = address(router).call(abi.encodeCall(router.validate, (101, 0, bytes(""))));
        require(!ok, "limit bypass");
    }

    function testRouteRejectsExpiredDeadline() public {
        RouterHarness router = new RouterHarness(0, address(this));
        FlashArbitrageRouter.V2SwapStep[] memory steps = new FlashArbitrageRouter.V2SwapStep[](1);
        steps[0] = FlashArbitrageRouter.V2SwapStep({
            router: address(0x1000),
            tokenIn: address(0x2000),
            tokenOut: address(0x3000),
            amountOutMin: 1
        });
        bytes memory data = abi.encode(steps, uint256(0));
        (bool ok,) = address(router).call(abi.encodeCall(router.runRoute, (data, 1)));
        require(!ok, "expired route accepted");
    }

    function testBalancerCallbackRejectsNonVault() public {
        MockVault vault = new MockVault();
        BalancerFlashArb arb = new BalancerFlashArb(address(vault), 100, address(this));
        address[] memory tokens = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        uint256[] memory fees = new uint256[](1);
        tokens[0] = address(0x1111);
        amounts[0] = 1;
        bytes memory userData = abi.encode(tokens[0], uint256(1), uint256(0), bytes(""));
        (bool ok,) = address(arb).call(abi.encodeCall(arb.receiveFlashLoan, (tokens, amounts, fees, userData)));
        require(!ok, "unauthorized vault callback");
    }

    function testUniswapCallbackRejectsUnapprovedPool() public {
        UniswapV3FlashArb arb = new UniswapV3FlashArb(100, address(this));
        bytes memory data = abi.encode(address(0x9999), uint256(1), uint256(0), uint256(0), bytes(""));
        (bool ok,) = address(arb).call(abi.encodeCall(arb.uniswapV3FlashCallback, (0, 0, data)));
        require(!ok, "unapproved pool callback");
    }

    function testFuzzTradeLimit(uint96 amount) public {
        if (amount == 0 || amount <= 1000) return;
        RouterHarness router = new RouterHarness(1000, address(this));
        (bool ok,) = address(router).call(abi.encodeCall(router.validate, (uint256(amount), 0, bytes(""))));
        require(!ok, "fuzz limit bypass");
    }
}
