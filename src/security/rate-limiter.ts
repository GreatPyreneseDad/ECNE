import { EventEmitter } from 'events';

export interface RateLimit {
  requests: number;
  window: number; // milliseconds
}

export interface RateLimitConfig {
  defaultLimit: RateLimit;
  categories?: Map<string, RateLimit>;
  storage?: 'memory' | 'redis';
  redisClient?: any;
  blockDuration?: number; // How long to block after limit exceeded
  whitelistPatterns?: RegExp[];
  blacklistPatterns?: RegExp[];
}

export class RateLimitExceededError extends Error {
  constructor(
    message: string,
    public retryAfter?: number,
    public limit?: RateLimit
  ) {
    super(message);
    this.name = 'RateLimitExceededError';
  }
}

interface RateLimitEntry {
  requests: number[];
  blocked?: boolean;
  blockExpiry?: number;
}

export class RateLimiter extends EventEmitter {
  private limits: Map<string, RateLimit> = new Map();
  private requests: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval?: NodeJS.Timeout;
  
  constructor(private config: RateLimitConfig) {
    super();
    this.initializeLimits();
    this.startCleanup();
  }
  
  private initializeLimits(): void {
    // Set default limit
    this.limits.set('default', this.config.defaultLimit);
    
    // Set category-specific limits
    if (this.config.categories) {
      for (const [category, limit] of this.config.categories) {
        this.limits.set(category, limit);
      }
    }
  }
  
