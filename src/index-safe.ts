/**
 * ECNE Data River Agent - Safe Version with Error Handling
 * Main entry point with graceful degradation
 */

import { config as dotenvConfig } from 'dotenv';
import { CoherenceFilter, FilterConfig, DataPoint, FilteredDataPoint } from './core/coherence-filter';
import { DataRiverCollector, APISource } from './collectors/data-river';
import { DatabaseService } from './storage/database';
import { DashboardServer } from './dashboard/server';
import { parsePublicAPIs } from './utils/api-parser';
import winston from 'winston';
import { MockDatabaseService } from '../tests/mocks/database.mock';

// Load environment variables
dotenvConfig();

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ 
      filename: 'ecne-error.log',
      level: 'error'
    }),
    new winston.transports.File({ 
      filename: 'ecne.log'
    })
  ]
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
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
    retention: number;
    useMock?: boolean;
  };
  dashboard: {
    port: number;
    enabled?: boolean;
  };
}

export class ECNEDataRiverSafe {
  private coherenceFilter: CoherenceFilter;
  private dataCollector: DataRiverCollector;
  private database: DatabaseService | MockDatabaseService;
  private dashboardServer?: DashboardServer;
  private processedCount: number = 0;
  private filteredCount: number = 0;
  private isInitialized: boolean = false;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(private config: ECNEConfig) {
    // Initialize components with error handling
    this.coherenceFilter = new CoherenceFilter(config.filter);
    
    // Create database service (mock or real)
    if (config.storage.useMock || !this.isDatabaseAvailable()) {
      logger.warn('Using mock database service');
      this.database = new MockDatabaseService() as any;
    } else {
      this.database = new DatabaseService(config.storage);
    }
    
    // Create dashboard only if enabled
    if (config.dashboard.enabled !== false) {
      try {
        this.dashboardServer = new DashboardServer(config.dashboard, this.database as any);
      } catch (error) {
        logger.error('Failed to create dashboard server:', error);
        logger.warn('Continuing without dashboard');
      }
    }
    
    // Initialize collector with empty sources
    this.dataCollector = new DataRiverCollector({
      sources: [],
      ...config.collector
    });

    this.setupEventHandlers();
    this.setupHealthCheck();
  }

  /**
   * Check if database is available
   */
  private isDatabaseAvailable(): boolean {
    const connectionString = this.config.storage.connectionString;
    
    // Check for mock or missing connection string
    if (!connectionString || connectionString.includes('mock://')) {
      return false;
    }
    
    // Check for localhost database in production
    if (process.env.NODE_ENV === 'production' && connectionString.includes('localhost')) {
      logger.warn('Localhost database detected in production environment');
      return false;
    }
    
    return true;
  }

  /**
   * Initialize ECNE system with error recovery
   */
  async initialize(): Promise<void> {
    logger.info('Initializing ECNE Data River Agent (Safe Mode)...');

    try {
      // Connect to database with timeout
      await this.connectWithTimeout(this.database.connect(), 'Database connection', 10000);
      logger.info('Database connected');
    } catch (error) {
      logger.error('Database connection failed:', error);
      logger.warn('Continuing with in-memory storage only');
      // Continue without database - data will be lost on restart
    }

    // Start dashboard server if available
    if (this.dashboardServer) {
      try {
        await this.dashboardServer.start();
        logger.info(`Dashboard server started on port ${this.config.dashboard.port}`);
      } catch (error) {
        logger.error('Dashboard server failed to start:', error);
        logger.warn('Continuing without dashboard');
        this.dashboardServer = undefined;
      }
    }

    this.isInitialized = true;
    logger.info('ECNE initialization complete (some services may be degraded)');
  }

  /**
   * Helper to add timeout to promises
   */
  private async connectWithTimeout<T>(
    promise: Promise<T>, 
    description: string, 
    timeoutMs: number
  ): Promise<T> {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${description} timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    
    return Promise.race([promise, timeout]);
  }

