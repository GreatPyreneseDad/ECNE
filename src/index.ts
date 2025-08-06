/**
 * ECNE Data River Agent
 * Main entry point
 */

import { config as dotenvConfig } from 'dotenv';
import { CoherenceFilter, FilterConfig, DataPoint, FilteredDataPoint } from './core/coherence-filter';
import { DataRiverCollector, APISource } from './collectors/data-river';
import { DatabaseService } from './storage/database';
import { DashboardServer } from './dashboard/server';
import { parsePublicAPIs } from './utils/api-parser';
import winston from 'winston';

// Load environment variables
dotenvConfig();

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    }),
    new winston.transports.File({ filename: 'ecne.log' })
  ]
});

export interface ECNEConfig {
  filter: FilterConfig;
  collector: {
    maxConcurrent: number;
    retryAttempts: number;
    retryDelay: number;
  };
  storage: {
    connectionString: string;
    retention: number; // days
  };
  dashboard: {
    port: number;
  };
}

export class ECNEDataRiver {
  private coherenceFilter: CoherenceFilter;
  private dataCollector: DataRiverCollector;
  private database: DatabaseService;
  private dashboardServer: DashboardServer;
  private processedCount: number = 0;
  private filteredCount: number = 0;

  constructor(private config: ECNEConfig) {
    // Initialize components
    this.coherenceFilter = new CoherenceFilter(config.filter);
    this.database = new DatabaseService(config.storage);
    this.dashboardServer = new DashboardServer(config.dashboard, this.database);
    
    // Initialize collector with empty sources (will be added later)
    this.dataCollector = new DataRiverCollector({
      sources: [],
      ...config.collector
    });

    this.setupEventHandlers();
  }

  /**
   * Initialize ECNE system
   */
  async initialize(): Promise<void> {
    logger.info('Initializing ECNE Data River Agent...');

    // Connect to database
    await this.database.connect();
    logger.info('Database connected');

    // Start dashboard server
    await this.dashboardServer.start();
    logger.info(`Dashboard server started on port ${this.config.dashboard.port}`);

    logger.info('ECNE initialization complete');
  }

  /**
   * Start the data river
   */
  async start(sources: APISource[]): Promise<void> {
    logger.info(`Starting data river with ${sources.length} sources`);

    // Add sources to collector
    sources.forEach(source => {
      this.dataCollector.addSource(source);
      logger.info(`Added source: ${source.name}`);
    });

    // Start collecting
    this.dataCollector.start();
    logger.info('Data collection started');

    // Start periodic statistics logging
    setInterval(() => {
      this.logStatistics();
    }, 60000); // Every minute
  }

  /**
   * Stop the data river
   */
  async stop(): Promise<void> {
    logger.info('Stopping ECNE Data River...');
    
    this.dataCollector.stop();
    await this.dashboardServer.stop();
    await this.database.disconnect();
    
    logger.info('ECNE stopped');
  }

  /**
   * Setup event handlers for data flow
   */
  private setupEventHandlers(): void {
    // Handle incoming data points
    this.dataCollector.on('data', async (dataPoint: DataPoint) => {
      this.processedCount++;
      
      try {
        // Apply coherence filtering
        const filtered = await this.coherenceFilter.filter(dataPoint);
        
        if (filtered) {
          this.filteredCount++;
          await this.handleFilteredData(filtered);
        }
      } catch (error) {
        logger.error('Error processing data point:', error);
      }
    });

    // Handle collection events
    this.dataCollector.on('collection-success', (event) => {
      logger.debug(`Collection success: ${event.source} - ${event.endpoint} (${event.count} items)`);
    });

    this.dataCollector.on('collection-error', (event) => {
      logger.error(`Collection error: ${event.source} - ${event.endpoint}`, event.error);
    });

    this.dataCollector.on('rate-limited', (event) => {
      logger.warn(`Rate limited: ${event.source}`);
    });
  }

  /**
   * Handle filtered data that passed coherence threshold
   */
  private async handleFilteredData(dataPoint: FilteredDataPoint): Promise<void> {
    // Store in database
    await this.database.storeDataPoint(dataPoint);
    
    // Emit to dashboard via WebSocket
    this.dashboardServer.emitDataPoint(dataPoint);
    
    // Log high coherence items
    if (dataPoint.coherenceScore > 0.8) {
      logger.info(`High coherence data detected (${dataPoint.coherenceScore.toFixed(2)}): ${dataPoint.source}`);
    }
  }

  /**
   * Update filter configuration
   */
  updateFilterConfig(config: Partial<FilterConfig>): void {
    this.coherenceFilter.updateConfig(config);
    logger.info('Filter configuration updated', config);
  }

  /**
   * Add a new API source
   */
  addSource(source: APISource): void {
    this.dataCollector.addSource(source);
    logger.info(`Added new source: ${source.name}`);
  }

  /**
   * Remove an API source
   */
  removeSource(sourceId: string): void {
    this.dataCollector.removeSource(sourceId);
    logger.info(`Removed source: ${sourceId}`);
  }

  /**
   * Get current statistics
   */
  getStatistics(): any {
    const filterStats = this.coherenceFilter.getStatistics();
    const collectorStats = this.dataCollector.getStatistics();
    
    return {
      processed: this.processedCount,
      filtered: this.filteredCount,
      filterRate: this.processedCount > 0 
        ? (this.filteredCount / this.processedCount * 100).toFixed(2) + '%'
        : '0%',
      filter: filterStats,
      collector: collectorStats,
      uptime: process.uptime()
    };
  }

  /**
   * Log statistics
   */
  private logStatistics(): void {
    const stats = this.getStatistics();
    logger.info('ECNE Statistics:', stats);
  }
}

// Main entry point
async function main() {
  const config: ECNEConfig = {
    filter: {
      sensitivity: parseFloat(process.env.COHERENCE_SENSITIVITY || '0.5'),
      weights: {
        psi: 0.25,
        rho: 0.25,
        q: 0.25,
        f: 0.25
      },
      contextWindow: 60,
      patternMemory: 1000
    },
    collector: {
      maxConcurrent: 10,
      retryAttempts: 3,
      retryDelay: 1000
    },
    storage: {
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost/ecne',
      retention: 30
    },
    dashboard: {
      port: parseInt(process.env.DASHBOARD_PORT || '3000')
    }
  };

  const ecne = new ECNEDataRiver(config);

  // Initialize system
  await ecne.initialize();

  // Load and parse API sources from public-api-lists
  const sources = await parsePublicAPIs('/Users/chris/public-api-lists/README.md', {
    categories: ['News', 'Social', 'Finance'], // Start with specific categories
    requiresCors: true,
    requiresAuth: false // Start with no-auth APIs
  });

  // Start the river
  await ecne.start(sources);

  // Handle shutdown
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    await ecne.stop();
    process.exit(0);
  });
}

// Run if main module
if (require.main === module) {
  main().catch(error => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });
}

export default ECNEDataRiver;