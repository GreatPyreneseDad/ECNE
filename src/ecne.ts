import { EventEmitter } from 'events';
import { 
  DataPoint, 
  FilteredDataPoint, 
  APISource, 
  FilterConfig,
  QueryParams
} from './types';
import { DataRiverCollector } from './collectors/data-river';
import { EnhancedCoherenceFilter } from './core/enhanced-filter';
import { StorageAdapter, StorageFactory } from './storage/storage-factory';
import { DashboardServer } from './dashboard/server';
import { HealthMonitor } from './core/health-monitor';
import { ResilienceWrapper } from './core/resilience-wrapper';
import { ValidationPipeline, RateLimiter } from './security';
import { CacheManager, BatchProcessor, PerformanceMonitor } from './optimization';

export interface ECNEConfig {
  filter?: Partial<FilterConfig>;
  storage?: {
    type: 'postgresql' | 'mock';
    connectionString?: string;
    useMock?: boolean;
    fallbackToMock?: boolean;
  };
  collector?: {
    maxConcurrent?: number;
    retryAttempts?: number;
    retryDelay?: number;
    batchSize?: number;
  };
  dashboard?: {
    enabled?: boolean;
    port?: number;
    host?: string;
  };
  cache?: {
    enabled?: boolean;
    maxMemoryItems?: number;
    defaultTTL?: number;
  };
  security?: {
    rateLimiting?: boolean;
    validation?: boolean;
  };
}

export interface ECNEStatistics {
  processed: number;
  filtered: number;
  filterRate: number;
  errors: number;
  sources: {
    total: number;
    active: number;
    failed: number;
  };
  averageCoherence: number;
  processingRate: number;
}

export class ECNEDataRiver extends EventEmitter {
  private collector: DataRiverCollector;
  private filter: EnhancedCoherenceFilter;
  private storage: StorageAdapter | null = null;
  private dashboard: DashboardServer | null = null;
  private healthMonitor: HealthMonitor;
  private resilience: ResilienceWrapper;
  private validation: ValidationPipeline;
  private rateLimiter: RateLimiter;
  private cache: CacheManager | null = null;
  private batchProcessor: BatchProcessor<FilteredDataPoint> | null = null;
  private performanceMonitor: PerformanceMonitor;
  
  private statistics: ECNEStatistics = {
    processed: 0,
    filtered: 0,
    filterRate: 0,
    errors: 0,
    sources: {
      total: 0,
      active: 0,
      failed: 0
    },
    averageCoherence: 0,
    processingRate: 0
  };
  
  private isRunning: boolean = false;
  private startTime: number = 0;
  
  constructor(private config: ECNEConfig = {}) {
    super();
    
    // Initialize components
    this.healthMonitor = new HealthMonitor();
    this.resilience = new ResilienceWrapper();
    this.validation = new ValidationPipeline();
    this.performanceMonitor = new PerformanceMonitor();
    
    // Initialize rate limiter
    this.rateLimiter = new RateLimiter({
      defaultLimit: { requests: 100, window: 60000 },
      categories: new Map([
        ['api', { requests: 60, window: 60000 }],
        ['dashboard', { requests: 200, window: 60000 }]
      ])
    });
    
    // Initialize collector
    this.collector = new DataRiverCollector({
      maxConcurrent: config.collector?.maxConcurrent || 10,
      retryAttempts: config.collector?.retryAttempts || 3,
      retryDelay: config.collector?.retryDelay || 1000
    });
    
    // Initialize filter with correct GCT parameters
    const filterConfig: FilterConfig = {
      sensitivity: 0.5,
      gct_params: {
        km: 0.3,              // Saturation constant
        ki: 0.1,              // Inhibition constant  
        coupling_strength: 0.15 // Coupling between components
      },
      contextWindow: 60,      // 1 hour context
      patternMemory: 1000,    // Remember 1000 patterns
      enableAnomalyDetection: true,
      enablePrediction: true,
      enableOptimization: true,
      ...config.filter
    };
    this.filter = new EnhancedCoherenceFilter(filterConfig);
    
    // Initialize cache if enabled
    if (config.cache?.enabled !== false) {
      this.cache = new CacheManager({
        maxMemoryItems: config.cache?.maxMemoryItems || 10000,
        defaultTTL: config.cache?.defaultTTL || 300000 // 5 minutes
      });
    }
    
    this.setupEventHandlers();
  }
  
