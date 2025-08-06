import { FilteredDataPoint } from '../types';

export interface QueryParams {
  source?: string;
  startDate?: Date;
  endDate?: Date;
  minCoherence?: number;
  maxCoherence?: number;
  limit?: number;
  offset?: number;
  orderBy?: 'timestamp' | 'coherenceScore';
  order?: 'asc' | 'desc';
}

export interface StorageHealthStatus {
  connected: boolean;
  latency: number;
  storedCount: number;
  lastError?: string;
  lastActivity?: Date;
}

export interface StorageConfig {
  type: 'postgresql' | 'mock' | 'mongodb' | 'redis';
  connectionString?: string;
  useMock?: boolean;
  fallbackToMock?: boolean;
  poolConfig?: {
    min?: number;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
  };
}

export abstract class StorageAdapter {
  protected config: StorageConfig;
  
  constructor(config: StorageConfig) {
    this.config = config;
  }
  
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract store(data: FilteredDataPoint): Promise<void>;
  abstract storeBatch(data: FilteredDataPoint[]): Promise<void>;
  abstract query(params: QueryParams): Promise<FilteredDataPoint[]>;
  abstract count(params?: QueryParams): Promise<number>;
  abstract delete(id: string): Promise<boolean>;
  abstract deleteMany(ids: string[]): Promise<number>;
  abstract getHealth(): Promise<StorageHealthStatus>;
  abstract clear(): Promise<void>;
  
  // Optional methods with default implementations
  async exists(id: string): Promise<boolean> {
    const results = await this.query({ limit: 1 });
    return results.some(r => r.id === id);
  }
  
  async getById(id: string): Promise<FilteredDataPoint | null> {
    const results = await this.query({ limit: 1 });
    return results.find(r => r.id === id) || null;
  }
  
  async getLatest(limit: number = 10): Promise<FilteredDataPoint[]> {
    return this.query({
      limit,
      orderBy: 'timestamp',
      order: 'desc'
    });
  }
  
  async getBySource(source: string, limit?: number): Promise<FilteredDataPoint[]> {
    return this.query({ source, limit });
  }
  
  async getByCoherenceRange(
    min: number, 
    max: number, 
    limit?: number
  ): Promise<FilteredDataPoint[]> {
    return this.query({
      minCoherence: min,
      maxCoherence: max,
      limit
    });
  }
}