#!/usr/bin/env tsx

/**
 * Test runner for ECNE Data River
 */

import { ECNETestHarness } from '../tests/test-harness';
import winston from 'winston';

// Configure logger for tests
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] ${level}: ${message}`;
    })
  ),
  transports: [new winston.transports.Console()]
});

// Test scenarios
const scenarios = {
  basic: 'Basic functionality test (30s)',
  stress: 'High load stress test (60s)', 
  error: 'Error handling test (30s)',
  filter: 'Filter sensitivity test (60s)',
  all: 'Run all test scenarios'
};

async function runTest(scenario: string) {
  logger.info(`\n🧪 Running test scenario: ${scenario}\n`);
  
  const harness = new ECNETestHarness({
    useMockDatabase: true,
    useMockAPIs: true,
    apiDelay: 100,
    apiErrorRate: scenario === 'error' ? 0.3 : 0.05
  });

  try {
    await harness.setup();
    
    if (scenario === 'all') {
      // Run all scenarios
      for (const s of ['basic', 'stress', 'error', 'filter']) {
        logger.info(`\n📝 Running ${s} scenario...`);
        await harness.runScenario(s as any);
        logger.info(`✅ ${s} scenario completed\n`);
      }
    } else {
      await harness.runScenario(scenario as any);
    }
    
    logger.info('\n✅ Test completed successfully!');
    
  } catch (error) {
    logger.error('\n❌ Test failed:', error);
    throw error;
  } finally {
    await harness.teardown();
  }
}

async function main() {
  console.log('🧪 ECNE Data River Test Runner\n');
  
  const scenario = process.argv[2];
  
  if (!scenario || !scenarios[scenario]) {
    console.log('Usage: tsx run-tests.ts <scenario>\n');
    console.log('Available scenarios:');
    Object.entries(scenarios).forEach(([key, desc]) => {
      console.log(`  ${key.padEnd(10)} - ${desc}`);
    });
    console.log('\nExample: tsx run-tests.ts basic');
    process.exit(1);
  }
  
  try {
    await runTest(scenario);
    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
}

// Handle interrupts
process.on('SIGINT', () => {
  logger.info('\n\n👋 Test interrupted');
  process.exit(0);
});

main();