  private setupEventHandlers(): void {
    // Collector events
    this.collector.on('data', async (dataPoint: DataPoint) => {
      await this.processDataPoint(dataPoint);
    });
    
    this.collector.on('error', (error) => {
      this.statistics.errors++;
      this.emit('error', error);
    });
    
    // Filter events
    this.filter.on('anomaly-detected', (anomaly) => {
      this.emit('anomaly-detected', anomaly);
    });
    
    this.filter.on('prediction-generated', (prediction) => {
      this.emit('prediction-generated', prediction);
    });
    
    // Health monitor events
    this.healthMonitor.on('alert', (alert) => {
      this.emit('health-alert', alert);
    });
    
    // Resilience events
    this.resilience.on('circuit-open', (info) => {
      this.emit('circuit-open', info);
    });
  }
  
  async initialize(): Promise<void> {
    try {
      // Start health monitoring
      this.healthMonitor.startMonitoring();
      
      // Initialize storage
      if (!this.config.storage?.useMock) {
        this.storage = await StorageFactory.createFromEnv();
      } else {
        this.storage = await StorageFactory.create({
          type: 'mock',
          useMock: true
        });
      }
      
      // Initialize batch processor for storage
      if (this.storage) {
        this.batchProcessor = new BatchProcessor(
          async (batch: FilteredDataPoint[]) => {
            if (this.storage) {
              await this.storage.storeBatch(batch);
            }
          },
          {
            batchSize: this.config.collector?.batchSize || 100,
            batchTimeout: 5000,
            retryOnFailure: true,
            retryAttempts: 3
          }
        );
      }
      
      // Initialize dashboard
      if (this.config.dashboard?.enabled !== false) {
        this.dashboard = new DashboardServer({
          port: this.config.dashboard?.port || 3000,
          host: this.config.dashboard?.host || 'localhost'
        });
        
        await this.dashboard.start();
        
        // Setup dashboard event forwarding
        this.setupDashboardEvents();
      }
      
      this.emit('initialized');
      
    } catch (error) {
      this.emit('initialization-error', error);
      throw error;
    }
  }
  
  private setupDashboardEvents(): void {
    if (!this.dashboard) return;
    
    // Forward filtered data to dashboard
    this.on('filtered-data', (data) => {
      this.dashboard?.broadcast('filtered-data', data);
    });
    
    // Forward health updates
    setInterval(() => {
      const health = this.healthMonitor.getHealthStatus();
      this.dashboard?.broadcast('health-update', health.metrics);
    }, 5000);
    
    // Forward statistics
    setInterval(() => {
      this.dashboard?.broadcast('stats-update', {
        ...this.statistics,
        sources: this.collector.getSources()
      });
    }, 1000);
  }
  
  async start(sources: APISource[]): Promise<void> {
    if (this.isRunning) {
      throw new Error('ECNE is already running');
    }
    
    // Validate sources
    for (const source of sources) {
      await this.validation.validate('api-source', source);
    }
    
    this.isRunning = true;
    this.startTime = Date.now();
    this.statistics.sources.total = sources.length;
    
    // Add sources to collector
    for (const source of sources) {
      this.collector.addSource(source);
    }
    
    // Start collection
    await this.collector.start();
    
    this.emit('started', { sources: sources.length });
  }
  
  async stop(): Promise<void> {
    this.isRunning = false;
    
    // Stop collector
    await this.collector.stop();
    
    // Flush batch processor
    if (this.batchProcessor) {
      await this.batchProcessor.flush();
    }
    
    // Stop health monitoring
    this.healthMonitor.stopMonitoring();
    
    // Stop dashboard
    if (this.dashboard) {
      await this.dashboard.stop();
    }
    
    // Disconnect storage
    if (this.storage) {
      await StorageFactory.disconnect(this.storage);
    }
    
    this.emit('stopped');
  }
  
