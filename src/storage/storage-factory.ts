import { StorageAdapter, StorageConfig } from './storage-adapter';
import { MockStorageAdapter } from './mock-adapter';
import { PostgreSQLAdapter } from './postgresql-adapter';

export class StorageFactoryError extends Error {
  constructor(message: string, public originalError?: any) {
    super(message);
    this.name = 'StorageFactoryError';
  }
}

export class StorageFactory {
  private static instances: Map<string, StorageAdapter> = new Map();
  
  static async create(config: StorageConfig): Promise<StorageAdapter> {
    // Return cached instance if singleton pattern is used
    const cacheKey = `${config.type}-${config.connectionString || 'default'}`;
    
    if (this.instances.has(cacheKey)) {
      return this.instances.get(cacheKey)!;
    }
    
    // Create new adapter based on type
    let adapter: StorageAdapter;
    
    if (config.useMock || config.type === 'mock') {
      adapter = new MockStorageAdapter(config);
    } else {
      switch (config.type) {
        case 'postgresql':
          adapter = new PostgreSQLAdapter(config);
          break;
          
        case 'mongodb':
          throw new StorageFactoryError('MongoDB adapter not yet implemented');
          
        case 'redis':
          throw new StorageFactoryError('Redis adapter not yet implemented');
          
        default:
          throw new StorageFactoryError(`Unknown storage type: ${config.type}`);
      }
    }
    
    // Try to connect
    try {
      await adapter.connect();
      this.instances.set(cacheKey, adapter);
      
      console.log(`✅ Storage adapter connected: ${config.type}`);
      return adapter;
      
    } catch (error) {
      console.error(`❌ Primary storage connection failed: ${(error as Error).message}`);
      
      // Try fallback to mock if configured
      if (!config.useMock && config.fallbackToMock) {
        console.warn('⚠️  Falling back to mock storage adapter');
        
        const mockAdapter = new MockStorageAdapter(config);
        await mockAdapter.connect();
        
        this.instances.set(cacheKey, mockAdapter);
        return mockAdapter;
      }
      
      // Re-throw if no fallback
      throw new StorageFactoryError(
        `Failed to create storage adapter: ${(error as Error).message}`,
        error
      );
    }
  }
  
  static async createFromEnv(): Promise<StorageAdapter> {
    const config: StorageConfig = {
      type: (process.env.STORAGE_TYPE as StorageConfig['type']) || 'postgresql',
      connectionString: process.env.DATABASE_URL,
      useMock: process.env.USE_MOCK_STORAGE === 'true',
      fallbackToMock: process.env.FALLBACK_TO_MOCK !== 'false',
      poolConfig: {
        min: parseInt(process.env.DB_POOL_MIN || '5'),
        max: parseInt(process.env.DB_POOL_MAX || '20'),
        idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
        connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000')
      }
    };
    
    return this.create(config);
  }
  
  static async disconnect(adapter: StorageAdapter): Promise<void> {
    await adapter.disconnect();
    
    // Remove from cache
    for (const [key, instance] of this.instances.entries()) {
      if (instance === adapter) {
        this.instances.delete(key);
        break;
      }
    }
  }
  
  static async disconnectAll(): Promise<void> {
    const promises = Array.from(this.instances.values()).map(adapter => 
      adapter.disconnect()
    );
    
    await Promise.all(promises);
    this.instances.clear();
  }
  
  static getActiveAdapters(): StorageAdapter[] {
    return Array.from(this.instances.values());
  }
  
  static async healthCheck(): Promise<Map<string, any>> {
    const results = new Map();
    
    for (const [key, adapter] of this.instances.entries()) {
      try {
        const health = await adapter.getHealth();
        results.set(key, health);
      } catch (error) {
        results.set(key, {
          connected: false,
          error: (error as Error).message
        });
      }
    }
    
    return results;
  }
}