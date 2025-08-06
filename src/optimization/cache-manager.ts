import { EventEmitter } from 'events';

interface CacheEntry<T> {
  data: T;
  expires: number;
  hits: number;
  lastAccess: number;
}

export interface CacheConfig {
  maxMemoryItems?: number;
  defaultTTL?: number; // milliseconds
  useRedis?: boolean;
  redisUrl?: string;
  evictionPolicy?: 'lru' | 'lfu' | 'fifo';
  compressionThreshold?: number; // bytes
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  memoryUsage: number;
  hitRate: number;
}

export class LRUCache<K, V> {
  private cache: Map<K, V> = new Map();
  private accessOrder: K[] = [];
  
  constructor(private maxSize: number) {}
  
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.updateAccessOrder(key);
    }
    return value;
  }
  
  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.updateAccessOrder(key);
    } else {
      if (this.cache.size >= this.maxSize) {
        // Evict least recently used
        const lru = this.accessOrder.shift();
        if (lru !== undefined) {
          this.cache.delete(lru);
        }
      }
      this.accessOrder.push(key);
    }
    this.cache.set(key, value);
  }
  
  private updateAccessOrder(key: K): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }
  
  delete(key: K): boolean {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    return this.cache.delete(key);
  }
  
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }
  
  get size(): number {
    return this.cache.size;
  }
}

