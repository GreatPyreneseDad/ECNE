import { EventEmitter } from 'events';

export interface BatchConfig {
  batchSize: number;
  batchTimeout: number; // milliseconds
  maxQueueSize?: number;
  retryOnFailure?: boolean;
  retryDelay?: number;
  retryAttempts?: number;
  concurrentBatches?: number;
}

export interface BatchResult<T> {
  successful: T[];
  failed: Array<{ item: T; error: Error }>;
  duration: number;
}

export interface BatchStats {
  processed: number;
  failed: number;
  queueSize: number;
  avgBatchSize: number;
  avgProcessingTime: number;
  totalBatches: number;
}

export class BatchProcessor<T> extends EventEmitter {
  private queue: T[] = [];
  private processing: boolean = false;
  private timer?: NodeJS.Timeout;
  private stats: BatchStats = {
    processed: 0,
    failed: 0,
    queueSize: 0,
    avgBatchSize: 0,
    avgProcessingTime: 0,
    totalBatches: 0
  };
  private batchSizes: number[] = [];
  private processingTimes: number[] = [];
  private activeBatches: number = 0;
  private maxQueueSize: number;
  private concurrentBatches: number;
  
  constructor(
    private processor: (batch: T[]) => Promise<void | BatchResult<T>>,
    private config: BatchConfig
  ) {
    super();
    this.maxQueueSize = config.maxQueueSize || 10000;
    this.concurrentBatches = config.concurrentBatches || 1;
  }
  
  async add(item: T): Promise<void> {
    // Check queue size limit
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error(`Queue size limit exceeded: ${this.maxQueueSize}`);
    }
    
    this.queue.push(item);
    this.stats.queueSize = this.queue.length;
    
    // Process immediately if batch size reached
    if (this.queue.length >= this.config.batchSize) {
      await this.processBatch();
    } else if (!this.timer) {
      // Set timer for timeout-based processing
      this.timer = setTimeout(() => {
        this.processBatch();
      }, this.config.batchTimeout);
    }
  }
  
  async addMany(items: T[]): Promise<void> {
    // Check if adding items would exceed queue limit
    if (this.queue.length + items.length > this.maxQueueSize) {
      throw new Error(
        `Adding ${items.length} items would exceed queue limit of ${this.maxQueueSize}`
      );
    }
    
    this.queue.push(...items);
    this.stats.queueSize = this.queue.length;
    
    // Process multiple batches if needed
    while (this.queue.length >= this.config.batchSize) {
      await this.processBatch();
    }
    
    // Set timer for remaining items
    if (this.queue.length > 0 && !this.timer) {
      this.timer = setTimeout(() => {
        this.processBatch();
      }, this.config.batchTimeout);
    }
  }
  
  private async processBatch(): Promise<void> {
    // Check if we can process more batches concurrently
    if (this.activeBatches >= this.concurrentBatches || this.queue.length === 0) {
      return;
    }
    
    // Clear timer
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    
    // Extract batch
    const batch = this.queue.splice(0, this.config.batchSize);
    if (batch.length === 0) {
      return;
    }
    
    this.activeBatches++;
    this.stats.queueSize = this.queue.length;
    
    // Track batch size
    this.batchSizes.push(batch.length);
    if (this.batchSizes.length > 100) {
      this.batchSizes.shift();
    }
    
    const startTime = Date.now();
    
    try {
      await this.processBatchWithRetry(batch);
      
      const processingTime = Date.now() - startTime;
      this.processingTimes.push(processingTime);
      if (this.processingTimes.length > 100) {
        this.processingTimes.shift();
      }
      
      this.stats.processed += batch.length;
      this.stats.totalBatches++;
      this.updateAverages();
      
      this.emit('batch-processed', {
        size: batch.length,
        duration: processingTime
      });
      
    } catch (error) {
      this.stats.failed += batch.length;
      
      this.emit('batch-failed', {
        size: batch.length,
        error
      });
      
      // Re-queue failed items if configured
      if (this.config.retryOnFailure) {
        this.requeue(batch);
      }
    } finally {
      this.activeBatches--;
      
      // Process next batch if available
      if (this.queue.length > 0) {
        setImmediate(() => this.processBatch());
      }
    }
  }
  
  private async processBatchWithRetry(batch: T[]): Promise<void> {
    const maxAttempts = this.config.retryAttempts || 3;
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.processor(batch);
        
        // Handle BatchResult if processor returns it
        if (result && 'successful' in result && 'failed' in result) {
          if (result.failed.length > 0) {
            this.handlePartialFailure(result);
          }
        }
        
        return;
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxAttempts) {
          const delay = this.config.retryDelay || 1000;
          await new Promise(resolve => setTimeout(resolve, delay * attempt));
          
          this.emit('batch-retry', {
            attempt,
            size: batch.length,
            error
          });
        }
      }
    }
    
    throw lastError!;
  }
  
  private handlePartialFailure<T>(result: BatchResult<T>): void {
    this.stats.processed += result.successful.length;
    this.stats.failed += result.failed.length;
    
    if (this.config.retryOnFailure) {
      const failedItems = result.failed.map(f => f.item);
      this.requeue(failedItems as any);
    }
    
    this.emit('partial-failure', {
      successful: result.successful.length,
      failed: result.failed.length,
      errors: result.failed.map(f => f.error.message)
    });
  }
  
  private requeue(items: T[]): void {
    // Add to front of queue for priority processing
    this.queue.unshift(...items);
    this.stats.queueSize = this.queue.length;
    
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.processBatch();
      }, this.config.retryDelay || 1000);
    }
  }
  
  private updateAverages(): void {
    if (this.batchSizes.length > 0) {
      this.stats.avgBatchSize = 
        this.batchSizes.reduce((a, b) => a + b, 0) / this.batchSizes.length;
    }
    
    if (this.processingTimes.length > 0) {
      this.stats.avgProcessingTime = 
        this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
    }
  }
  
  async flush(): Promise<void> {
    // Process all remaining items
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.config.batchSize);
      try {
        await this.processor(batch);
        this.stats.processed += batch.length;
      } catch (error) {
        this.stats.failed += batch.length;
        throw error;
      }
    }
    
    // Clear timer
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
  
  getStats(): BatchStats {
    return { ...this.stats };
  }
  
  getQueueSize(): number {
    return this.queue.length;
  }
  
  isProcessing(): boolean {
    return this.activeBatches > 0;
  }
  
  clear(): void {
    this.queue = [];
    this.stats.queueSize = 0;
    
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    
    this.emit('queue-cleared');
  }
  
  destroy(): void {
    this.clear();
    this.removeAllListeners();
  }
}

