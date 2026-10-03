const { ArbitrageScanner } = require('./bot');

/**
 * Quick integration test for scanner bot
 * Tests the scanner initialization and basic opportunity detection
 */

async function runIntegrationTest() {
  console.log('🧪 Starting Scanner Integration Tests\n');
  
  const scanner = new ArbitrageScanner();
  let testsPassed = 0;
  let testsFailed = 0;

  // Test 1: Initialization
  console.log('TEST 1: Scanner Initialization');
  try {
    await scanner.initialize();
    console.log('✅ PASS: Scanner initialized\n');
    testsPassed++;
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    testsFailed++;
  }

  // Test 2: Valid Opportunity Detection
  console.log('TEST 2: Opportunity Detection - Valid Case (1.5% profit, $200k liquidity)');
  try {
    const validOpp = {
      token0: 'WETH',
      token1: 'USDC',
      dex1: 'Uniswap V3',
      dex2: 'SushiSwap',
      price1: 2000,
      price2: 2030,
      liquidity: 200000,
      network: 'Base'
    };
    
    const result = await scanner.evaluateOpportunity(validOpp);
    
    if (result && result.profitPercent >= 1.0) {
      console.log(`✅ PASS: Opportunity accepted (${result.profitPercent.toFixed(2)}% profit)\n`);
      testsPassed++;
    } else {
      console.log('❌ FAIL: Opportunity should have been accepted\n');
      testsFailed++;
    }
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    testsFailed++;
  }

  // Test 3: Reject Below Profit Threshold
  console.log('TEST 3: Opportunity Filtering - Below Profit Threshold (0.5% profit)');
  try {
    const lowProfitOpp = {
      token0: 'WETH',
      token1: 'USDC',
      dex1: 'Uniswap V3',
      dex2: 'SushiSwap',
      price1: 2000,
      price2: 2010,
      liquidity: 200000,
      network: 'Base'
    };
    
    const result = await scanner.evaluateOpportunity(lowProfitOpp);
    
    if (result === null) {
      console.log('✅ PASS: Opportunity correctly rejected (below 1% threshold)\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Opportunity should have been rejected\n');
      testsFailed++;
    }
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    testsFailed++;
  }

  // Test 4: Reject Insufficient Liquidity
  console.log('TEST 4: Liquidity Validation - Below Minimum ($50k, needs $100k)');
  try {
    const lowLiquidityOpp = {
      token0: 'WETH',
      token1: 'USDC',
      dex1: 'Uniswap V3',
      dex2: 'SushiSwap',
      price1: 2000,
      price2: 2030,
      liquidity: 50000,
      network: 'Base'
    };
    
    const result = await scanner.evaluateOpportunity(lowLiquidityOpp);
    
    if (result === null) {
      console.log('✅ PASS: Opportunity correctly rejected (insufficient liquidity)\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Opportunity should have been rejected\n');
      testsFailed++;
    }
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    testsFailed++;
  }

  // Test 5: Trade Execution
  console.log('TEST 5: Trade Execution - Execute Valid Opportunity');
  try {
    const validOpp = {
      token0: 'WETH',
      token1: 'USDC',
      dex1: 'Uniswap V3',
      dex2: 'SushiSwap',
      price1: 2000,
      price2: 2030,
      liquidity: 200000,
      network: 'Base'
    };
    
    const validated = await scanner.evaluateOpportunity(validOpp);
    const executed = await scanner.executeArbitrage(validated);
    
    if (executed && executed.status === 'executed' && executed.transactionHash) {
      console.log(`✅ PASS: Trade executed with hash ${executed.transactionHash.slice(0, 20)}...\n`);
      testsPassed++;
    } else {
      console.log('❌ FAIL: Trade execution failed\n');
      testsFailed++;
    }
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    testsFailed++;
  }

  // Test 6: Statistics Tracking
  console.log('TEST 6: Statistics Tracking');
  try {
    const stats = scanner.getStats();
    
    if (stats && stats.tradesExecuted >= 0 && stats.averageProfit >= 0) {
      console.log(`✅ PASS: Stats tracked (${stats.tradesExecuted} trades, ${stats.averageProfit.toFixed(2)}% avg profit)\n`);
      testsPassed++;
    } else {
      console.log('❌ FAIL: Statistics tracking failed\n');
      testsFailed++;
    }
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    testsFailed++;
  }

  // Test 7: Multiple Network Support
  console.log('TEST 7: Multi-Network Support');
  try {
    const opportunitiesBase = {
      token0: 'WETH',
      token1: 'USDC',
      dex1: 'Uniswap V3',
      dex2: 'SushiSwap',
      price1: 2000,
      price2: 2030,
      liquidity: 200000,
      network: 'Base'
    };
    
    const opportunitiesArbitrum = {
      ...opportunitiesBase,
      network: 'Arbitrum'
    };
    
    const resultBase = await scanner.evaluateOpportunity(opportunitiesBase);
    const resultArbitrum = await scanner.evaluateOpportunity(opportunitiesArbitrum);
    
    if (resultBase && resultArbitrum) {
      console.log('✅ PASS: Multiple networks supported\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Network support failed\n');
      testsFailed++;
    }
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    testsFailed++;
  }

  // Summary
  console.log('════════════════════════════════════');
  console.log('📊 TEST SUMMARY');
  console.log('════════════════════════════════════');
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`📈 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%\n`);

  if (testsFailed === 0) {
    console.log('🎉 ALL INTEGRATION TESTS PASSED!\n');
    process.exit(0);
  } else {
    console.log('⚠️  SOME TESTS FAILED\n');
    process.exit(1);
  }
}

// Run tests
runIntegrationTest().catch(error => {
  console.error('Fatal test error:', error);
  process.exit(1);
});