export class CacheManager extends EventEmitter {
  private memoryCache: Map<string, CacheEntry<any>> = new Map();
  private lruCache: LRUCache<string, CacheEntry<any>>;
  private redisClient?: any; // Redis client would be injected
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0,
    memoryUsage: 0,
    hitRate: 0
  };
  private cleanupInterval?: NodeJS.Timeout;
  private compressionThreshold: number;
  
  constructor(private config: CacheConfig) {
    super();
    
    this.lruCache = new LRUCache(config.maxMemoryItems || 10000);
    this.compressionThreshold = config.compressionThreshold || 1024; // 1KB
    
    if (config.useRedis && config.redisUrl) {
      this.initRedis(config.redisUrl);
    }
    
    this.startCleanup();
  }
  
  private async initRedis(url: string): Promise<void> {
    // In a real implementation, initialize Redis client here
    console.log(`Redis initialized with URL: ${url}`);
  }
  
  private startCleanup(): void {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60000);
  }
  
  private cleanupExpired(): void {
    const now = Date.now();
    let evicted = 0;
    
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expires > 0 && entry.expires < now) {
        this.memoryCache.delete(key);
        this.lruCache.delete(key);
        evicted++;
      }
    }
    
    if (evicted > 0) {
      this.stats.evictions += evicted;
      this.stats.size = this.memoryCache.size;
      this.emit('eviction', { count: evicted, reason: 'expired' });
    }
  }
  
  async get<T>(key: string): Promise<T | null> {
    // Check memory cache first
    const memEntry = this.getCacheEntry(key);
    if (memEntry) {
      this.stats.hits++;
      this.updateHitRate();
      return memEntry.data as T;
    }
    
    // Check Redis if available
    if (this.redisClient) {
      try {
        const redisResult = await this.getFromRedis(key);
        if (redisResult) {
          // Store in memory cache for faster access
          this.setMemoryCache(key, redisResult, this.config.defaultTTL);
          this.stats.hits++;
          this.updateHitRate();
          return redisResult as T;
        }
      } catch (error) {
        console.error('Redis get error:', error);
      }
    }
    
    this.stats.misses++;
    this.updateHitRate();
    return null;
  }
  
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const ttlMs = ttl || this.config.defaultTTL || 300000; // Default 5 minutes
    
    // Store in memory cache
    this.setMemoryCache(key, value, ttlMs);
    
    // Store in Redis if available
    if (this.redisClient) {
      try {
        await this.setInRedis(key, value, Math.floor(ttlMs / 1000));
      } catch (error) {
        console.error('Redis set error:', error);
      }
    }
    
    this.stats.size = this.memoryCache.size;
    this.emit('set', { key, ttl: ttlMs });
  }
  
  private getCacheEntry(key: string): CacheEntry<any> | null {
    const entry = this.memoryCache.get(key) || this.lruCache.get(key);
    
    if (!entry) {
      return null;
    }
    
    // Check expiration
    if (entry.expires > 0 && entry.expires < Date.now()) {
      this.memoryCache.delete(key);
      this.lruCache.delete(key);
      return null;
    }
    
    // Update access info
    entry.hits++;
    entry.lastAccess = Date.now();
    
    return entry;
  }
  
  private setMemoryCache(key: string, value: any, ttl: number): void {
    const entry: CacheEntry<any> = {
      data: value,
      expires: ttl > 0 ? Date.now() + ttl : 0,
      hits: 0,
      lastAccess: Date.now()
    };
    
    // Use appropriate cache based on eviction policy
    if (this.config.evictionPolicy === 'lru') {
      this.lruCache.set(key, entry);
    } else {
      this.memoryCache.set(key, entry);
      
      // Enforce size limit for non-LRU caches
      if (this.memoryCache.size > (this.config.maxMemoryItems || 10000)) {
        this.evictOldest();
      }
    }
    
    this.updateMemoryUsage();
  }
  
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.memoryCache.delete(oldestKey);
      this.stats.evictions++;
      this.emit('eviction', { key: oldestKey, reason: 'size-limit' });
    }
  }
  
  private async getFromRedis(key: string): Promise<any> {
    // Simulated Redis get
    return null;
  }
  
  private async setInRedis(key: string, value: any, ttlSeconds: number): Promise<void> {
    // Simulated Redis set
    const serialized = JSON.stringify(value);
    
    // Compress if over threshold
    if (serialized.length > this.compressionThreshold) {
      // In real implementation, would compress here
      console.log(`Would compress value for key ${key} (${serialized.length} bytes)`);
    }
  }
  
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }
  
  private updateMemoryUsage(): void {
    // Rough estimation of memory usage
    let totalSize = 0;
    
    for (const [key, entry] of this.memoryCache.entries()) {
      totalSize += key.length + JSON.stringify(entry.data).length + 32; // Overhead
    }
    
    this.stats.memoryUsage = totalSize;
  }
  
  async delete(key: string): Promise<boolean> {
    const deleted = this.memoryCache.delete(key) || this.lruCache.delete(key);
    
    if (this.redisClient) {
      try {
        await this.deleteFromRedis(key);
      } catch (error) {
        console.error('Redis delete error:', error);
      }
    }
    
    if (deleted) {
      this.stats.size = this.memoryCache.size;
      this.emit('delete', { key });
    }
    
    return deleted;
  }
  
  private async deleteFromRedis(key: string): Promise<void> {
    // Simulated Redis delete
  }
  
  async clear(): Promise<void> {
    this.memoryCache.clear();
    this.lruCache.clear();
    
    if (this.redisClient) {
      try {
        await this.clearRedis();
      } catch (error) {
        console.error('Redis clear error:', error);
      }
    }
    
    this.resetStats();
    this.emit('clear');
  }
  
  private async clearRedis(): Promise<void> {
    // Simulated Redis clear
  }
  
  private resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
      memoryUsage: 0,
      hitRate: 0
    };
  }
  
  getStats(): CacheStats {
    return { ...this.stats };
  }
  
  async has(key: string): Promise<boolean> {
    if (this.memoryCache.has(key) || this.lruCache.get(key)) {
      const entry = this.getCacheEntry(key);
      return entry !== null;
    }
    
    if (this.redisClient) {
      try {
        return await this.existsInRedis(key);
      } catch (error) {
        console.error('Redis exists error:', error);
      }
    }
    
    return false;
  }
  
  private async existsInRedis(key: string): Promise<boolean> {
    // Simulated Redis exists check
    return false;
  }
  
  // Batch operations for performance
  async mget<T>(keys: string[]): Promise<Map<string, T | null>> {
    const results = new Map<string, T | null>();
    const missingKeys: string[] = [];
    
    // Check memory cache first
    for (const key of keys) {
      const value = await this.get<T>(key);
      if (value !== null) {
        results.set(key, value);
      } else {
        missingKeys.push(key);
      }
    }
    
    // Batch get from Redis for missing keys
    if (this.redisClient && missingKeys.length > 0) {
      try {
        const redisResults = await this.mgetFromRedis(missingKeys);
        for (const [key, value] of redisResults.entries()) {
          results.set(key, value as T);
          if (value !== null) {
            this.setMemoryCache(key, value, this.config.defaultTTL || 300000);
          }
        }
      } catch (error) {
        console.error('Redis mget error:', error);
      }
    }
    
    return results;
  }
  
  private async mgetFromRedis(keys: string[]): Promise<Map<string, any>> {
    // Simulated Redis mget
    return new Map();
  }
  
  async mset<T>(entries: Array<[string, T, number?]>): Promise<void> {
    const redisPipeline: Array<[string, any, number]> = [];
    
    for (const [key, value, ttl] of entries) {
      const ttlMs = ttl || this.config.defaultTTL || 300000;
      this.setMemoryCache(key, value, ttlMs);
      
      if (this.redisClient) {
        redisPipeline.push([key, value, Math.floor(ttlMs / 1000)]);
      }
    }
    
    // Batch set in Redis
    if (this.redisClient && redisPipeline.length > 0) {
      try {
        await this.msetInRedis(redisPipeline);
      } catch (error) {
        console.error('Redis mset error:', error);
      }
    }
    
    this.stats.size = this.memoryCache.size;
    this.emit('mset', { count: entries.length });
  }
  
  private async msetInRedis(entries: Array<[string, any, number]>): Promise<void> {
    // Simulated Redis mset
  }
  
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.clear();
    
    if (this.redisClient) {
      // Close Redis connection
      console.log('Redis connection closed');
    }
    
    this.removeAllListeners();
  }
}