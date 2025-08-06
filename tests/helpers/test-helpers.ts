import { DataPoint, FilteredDataPoint, APISource } from '../../src/types';

export const createDataPoint = (overrides: Partial<DataPoint> = {}): DataPoint => {
  return {
    id: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    source: 'test-api',
    timestamp: new Date(),
    content: { test: true, value: Math.random() },
    metadata: {
      apiVersion: '1.0',
      contentType: 'test'
    },
    ...overrides
  };
};

export const createFilteredDataPoint = (
  overrides: Partial<FilteredDataPoint> = {}
): FilteredDataPoint => {
  const base = createDataPoint();
  return {
    ...base,
    coherenceScore: 0.75,
    coherenceDimensions: {
      psi: 0.8,
      rho: 0.7,
      q: 0.7,
      f: 0.8
    },
    ...overrides
  };
};

export const createAPISource = (overrides: Partial<APISource> = {}): APISource => {
  return {
    id: 'test-source',
    name: 'Test API Source',
    baseUrl: 'http://localhost:3000',
    endpoints: [{
      path: '/api/data',
      method: 'GET',
      refreshInterval: 60
    }],
    rateLimits: {
      requestsPerMinute: 60,
      requestsPerHour: 1000
    },
    ...overrides
  };
};

export const wait = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const waitUntil = async (
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> => {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await wait(interval);
  }
  
  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
};

export class MockEventEmitter {
  private events: Map<string, Function[]> = new Map();
  
  on(event: string, handler: Function): void {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.push(handler);
  }
  
  emit(event: string, ...args: any[]): void {
    const handlers = this.events.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(...args));
    }
  }
  
  removeAllListeners(event?: string): void {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }
  
  listenerCount(event: string): number {
    return this.events.get(event)?.length || 0;
  }
}

export const generateMockData = (count: number, template?: any): any[] => {
  return Array(count).fill(null).map((_, index) => {
    if (template) {
      return typeof template === 'function' ? template(index) : { ...template, index };
    }
    
    return {
      id: `mock-${index}`,
      value: Math.random(),
      timestamp: new Date(),
      index
    };
  });
};

export const measurePerformance = async <T>(
  operation: () => Promise<T>,
  label: string = 'Operation'
): Promise<{ result: T; duration: number; memory: number }> => {
  const startMemory = process.memoryUsage().heapUsed;
  const startTime = performance.now();
  
  const result = await operation();
  
  const duration = performance.now() - startTime;
  const memoryUsed = process.memoryUsage().heapUsed - startMemory;
  
  console.log(`${label}: ${duration.toFixed(2)}ms, ${(memoryUsed / 1024 / 1024).toFixed(2)}MB`);
  
  return { result, duration, memory: memoryUsed };
};

export const captureEvents = (emitter: any, events: string[]): Map<string, any[]> => {
  const captured = new Map<string, any[]>();
  
  events.forEach(event => {
    captured.set(event, []);
    emitter.on(event, (...args: any[]) => {
      captured.get(event)!.push(args.length === 1 ? args[0] : args);
    });
  });
  
  return captured;
};

export const mockFetch = (responses: Map<string, any>): jest.Mock => {
  return jest.fn(async (url: string) => {
    const response = responses.get(url);
    
    if (!response) {
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' })
      };
    }
    
    if (response.error) {
      return {
        ok: false,
        status: response.status || 500,
        json: async () => ({ error: response.error })
      };
    }
    
    return {
      ok: true,
      status: 200,
      json: async () => response
    };
  });
};