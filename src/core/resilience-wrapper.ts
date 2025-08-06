import { EventEmitter } from 'events';

export interface CircuitState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  lastFailTime: number;
  successCount: number;
}

export interface RetryConfig {
  maxAttempts: number;
  backoffFactor: number;
  initialDelay: number;
  maxDelay: number;
}

export class RetryManager {
  constructor(private config: RetryConfig) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === this.config.maxAttempts) {
          throw lastError;
        }
        
        const delay = Math.min(
          this.config.initialDelay * Math.pow(this.config.backoffFactor, attempt - 1),
          this.config.maxDelay
        );
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }
}

export class ResilienceWrapper extends EventEmitter {
  private circuitBreakers: Map<string, CircuitState> = new Map();
  private retryManager: RetryManager;
  private fallbackHandlers: Map<string, Function> = new Map();
  
  private readonly FAILURE_THRESHOLD = 5;
  private readonly SUCCESS_THRESHOLD = 3;
  private readonly TIMEOUT = 60000; // 1 minute
  
  constructor() {
    super();
    this.retryManager = new RetryManager({
      maxAttempts: 3,
      backoffFactor: 2,
      initialDelay: 1000,
      maxDelay: 10000
    });
  }
  
  async executeWithResilience<T>(
    operation: string,
    fn: () => Promise<T>,
    fallback?: () => T
  ): Promise<T> {
    const breaker = this.getCircuitBreaker(operation);
    
    if (breaker.state === 'OPEN') {
      if (Date.now() - breaker.lastFailTime > this.TIMEOUT) {
        breaker.state = 'HALF_OPEN';
        breaker.successCount = 0;
      } else {
        this.emit('circuit-open', { operation, breaker });
        return fallback ? fallback() : this.getDefaultFallback(operation);
      }
    }
    
    try {
      const result = await this.retryManager.execute(fn);
      this.recordSuccess(operation, breaker);
      return result;
    } catch (error) {
      this.recordFailure(operation, breaker);
      
      if (breaker.state === 'OPEN' && fallback) {
        return fallback();
      }
      
      throw error;
    }
  }
  
  private getCircuitBreaker(operation: string): CircuitState {
    if (!this.circuitBreakers.has(operation)) {
      this.circuitBreakers.set(operation, {
        state: 'CLOSED',
        failures: 0,
        lastFailTime: 0,
        successCount: 0
      });
    }
    
    return this.circuitBreakers.get(operation)!;
  }
  
  private recordSuccess(operation: string, breaker: CircuitState): void {
    breaker.failures = 0;
    
    if (breaker.state === 'HALF_OPEN') {
      breaker.successCount++;
      
      if (breaker.successCount >= this.SUCCESS_THRESHOLD) {
        breaker.state = 'CLOSED';
        this.emit('circuit-closed', { operation, breaker });
      }
    }
  }
  
  private recordFailure(operation: string, breaker: CircuitState): void {
    breaker.failures++;
    breaker.lastFailTime = Date.now();
    breaker.successCount = 0;
    
    if (breaker.failures >= this.FAILURE_THRESHOLD && breaker.state !== 'OPEN') {
      breaker.state = 'OPEN';
      this.emit('circuit-opened', { operation, breaker });
    }
  }
  
  private getDefaultFallback(operation: string): any {
    const fallback = this.fallbackHandlers.get(operation);
    
    if (fallback) {
      return fallback();
    }
    
    // Default fallbacks based on operation type
    if (operation.includes('fetch') || operation.includes('api')) {
      return { data: [], cached: true, error: 'Circuit breaker open' };
    }
    
    if (operation.includes('store') || operation.includes('save')) {
      return { success: false, queued: true, error: 'Circuit breaker open' };
    }
    
    return null;
  }
  
  registerFallback(operation: string, handler: Function): void {
    this.fallbackHandlers.set(operation, handler);
  }
  
  getCircuitStatus(operation?: string): Map<string, CircuitState> | CircuitState | null {
    if (operation) {
      return this.circuitBreakers.get(operation) || null;
    }
    
    return new Map(this.circuitBreakers);
  }
  
  resetCircuit(operation: string): void {
    const breaker = this.circuitBreakers.get(operation);
    if (breaker) {
      breaker.state = 'CLOSED';
      breaker.failures = 0;
      breaker.successCount = 0;
      this.emit('circuit-reset', { operation, breaker });
    }
  }
}