// Specialized batch processor for database operations
export class DatabaseBatchProcessor<T> extends BatchProcessor<T> {
  constructor(
    processor: (batch: T[]) => Promise<void | BatchResult<T>>,
    config: BatchConfig & { 
      transactionSize?: number;
      isolationLevel?: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';
    }
  ) {
    super(async (batch: T[]) => {
      // Process in transaction-sized chunks
      const transactionSize = config.transactionSize || batch.length;
      const chunks = [];
      
      for (let i = 0; i < batch.length; i += transactionSize) {
        chunks.push(batch.slice(i, i + transactionSize));
      }
      
      const results: BatchResult<T> = {
        successful: [],
        failed: [],
        duration: 0
      };
      
      const startTime = Date.now();
      
      for (const chunk of chunks) {
        try {
          const chunkResult = await processor(chunk);
          if (chunkResult && 'successful' in chunkResult) {
            results.successful.push(...chunkResult.successful);
            results.failed.push(...chunkResult.failed);
          } else {
            results.successful.push(...chunk);
          }
        } catch (error) {
          results.failed.push(...chunk.map(item => ({
            item,
            error: error as Error
          })));
        }
      }
      
      results.duration = Date.now() - startTime;
      return results;
    }, config);
  }
}

// Utility function to create a batch processor with common patterns
export function createBatchProcessor<T>(
  type: 'default' | 'database' | 'api',
  processor: (batch: T[]) => Promise<void | BatchResult<T>>,
  config: Partial<BatchConfig> = {}
): BatchProcessor<T> {
  const defaultConfigs = {
    default: {
      batchSize: 100,
      batchTimeout: 1000,
      retryOnFailure: true,
      retryAttempts: 3
    },
    database: {
      batchSize: 1000,
      batchTimeout: 5000,
      retryOnFailure: true,
      retryAttempts: 2,
      concurrentBatches: 2
    },
    api: {
      batchSize: 50,
      batchTimeout: 2000,
      retryOnFailure: true,
      retryAttempts: 3,
      retryDelay: 1000
    }
  };
  
  const finalConfig = { ...defaultConfigs[type], ...config } as BatchConfig;
  
  if (type === 'database') {
    return new DatabaseBatchProcessor(processor, finalConfig);
  }
  
  return new BatchProcessor(processor, finalConfig);
}