  async processDataPoint(dataPoint: DataPoint): Promise<FilteredDataPoint | null> {
    const processingStart = Date.now();
    
    try {
      // Check cache first
      if (this.cache) {
        const cached = await this.cache.get<FilteredDataPoint>(dataPoint.id);
        if (cached) {
          return cached;
        }
      }
      
      // Validate data point
      if (this.config.security?.validation !== false) {
        await this.validation.validate('data-point', dataPoint);
      }
      
      // Process through filter with resilience
      const filtered = await this.resilience.executeWithResilience(
        'filter',
        async () => await this.filter.filter(dataPoint)
      );
      
      this.statistics.processed++;
      
      if (filtered) {
        this.statistics.filtered++;
        this.updateStatistics(filtered);
        
        // Cache result
        if (this.cache) {
          await this.cache.set(filtered.id, filtered);
        }
        
        // Store in batch
        if (this.batchProcessor) {
          await this.batchProcessor.add(filtered);
        }
        
        // Record metrics
        this.healthMonitor.recordProcessed();
        const processingTime = Date.now() - processingStart;
        this.healthMonitor.recordResponseTime(processingTime);
        this.performanceMonitor.recordMetric('processing-time', processingTime);
        
        this.emit('filtered-data', filtered);
        return filtered;
      }
      
      return null;
      
    } catch (error) {
      this.statistics.errors++;
      this.healthMonitor.recordFailed();
      this.emit('processing-error', { dataPoint, error });
      return null;
    }
  }
  
  private updateStatistics(dataPoint: FilteredDataPoint): void {
    // Update filter rate
    this.statistics.filterRate = 
      (this.statistics.filtered / this.statistics.processed) * 100;
    
    // Update average coherence (running average)
    const prevTotal = this.statistics.averageCoherence * (this.statistics.filtered - 1);
    this.statistics.averageCoherence = 
      (prevTotal + dataPoint.coherenceScore) / this.statistics.filtered;
    
    // Update processing rate
    const elapsed = (Date.now() - this.startTime) / 1000; // seconds
    this.statistics.processingRate = this.statistics.processed / elapsed;
    
    // Update source statistics
    const activeSourcesSet = new Set(
      this.collector.getSources()
        .filter(s => s.status === 'active')
        .map(s => s.id)
    );
    
    this.statistics.sources.active = activeSourcesSet.size;
    this.statistics.sources.failed = 
      this.statistics.sources.total - this.statistics.sources.active;
  }
  
  async queryData(params: QueryParams): Promise<FilteredDataPoint[]> {
    if (!this.storage) {
      throw new Error('Storage not initialized');
    }
    
    // Check cache for query results
    const cacheKey = `query:${JSON.stringify(params)}`;
    if (this.cache) {
      const cached = await this.cache.get<FilteredDataPoint[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }
    
    const results = await this.storage.query(params);
    
    // Cache query results
    if (this.cache && results.length > 0) {
      await this.cache.set(cacheKey, results, 60000); // 1 minute
    }
    
    return results;
  }
  
  async getHealthStatus() {
    const health = this.healthMonitor.getHealthStatus();
    const storageHealth = this.storage ? await this.storage.getHealth() : null;
    
    return {
      ...health,
      storage: storageHealth,
      cache: this.cache?.getStats(),
      performance: this.performanceMonitor.getAllMetrics()
    };
  }
  
  getStatistics(): ECNEStatistics {
    return { ...this.statistics };
  }
  
  getCollector(): DataRiverCollector {
    return this.collector;
  }
  
  getFilter(): EnhancedCoherenceFilter {
    return this.filter;
  }
  
  updateFilterConfig(config: Partial<FilterConfig>): void {
    this.filter.updateConfig(config);
    this.emit('filter-config-updated', config);
  }
  
  async getTopFilteredData(limit: number = 10): Promise<FilteredDataPoint[]> {
    if (!this.storage) {
      throw new Error('Storage not initialized');
    }
    
    // Query for top coherence scores
    const results = await this.storage.query({
      orderBy: 'coherenceScore',
      order: 'desc',
      limit
    });
    
    return results;
  }
  
  async exportData(format: 'json' | 'csv' = 'json'): Promise<string> {
    const data = await this.queryData({ limit: 10000 });
    
    if (format === 'json') {
      return JSON.stringify({
        timestamp: new Date().toISOString(),
        statistics: this.statistics,
        data
      }, null, 2);
    }
    
    // CSV format
    const headers = [
      'id', 'source', 'timestamp', 'coherenceScore',
      'psi', 'rho', 'q', 'f'
    ];
    
    const rows = data.map(d => [
      d.id,
      d.source,
      d.timestamp.toISOString(),
      d.coherenceScore.toFixed(4),
      d.coherenceDimensions.psi.toFixed(4),
      d.coherenceDimensions.rho.toFixed(4),
      d.coherenceDimensions.q.toFixed(4),
      d.coherenceDimensions.f.toFixed(4)
    ]);
    
    return [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
  }
}