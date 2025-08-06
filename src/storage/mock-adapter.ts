import { StorageAdapter, QueryParams, StorageHealthStatus, StorageConfig } from './storage-adapter';
import { FilteredDataPoint } from '../types';

export class MockStorageAdapter extends StorageAdapter {
  private storage: Map<string, FilteredDataPoint> = new Map();
  private queryIndex: Map<string, Set<string>> = new Map();
  private connected: boolean = false;
  private storedCount: number = 0;
  private lastActivity?: Date;
  
  // Indices for efficient querying
  private sourceIndex: Map<string, Set<string>> = new Map();
  private timeIndex: Array<{ id: string; timestamp: Date }> = [];
  private coherenceIndex: Array<{ id: string; score: number }> = [];
  
  async connect(): Promise<void> {
    // Instant connection for mock
    this.connected = true;
    return Promise.resolve();
  }
  
  async disconnect(): Promise<void> {
    this.connected = false;
    return Promise.resolve();
  }
  
  async store(data: FilteredDataPoint): Promise<void> {
    if (!this.connected) {
      throw new Error('Mock storage not connected');
    }
    
    this.storage.set(data.id, data);
    this.updateIndices(data);
    this.storedCount++;
    this.lastActivity = new Date();
  }
  
  async storeBatch(data: FilteredDataPoint[]): Promise<void> {
    if (!this.connected) {
      throw new Error('Mock storage not connected');
    }
    
    for (const item of data) {
      this.storage.set(item.id, item);
      this.updateIndices(item);
    }
    
    this.storedCount += data.length;
    this.lastActivity = new Date();
  }
  
  async query(params: QueryParams): Promise<FilteredDataPoint[]> {
    if (!this.connected) {
      throw new Error('Mock storage not connected');
    }
    
    let results = Array.from(this.storage.values());
    
    // Apply filters
    if (params.source) {
      const sourceIds = this.sourceIndex.get(params.source) || new Set();
      results = results.filter(r => sourceIds.has(r.id));
    }
    
    if (params.startDate) {
      results = results.filter(r => r.timestamp >= params.startDate!);
    }
    
    if (params.endDate) {
      results = results.filter(r => r.timestamp <= params.endDate!);
    }
    
    if (params.minCoherence !== undefined) {
      results = results.filter(r => r.coherenceScore >= params.minCoherence!);
    }
    
    if (params.maxCoherence !== undefined) {
      results = results.filter(r => r.coherenceScore <= params.maxCoherence!);
    }
    
    // Apply sorting
    if (params.orderBy) {
      results.sort((a, b) => {
        const aVal = params.orderBy === 'coherenceScore' ? a.coherenceScore : a.timestamp.getTime();
        const bVal = params.orderBy === 'coherenceScore' ? b.coherenceScore : b.timestamp.getTime();
        
        if (params.order === 'asc') {
          return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        } else {
          return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
        }
      });
    } else {
      // Default sort by timestamp desc
      results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }
    
    // Apply pagination
    if (params.offset) {
      results = results.slice(params.offset);
    }
    
    if (params.limit) {
      results = results.slice(0, params.limit);
    }
    
    return results;
  }
  
  async count(params?: QueryParams): Promise<number> {
    if (!params) {
      return this.storage.size;
    }
    
    const results = await this.query({ ...params, limit: undefined, offset: undefined });
    return results.length;
  }
  
  async delete(id: string): Promise<boolean> {
    if (!this.connected) {
      throw new Error('Mock storage not connected');
    }
    
    const data = this.storage.get(id);
    if (!data) {
      return false;
    }
    
    this.storage.delete(id);
    this.removeFromIndices(data);
    this.storedCount--;
    
    return true;
  }
  
  async deleteMany(ids: string[]): Promise<number> {
    if (!this.connected) {
      throw new Error('Mock storage not connected');
    }
    
    let deleted = 0;
    
    for (const id of ids) {
      if (await this.delete(id)) {
        deleted++;
      }
    }
    
    return deleted;
  }
  
  async clear(): Promise<void> {
    this.storage.clear();
    this.sourceIndex.clear();
    this.timeIndex = [];
    this.coherenceIndex = [];
    this.storedCount = 0;
  }
  
  async getHealth(): Promise<StorageHealthStatus> {
    return {
      connected: this.connected,
      latency: 0, // Mock has no latency
      storedCount: this.storedCount,
      lastActivity: this.lastActivity
    };
  }
  
  private updateIndices(data: FilteredDataPoint): void {
    // Update source index
    if (!this.sourceIndex.has(data.source)) {
      this.sourceIndex.set(data.source, new Set());
    }
    this.sourceIndex.get(data.source)!.add(data.id);
    
    // Update time index
    this.timeIndex.push({ id: data.id, timestamp: data.timestamp });
    this.timeIndex.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    // Update coherence index
    this.coherenceIndex.push({ id: data.id, score: data.coherenceScore });
    this.coherenceIndex.sort((a, b) => b.score - a.score);
    
    // Limit index sizes to prevent memory issues
    if (this.timeIndex.length > 10000) {
      const removed = this.timeIndex.pop();
      if (removed) {
        this.storage.delete(removed.id);
      }
    }
  }
  
  private removeFromIndices(data: FilteredDataPoint): void {
    // Remove from source index
    const sourceIds = this.sourceIndex.get(data.source);
    if (sourceIds) {
      sourceIds.delete(data.id);
      if (sourceIds.size === 0) {
        this.sourceIndex.delete(data.source);
      }
    }
    
    // Remove from time index
    this.timeIndex = this.timeIndex.filter(item => item.id !== data.id);
    
    // Remove from coherence index
    this.coherenceIndex = this.coherenceIndex.filter(item => item.id !== data.id);
  }
  
  // Additional mock-specific methods for testing
  
  getStorageSize(): number {
    return this.storage.size;
  }
  
  getSources(): string[] {
    return Array.from(this.sourceIndex.keys());
  }
  
  simulateLatency(ms: number): void {
    const originalMethods = {
      store: this.store.bind(this),
      query: this.query.bind(this),
      delete: this.delete.bind(this)
    };
    
    this.store = async (data: FilteredDataPoint) => {
      await new Promise(resolve => setTimeout(resolve, ms));
      return originalMethods.store(data);
    };
    
    this.query = async (params: QueryParams) => {
      await new Promise(resolve => setTimeout(resolve, ms));
      return originalMethods.query(params);
    };
    
    this.delete = async (id: string) => {
      await new Promise(resolve => setTimeout(resolve, ms));
      return originalMethods.delete(id);
    };
  }
  
  simulateErrors(errorRate: number): void {
    const originalStore = this.store.bind(this);
    
    this.store = async (data: FilteredDataPoint) => {
      if (Math.random() < errorRate) {
        throw new Error('Simulated storage error');
      }
      return originalStore(data);
    };
  }
}