  /**
   * Start the data river with validation
   */
  async start(sources: APISource[]): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('ECNE must be initialized before starting');
    }

    // Validate sources
    const validSources = this.validateSources(sources);
    
    if (validSources.length === 0) {
      logger.warn('No valid sources provided, starting in idle mode');
    } else {
      logger.info(`Starting data river with ${validSources.length} valid sources (${sources.length - validSources.length} excluded)`);
    }

    // Add sources to collector
    validSources.forEach(source => {
      try {
        this.dataCollector.addSource(source);
        logger.info(`Added source: ${source.name}`);
      } catch (error) {
        logger.error(`Failed to add source ${source.name}:`, error);
      }
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
   * Validate API sources
   */
  private validateSources(sources: APISource[]): APISource[] {
    return sources.filter(source => {
      // Basic validation
      if (!source.id || !source.name || !source.baseUrl) {
        logger.warn(`Invalid source configuration: ${JSON.stringify(source)}`);
        return false;
      }

      // Validate URL
      try {
        new URL(source.baseUrl);
      } catch {
        logger.warn(`Invalid base URL for source ${source.name}: ${source.baseUrl}`);
        return false;
      }

      // Validate endpoints
      if (!source.endpoints || source.endpoints.length === 0) {
        logger.warn(`No endpoints defined for source ${source.name}`);
        return false;
      }

      return true;
    });
  }

  /**
   * Stop the data river gracefully
   */
  async stop(): Promise<void> {
    logger.info('Stopping ECNE Data River...');
    
    // Clear health check
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Stop components in order
    try {
      this.dataCollector.stop();
    } catch (error) {
      logger.error('Error stopping data collector:', error);
    }

    if (this.dashboardServer) {
      try {
        await this.dashboardServer.stop();
      } catch (error) {
        logger.error('Error stopping dashboard server:', error);
      }
    }

    try {
      await this.database.disconnect();
    } catch (error) {
      logger.error('Error disconnecting database:', error);
    }
    
    logger.info('ECNE stopped');
  }

  /**
   * Setup health check monitoring
   */
  private setupHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      const health = this.getHealthStatus();
      
      if (health.status === 'unhealthy') {
        logger.error('System health check failed:', health);
      } else if (health.status === 'degraded') {
        logger.warn('System running in degraded mode:', health);
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Get system health status
   */
  getHealthStatus(): any {
    const components = {
      database: this.database ? 'healthy' : 'unavailable',
      dashboard: this.dashboardServer ? 'healthy' : 'unavailable',
      collector: this.dataCollector.getStatistics().active ? 'healthy' : 'stopped',
      filter: 'healthy' // Always available
    };

    const unhealthyCount = Object.values(components).filter(s => s !== 'healthy').length;
    
    return {
      status: unhealthyCount === 0 ? 'healthy' : unhealthyCount > 2 ? 'unhealthy' : 'degraded',
      components,
      statistics: this.getStatistics()
    };
  }

  /**
   * Setup event handlers with error handling
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
        logger.error('Error processing data point:', {
          error,
          source: dataPoint.source,
          id: dataPoint.id
        });
      }
    });

    // Handle collection events
    this.dataCollector.on('collection-success', (event) => {
      logger.debug(`Collection success: ${event.source} - ${event.endpoint} (${event.count} items)`);
    });

    this.dataCollector.on('collection-error', (event) => {
      logger.error(`Collection error: ${event.source} - ${event.endpoint}`, event.error);
      
      // Implement backoff for repeated errors
      this.handleCollectionError(event);
    });

    this.dataCollector.on('rate-limited', (event) => {
      logger.warn(`Rate limited: ${event.source}`);
    });
  }

  /**
   * Handle collection errors with backoff
   */
  private collectionErrors: Map<string, number> = new Map();
  
  private handleCollectionError(event: any): void {
    const key = `${event.source}:${event.endpoint}`;
    const errorCount = (this.collectionErrors.get(key) || 0) + 1;
    this.collectionErrors.set(key, errorCount);
    
    // Disable source after too many errors
    if (errorCount > 10) {
      logger.error(`Disabling source ${event.source} due to repeated errors`);
      this.dataCollector.removeSource(event.source);
    }
  }

  /**
   * Handle filtered data with error recovery
   */
  private async handleFilteredData(dataPoint: FilteredDataPoint): Promise<void> {
    // Store in database if available
    if (this.database) {
      try {
        await this.database.storeDataPoint(dataPoint);
      } catch (error) {
        logger.error('Failed to store data point:', error);
        // Continue processing - don't fail the entire flow
      }
    }
    
    // Emit to dashboard if available
    if (this.dashboardServer) {
      try {
        this.dashboardServer.emitDataPoint(dataPoint);
      } catch (error) {
        logger.error('Failed to emit to dashboard:', error);
      }
    }
    
    // Log high coherence items
    if (dataPoint.coherenceScore > 0.8) {
      logger.info(`High coherence data detected (${dataPoint.coherenceScore.toFixed(2)}): ${dataPoint.source}`);
    }
  }

  /**
   * Update filter configuration
   */
  updateFilterConfig(config: Partial<FilterConfig>): void {
    try {
      this.coherenceFilter.updateConfig(config);
      logger.info('Filter configuration updated', config);
    } catch (error) {
      logger.error('Failed to update filter configuration:', error);
      throw error;
    }
  }

  /**
   * Add a new API source with validation
   */
  addSource(source: APISource): void {
    const validSources = this.validateSources([source]);
    if (validSources.length === 0) {
      throw new Error('Invalid source configuration');
    }
    
    this.dataCollector.addSource(source);
    logger.info(`Added new source: ${source.name}`);
  }

  /**
   * Remove an API source
   */
  removeSource(sourceId: string): void {
    this.dataCollector.removeSource(sourceId);
    this.collectionErrors.delete(sourceId); // Clear error history
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
      health: this.getHealthStatus().status,
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

// Main entry point with comprehensive error handling
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
      contextWindow: parseInt(process.env.CONTEXT_WINDOW || '60'),
      patternMemory: parseInt(process.env.PATTERN_MEMORY || '1000')
    },
    collector: {
      maxConcurrent: parseInt(process.env.MAX_CONCURRENT || '10'),
      retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3'),
      retryDelay: parseInt(process.env.RETRY_DELAY || '1000')
    },
    storage: {
      connectionString: process.env.DATABASE_URL || 'mock://localhost/ecne',
      retention: parseInt(process.env.DATA_RETENTION_DAYS || '30'),
      useMock: process.env.USE_MOCK_DB === 'true'
    },
    dashboard: {
      port: parseInt(process.env.DASHBOARD_PORT || '3000'),
      enabled: process.env.DASHBOARD_ENABLED !== 'false'
    }
  };

  const ecne = new ECNEDataRiverSafe(config);

  try {
    // Initialize system
    await ecne.initialize();

    // Try to load API sources
    let sources: APISource[] = [];
    
    try {
      // Check if public API file exists
      const apiListPath = process.env.API_LIST_PATH || '/Users/chris/public-api-lists/README.md';
      sources = await parsePublicAPIs(apiListPath, {
        categories: (process.env.API_CATEGORIES || 'News,Social,Finance').split(','),
        requiresCors: true,
        requiresAuth: false,
        limit: parseInt(process.env.API_LIMIT || '10')
      });
      logger.info(`Loaded ${sources.length} API sources`);
    } catch (error) {
      logger.error('Failed to load API sources:', error);
      logger.warn('Starting with empty source list - add sources manually via API');
    }

    // Start the river
    await ecne.start(sources);

    // Setup graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      await ecne.stop();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Keep process alive
    logger.info('ECNE Data River is running. Press Ctrl+C to stop.');
    
  } catch (error) {
    logger.error('Fatal error during startup:', error);
    await ecne.stop();
    process.exit(1);
  }
}

// Run if main module
if (require.main === module) {
  main().catch(error => {
    logger.error('Unhandled error in main:', error);
    process.exit(1);
  });
}

export default ECNEDataRiverSafe;