  private startCleanup(): void {
    // Clean up old entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }
  
  private cleanup(): void {
    const now = Date.now();
    
    for (const [key, entry] of this.requests.entries()) {
      // Remove expired blocks
      if (entry.blocked && entry.blockExpiry && entry.blockExpiry < now) {
        entry.blocked = false;
        delete entry.blockExpiry;
      }
      
      // Remove old request timestamps
      const limit = this.getLimitForKey(key);
      entry.requests = entry.requests.filter(
        timestamp => now - timestamp < limit.window
      );
      
      // Remove empty entries
      if (entry.requests.length === 0 && !entry.blocked) {
        this.requests.delete(key);
      }
    }
  }
  
  private getLimitForKey(key: string): RateLimit {
    const [, category] = key.split(':');
    return this.limits.get(category) || this.config.defaultLimit;
  }
  
  async checkLimit(
    identifier: string,
    category: string = 'default'
  ): Promise<boolean> {
    // Check whitelist
    if (this.isWhitelisted(identifier)) {
      return true;
    }
    
    // Check blacklist
    if (this.isBlacklisted(identifier)) {
      throw new RateLimitExceededError(
        'Identifier is blacklisted',
        this.config.blockDuration
      );
    }
    
    const limit = this.limits.get(category) || this.config.defaultLimit;
    const key = `${identifier}:${category}`;
    const now = Date.now();
    
    // Get or create entry
    let entry = this.requests.get(key);
    if (!entry) {
      entry = { requests: [] };
      this.requests.set(key, entry);
    }
    
    // Check if blocked
    if (entry.blocked && entry.blockExpiry && entry.blockExpiry > now) {
      const retryAfter = Math.ceil((entry.blockExpiry - now) / 1000);
      throw new RateLimitExceededError(
        `Rate limit exceeded. Blocked for ${retryAfter} seconds`,
        retryAfter,
        limit
      );
    }
    
    // Remove old requests
    entry.requests = entry.requests.filter(
      timestamp => now - timestamp < limit.window
    );
    
    // Check rate limit
    if (entry.requests.length >= limit.requests) {
      // Block the identifier
      if (this.config.blockDuration) {
        entry.blocked = true;
        entry.blockExpiry = now + this.config.blockDuration;
      }
      
      const oldestRequest = Math.min(...entry.requests);
      const retryAfter = Math.ceil((oldestRequest + limit.window - now) / 1000);
      
      this.emit('rate-limit-exceeded', {
        identifier,
        category,
        limit,
        requests: entry.requests.length,
        retryAfter
      });
      
      throw new RateLimitExceededError(
        `Rate limit exceeded: ${entry.requests.length}/${limit.requests} in ${limit.window}ms`,
        retryAfter,
        limit
      );
    }
    
    // Record request
    entry.requests.push(now);
    
    this.emit('request-allowed', {
      identifier,
      category,
      remaining: limit.requests - entry.requests.length,
      resetIn: Math.ceil((Math.min(...entry.requests) + limit.window - now) / 1000)
    });
    
    return true;
  }
  
  async getRemainingRequests(
    identifier: string,
    category: string = 'default'
  ): Promise<number> {
    const limit = this.limits.get(category) || this.config.defaultLimit;
    const key = `${identifier}:${category}`;
    const now = Date.now();
    
    const entry = this.requests.get(key);
    if (!entry) {
      return limit.requests;
    }
    
    const recentRequests = entry.requests.filter(
      timestamp => now - timestamp < limit.window
    );
    
    return Math.max(0, limit.requests - recentRequests.length);
  }
  
  async getResetTime(
    identifier: string,
    category: string = 'default'
  ): Promise<number | null> {
    const limit = this.limits.get(category) || this.config.defaultLimit;
    const key = `${identifier}:${category}`;
    const now = Date.now();
    
    const entry = this.requests.get(key);
    if (!entry || entry.requests.length === 0) {
      return null;
    }
    
    const recentRequests = entry.requests.filter(
      timestamp => now - timestamp < limit.window
    );
    
    if (recentRequests.length === 0) {
      return null;
    }
    
    const oldestRequest = Math.min(...recentRequests);
    return oldestRequest + limit.window;
  }
  
  reset(identifier?: string, category?: string): void {
    if (identifier && category) {
      this.requests.delete(`${identifier}:${category}`);
    } else if (identifier) {
      // Reset all categories for identifier
      for (const key of this.requests.keys()) {
        if (key.startsWith(`${identifier}:`)) {
          this.requests.delete(key);
        }
      }
    } else {
      // Reset all
      this.requests.clear();
    }
  }
  
  updateLimit(category: string, limit: RateLimit): void {
    this.limits.set(category, limit);
    this.emit('limit-updated', { category, limit });
  }
  
  private isWhitelisted(identifier: string): boolean {
    if (!this.config.whitelistPatterns) {
      return false;
    }
    
    return this.config.whitelistPatterns.some(
      pattern => pattern.test(identifier)
    );
  }
  
  private isBlacklisted(identifier: string): boolean {
    if (!this.config.blacklistPatterns) {
      return false;
    }
    
    return this.config.blacklistPatterns.some(
      pattern => pattern.test(identifier)
    );
  }
  
  getStatistics(): {
    totalIdentifiers: number;
    blockedIdentifiers: number;
    categoryStats: Map<string, { requests: number; identifiers: number }>;
  } {
    const categoryStats = new Map<string, { requests: number; identifiers: number }>();
    let blockedCount = 0;
    
    for (const [key, entry] of this.requests.entries()) {
      const [, category] = key.split(':');
      
      if (entry.blocked) {
        blockedCount++;
      }
      
      if (!categoryStats.has(category)) {
        categoryStats.set(category, { requests: 0, identifiers: 0 });
      }
      
      const stats = categoryStats.get(category)!;
      stats.requests += entry.requests.length;
      stats.identifiers++;
    }
    
    return {
      totalIdentifiers: this.requests.size,
      blockedIdentifiers: blockedCount,
      categoryStats
    };
  }
  
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.requests.clear();
    this.removeAllListeners();
  }
}

// Middleware factory for Express/Connect
export function createRateLimitMiddleware(
  limiter: RateLimiter,
  options: {
    identifierExtractor?: (req: any) => string;
    categoryExtractor?: (req: any) => string;
    onLimitExceeded?: (req: any, res: any, error: RateLimitExceededError) => void;
  } = {}
) {
  const {
    identifierExtractor = (req) => req.ip || req.connection.remoteAddress,
    categoryExtractor = () => 'default',
    onLimitExceeded = (req, res, error) => {
      res.status(429).json({
        error: 'Too Many Requests',
        message: error.message,
        retryAfter: error.retryAfter
      });
    }
  } = options;
  
  return async (req: any, res: any, next: any) => {
    try {
      const identifier = identifierExtractor(req);
      const category = categoryExtractor(req);
      
      await limiter.checkLimit(identifier, category);
      
      // Add rate limit headers
      const remaining = await limiter.getRemainingRequests(identifier, category);
      const resetTime = await limiter.getResetTime(identifier, category);
      
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      if (resetTime) {
        res.setHeader('X-RateLimit-Reset', Math.ceil(resetTime / 1000).toString());
      }
      
      next();
    } catch (error) {
      if (error instanceof RateLimitExceededError) {
        onLimitExceeded(req, res, error);
      } else {
        next(error);
      }
    }
  };
}