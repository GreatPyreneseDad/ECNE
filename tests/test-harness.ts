/**
 * ECNE Data River Test Harness
 * Main test runner with mock dependencies
 */

import { ECNEDataRiver, ECNEConfig } from '../src/index';
import { MockAPIServer, createMockAPISources } from './mocks/api.mock';
import { createDatabaseService } from './mocks/storage.factory';
import { APISource } from '../src/collectors/data-river';
import winston from 'winston';

// Configure test logger
const testLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `[${timestamp}] ${level}: ${message}${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'test-run.log' })
  ]
});

export interface TestHarnessOptions {
  useMockDatabase?: boolean;
  useMockAPIs?: boolean;
  apiDelay?: number;
  apiErrorRate?: number;
  runDuration?: number;
}

export class ECNETestHarness {
  private ecne?: ECNEDataRiver;
  private mockAPIs?: ReturnType<typeof createMockAPISources>;
  private config: ECNEConfig;
  private options: TestHarnessOptions;

  constructor(options: TestHarnessOptions = {}) {
    this.options = {
      useMockDatabase: true,
      useMockAPIs: true,
      apiDelay: 100,
      apiErrorRate: 0.1,
      runDuration: 60000, // 1 minute default
      ...options
    };

    this.config = this.createTestConfig();
  }

  private createTestConfig(): ECNEConfig {
    return {
      filter: {
        sensitivity: 0.3, // Lower threshold for testing
        weights: {
          psi: 0.25,
          rho: 0.25,
          q: 0.25,
          f: 0.25
        },
        contextWindow: 5, // Shorter window for testing
        patternMemory: 100
      },
      collector: {
        maxConcurrent: 5,
        retryAttempts: 2,
        retryDelay: 500
      },
      storage: {
        connectionString: this.options.useMockDatabase 
          ? 'mock://localhost/test' 
          : process.env.TEST_DATABASE_URL || 'postgresql://localhost/ecne_test',
        retention: 1
      },
      dashboard: {
        port: 3001 // Different port for testing
      }
    };
  }

  async setup(): Promise<void> {
    testLogger.info('Setting up test harness...');

    // Start mock API servers if needed
    if (this.options.useMockAPIs) {
      testLogger.info('Starting mock API servers...');
      this.mockAPIs = createMockAPISources(4000);
      
      await Promise.all([
        this.mockAPIs.news.start(),
        this.mockAPIs.social.start(),
        this.mockAPIs.finance.start()
      ]);
      
      testLogger.info('Mock API servers started');
    }

    // Create ECNE instance with test configuration
    testLogger.info('Creating ECNE instance...');
    this.ecne = new (this.createTestableECNE())(this.config);
    
    testLogger.info('Test harness setup complete');
  }

  async teardown(): Promise<void> {
    testLogger.info('Tearing down test harness...');

    // Stop ECNE
    if (this.ecne) {
      await this.ecne.stop();
    }

    // Stop mock API servers
    if (this.mockAPIs) {
      await Promise.all([
        this.mockAPIs.news.stop(),
        this.mockAPIs.social.stop(),
        this.mockAPIs.finance.stop()
      ]);
    }

    testLogger.info('Test harness teardown complete');
  }

  async runTests(): Promise<void> {
    testLogger.info('Starting test run...');

    try {
      // Initialize ECNE
      await this.ecne!.initialize();
      
      // Create test API sources
      const sources = this.createTestAPISources();
      
      // Start data collection
      await this.ecne!.start(sources);
      
      // Run for specified duration
      testLogger.info(`Running for ${this.options.runDuration}ms...`);
      
      // Monitor progress
      const monitorInterval = setInterval(() => {
        const stats = this.ecne!.getStatistics();
        testLogger.info('Statistics:', stats);
      }, 10000); // Every 10 seconds

      // Wait for run duration
      await new Promise(resolve => setTimeout(resolve, this.options.runDuration));
      
      clearInterval(monitorInterval);
      
      // Final statistics
      const finalStats = this.ecne!.getStatistics();
      testLogger.info('Final statistics:', finalStats);
      
      // Validate results
      this.validateResults(finalStats);
      
    } catch (error) {
      testLogger.error('Test run failed:', error);
      throw error;
    }
  }

  private createTestAPISources(): APISource[] {
    const baseUrl = this.options.useMockAPIs ? 'http://localhost' : 'https://api';
    
    return [
      {
        id: 'test-news',
        name: 'Test News API',
        baseUrl: `${baseUrl}:4000`,
        endpoints: [{
          path: '/headlines',
          method: 'GET',
          refreshInterval: 5, // Quick refresh for testing
          dataExtractor: (response) => response.articles || []
        }],
        auth: { type: 'none' }
      },
      {
        id: 'test-social',
        name: 'Test Social API',
        baseUrl: `${baseUrl}:4001`,
        endpoints: [{
          path: '/posts/recent',
          method: 'GET',
          refreshInterval: 3,
          dataExtractor: (response) => response.posts || []
        }],
        auth: { type: 'none' }
      },
      {
        id: 'test-finance',
        name: 'Test Finance API',
        baseUrl: `${baseUrl}:4002`,
        endpoints: [{
          path: '/market/summary',
          method: 'GET',
          refreshInterval: 10,
          dataExtractor: (response) => response.markets || []
        }],
        auth: { type: 'none' }
      }
    ];
  }

  private validateResults(stats: any): void {
    testLogger.info('Validating test results...');
    
    // Check that data was processed
    if (stats.processed === 0) {
      throw new Error('No data was processed');
    }
    
    // Check filter rate
    const filterRate = parseFloat(stats.filterRate);
    if (filterRate === 0) {
      testLogger.warn('Warning: No data passed coherence filter');
    } else {
      testLogger.info(`Filter rate: ${stats.filterRate}`);
    }
    
    // Check collector status
    if (!stats.collector.active) {
      throw new Error('Collector is not active');
    }
    
    testLogger.info('Validation passed');
  }

  // Create a testable version of ECNE with dependency injection
  private createTestableECNE() {
    const createDatabase = createDatabaseService;
    const useMock = this.options.useMockDatabase;
    
    return class TestableECNE extends ECNEDataRiver {
      constructor(config: ECNEConfig) {
        // Inject mock database
        const originalDatabase = (ECNEDataRiver as any).prototype.database;
        (ECNEDataRiver as any).prototype.database = createDatabase(config.storage, useMock);
        
        super(config);
        
        // Restore original if needed
        if (!useMock && originalDatabase) {
          (ECNEDataRiver as any).prototype.database = originalDatabase;
        }
      }
    };
  }

  // Run specific test scenarios
  async runScenario(scenario: 'basic' | 'stress' | 'error' | 'filter'): Promise<void> {
    testLogger.info(`Running scenario: ${scenario}`);
    
    switch (scenario) {
      case 'basic':
        await this.runBasicScenario();
        break;
      case 'stress':
        await this.runStressScenario();
        break;
      case 'error':
        await this.runErrorScenario();
        break;
      case 'filter':
        await this.runFilterScenario();
        break;
    }
  }

  private async runBasicScenario(): Promise<void> {
    // Basic functionality test
    this.options.runDuration = 30000; // 30 seconds
    await this.runTests();
  }

  private async runStressScenario(): Promise<void> {
    // High load test
    this.config.collector.maxConcurrent = 20;
    this.options.apiDelay = 10;
    this.options.runDuration = 60000;
    await this.runTests();
  }

  private async runErrorScenario(): Promise<void> {
    // Error handling test
    this.options.apiErrorRate = 0.3; // 30% error rate
    this.options.runDuration = 30000;
    await this.runTests();
  }

  private async runFilterScenario(): Promise<void> {
    // Test different filter sensitivities
    const sensitivities = [0.1, 0.5, 0.9];
    
    for (const sensitivity of sensitivities) {
      testLogger.info(`Testing with sensitivity: ${sensitivity}`);
      this.config.filter.sensitivity = sensitivity;
      this.options.runDuration = 20000;
      await this.runTests();
    }
  }
}

// Main test runner
if (require.main === module) {
  const scenario = process.argv[2] || 'basic';
  const harness = new ECNETestHarness({
    useMockDatabase: true,
    useMockAPIs: true
  });

  (async () => {
    try {
      await harness.setup();
      await harness.runScenario(scenario as any);
    } catch (error) {
      testLogger.error('Test failed:', error);
      process.exit(1);
    } finally {
      await harness.teardown();
    }
  })();
}