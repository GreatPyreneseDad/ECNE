export { CacheManager, CacheConfig, CacheStats, LRUCache } from './cache-manager';
export { 
  BatchProcessor, 
  DatabaseBatchProcessor,
  BatchConfig, 
  BatchResult, 
  BatchStats,
  createBatchProcessor 
} from './batch-processor';

// Connection pooling for API requests
export class ConnectionPool {
  private connections: Map<string, any[]> = new Map();
  private maxPerHost: number;
  private maxTotal: number;
  private activeCount: number = 0;
  
  constructor(config: {
    maxPerHost?: number;
    maxTotal?: number;
  } = {}) {
    this.maxPerHost = config.maxPerHost || 10;
    this.maxTotal = config.maxTotal || 50;
  }
  
  async acquire(host: string): Promise<any> {
    if (this.activeCount >= this.maxTotal) {
      throw new Error('Total connection limit reached');
    }
    
    if (!this.connections.has(host)) {
      this.connections.set(host, []);
    }
    
    const hostConnections = this.connections.get(host)!;
    
    if (hostConnections.length >= this.maxPerHost) {
      throw new Error(`Per-host connection limit reached for ${host}`);
    }
    
    // Create new connection (simplified)
    const connection = { host, id: Date.now() };
    hostConnections.push(connection);
    this.activeCount++;
    
    return connection;
  }
  
  release(host: string, connection: any): void {
    const hostConnections = this.connections.get(host);
    
    if (hostConnections) {
      const index = hostConnections.indexOf(connection);
      if (index > -1) {
        hostConnections.splice(index, 1);
        this.activeCount--;
      }
    }
  }
  
  getStats(): {
    activeConnections: number;
    hostCount: number;
    connectionsByHost: Map<string, number>;
  } {
    const connectionsByHost = new Map<string, number>();
    
    for (const [host, connections] of this.connections.entries()) {
      connectionsByHost.set(host, connections.length);
    }
    
    return {
      activeConnections: this.activeCount,
      hostCount: this.connections.size,
      connectionsByHost
    };
  }
  
  clear(): void {
    this.connections.clear();
    this.activeCount = 0;
  }
}

// Request deduplication to prevent duplicate API calls
export class RequestDeduplicator {
  private pendingRequests: Map<string, Promise<any>> = new Map();
  
  async deduplicate<T>(
    key: string,
    requestFn: () => Promise<T>
  ): Promise<T> {
    // Check if request is already pending
    const pending = this.pendingRequests.get(key);
    if (pending) {
      return pending;
    }
    
    // Create new request
    const request = requestFn()
      .finally(() => {
        // Clean up after completion
        this.pendingRequests.delete(key);
      });
    
    this.pendingRequests.set(key, request);
    return request;
  }
  
  isPending(key: string): boolean {
    return this.pendingRequests.has(key);
  }
  
  getPendingCount(): number {
    return this.pendingRequests.size;
  }
}

// Performance monitor for tracking system metrics
export class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();
  private timers: Map<string, number> = new Map();
  
  startTimer(name: string): void {
    this.timers.set(name, performance.now());
  }
  
  endTimer(name: string): number {
    const start = this.timers.get(name);
    if (!start) {
      throw new Error(`Timer ${name} not started`);
    }
    
    const duration = performance.now() - start;
    this.recordMetric(name, duration);
    this.timers.delete(name);
    
    return duration;
  }
  
  recordMetric(name: string, value: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    const values = this.metrics.get(name)!;
    values.push(value);
    
    // Keep only last 1000 values
    if (values.length > 1000) {
      values.shift();
    }
  }
  
  getMetrics(name: string): {
    count: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) {
      return null;
    }
    
    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    
    return {
      count: sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / sorted.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }
  
  getAllMetrics(): Map<string, any> {
    const results = new Map();
    
    for (const [name] of this.metrics.entries()) {
      results.set(name, this.getMetrics(name));
    }
    
    return results;
  }
  
  clear(): void {
    this.metrics.clear();
    this.timers.clear();
  }
}