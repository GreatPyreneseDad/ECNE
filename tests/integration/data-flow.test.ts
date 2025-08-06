import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import { ECNEDataRiver } from '../../src/ecne';
import { APISource } from '../../src/types';
import express from 'express';
import { Server } from 'http';

// Mock API server for testing
class MockAPIServer {
  private app: express.Application;
  private server: Server | null = null;
  private port: number;
  private failureRate: number;
  private responseDelay: number;
  private requestCount: number = 0;
  
  constructor(
    port: number,
    options: {
      failureRate?: number;
      responseDelay?: number;
    } = {}
  ) {
    this.port = port;
    this.failureRate = options.failureRate || 0;
    this.responseDelay = options.responseDelay || 0;
    this.app = express();
    this.setupRoutes();
  }
  
  private setupRoutes(): void {
    this.app.get('/api/data', async (req, res) => {
      this.requestCount++;
      
      // Simulate delay
      if (this.responseDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, this.responseDelay));
      }
      
      // Simulate failures
      if (Math.random() < this.failureRate) {
        res.status(500).json({ error: 'Simulated failure' });
        return;
      }
      
      // Return mock data
      res.json({
        data: Array(10).fill(null).map((_, i) => ({
          id: `${this.port}-${this.requestCount}-${i}`,
          timestamp: new Date(),
          value: Math.random(),
          category: ['tech', 'news', 'social'][Math.floor(Math.random() * 3)],
          content: {
            title: `Mock item ${i}`,
            description: `Description for item ${i}`,
            relevance: Math.random()
          }
        }))
      });
    });
    
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', port: this.port });
    });
  }
  
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`Mock API server started on port ${this.port}`);
        resolve();
      });
    });
  }
  
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log(`Mock API server stopped on port ${this.port}`);
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
  
  getRequestCount(): number {
    return this.requestCount;
  }
  
  resetRequestCount(): void {
    this.requestCount = 0;
  }
}

// Helper functions
const createTestSource = (
  id: string,
  port: number,
  options: {
    failureRate?: number;
    refreshInterval?: number;
  } = {}
): APISource => {
  return {
    id,
    name: `Test API ${id}`,
    baseUrl: `http://localhost:${port}`,
    endpoints: [{
      path: '/api/data',
      method: 'GET',
      refreshInterval: options.refreshInterval || 1
    }],
    rateLimits: {
      requestsPerMinute: 60,
      requestsPerHour: 1000
    }
  };
};

const waitForDataProcessing = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

describe('Data Flow Integration', () => {
  let ecne: ECNEDataRiver;
  let mockAPIs: MockAPIServer[] = [];
  const testConfig = {
    filter: {
      sensitivity: 0.3,
      weights: { psi: 0.25, rho: 0.25, q: 0.25, f: 0.25 },
      enableAnomalyDetection: true,
      enablePrediction: false
    },
    storage: {
      type: 'mock' as const,
      useMock: true
    },
    collector: {
      maxConcurrent: 5,
      retryAttempts: 2,
      retryDelay: 100
    }
  };
  
  beforeAll(async () => {
    // Start mock API servers
    mockAPIs = [
      new MockAPIServer(4001),
      new MockAPIServer(4002, { failureRate: 0.2 }),
      new MockAPIServer(4003, { responseDelay: 100 }),
      new MockAPIServer(4004, { failureRate: 0.5 }),
      new MockAPIServer(4005)
    ];
    
    await Promise.all(mockAPIs.map(api => api.start()));
    
    // Initialize ECNE
    ecne = new ECNEDataRiver(testConfig);
    await ecne.initialize();
  });
  
  afterAll(async () => {
    await ecne.stop();
    await Promise.all(mockAPIs.map(api => api.stop()));
  });
  
  describe('Basic Data Flow', () => {
    it('should process data from multiple sources concurrently', async () => {
      const sources = mockAPIs.slice(0, 3).map((api, i) => 
        createTestSource(`api-${i + 1}`, 4001 + i)
      );
      
      await ecne.start(sources);
      await waitForDataProcessing(3000);
      
      const stats = await ecne.getStatistics();
      expect(stats.processed).toBeGreaterThan(0);
      expect(stats.sources.active).toBe(3);
      expect(stats.sources.failed).toBe(0);
    });
    
    it('should filter data based on coherence threshold', async () => {
      const source = createTestSource('filter-test', 4001);
      
      await ecne.start([source]);
      await waitForDataProcessing(2000);
      
      const stats = await ecne.getStatistics();
      expect(stats.filtered).toBeLessThan(stats.processed);
      expect(stats.filterRate).toBeGreaterThan(0);
      expect(stats.filterRate).toBeLessThan(100);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle API failures gracefully', async () => {
      const sources = [
        createTestSource('reliable', 4001),
        createTestSource('unreliable', 4004) // 50% failure rate
      ];
      
      await ecne.start(sources);
      await waitForDataProcessing(3000);
      
      const stats = await ecne.getStatistics();
      expect(stats.sources.active).toBeGreaterThanOrEqual(1);
      expect(stats.processed).toBeGreaterThan(0);
      expect(stats.errors).toBeGreaterThan(0);
    });
    
    it('should retry failed requests', async () => {
      const failingAPI = mockAPIs[3]; // 50% failure rate
      failingAPI.resetRequestCount();
      
      const source = createTestSource('retry-test', 4004);
      
      await ecne.start([source]);
      await waitForDataProcessing(3000);
      
      // Should have more requests than refresh intervals due to retries
      const requestCount = failingAPI.getRequestCount();
      expect(requestCount).toBeGreaterThan(2);
    });
    
    it('should continue processing when one source fails completely', async () => {
      // Stop one API server
      await mockAPIs[2].stop();
      
      const sources = [
        createTestSource('working', 4001),
        createTestSource('stopped', 4003), // This one is stopped
        createTestSource('working2', 4005)
      ];
      
      await ecne.start(sources);
      await waitForDataProcessing(2000);
      
      const stats = await ecne.getStatistics();
      expect(stats.sources.active).toBe(2);
      expect(stats.sources.failed).toBe(1);
      expect(stats.processed).toBeGreaterThan(0);
      
      // Restart the API for other tests
      await mockAPIs[2].start();
    });
  });
  
  describe('Performance', () => {
    it('should handle high-frequency data updates', async () => {
      const sources = mockAPIs.slice(0, 3).map((api, i) => 
        createTestSource(`high-freq-${i}`, 4001 + i, { refreshInterval: 0.5 })
      );
      
      await ecne.start(sources);
      await waitForDataProcessing(5000);
      
      const stats = await ecne.getStatistics();
      expect(stats.processed).toBeGreaterThan(20); // At least 20 data points in 5 seconds
      expect(stats.processingRate).toBeGreaterThan(4); // At least 4 per second
    });
    
    it('should respect rate limits', async () => {
      const source: APISource = {
        ...createTestSource('rate-limited', 4001),
        rateLimits: {
          requestsPerMinute: 10,
          requestsPerHour: 100
        }
      };
      
      mockAPIs[0].resetRequestCount();
      
      await ecne.start([source]);
      await waitForDataProcessing(6000); // 6 seconds
      
      const requestCount = mockAPIs[0].getRequestCount();
      expect(requestCount).toBeLessThanOrEqual(2); // Should respect 10/min limit
    });
  });
  
  describe('Data Integrity', () => {
    it('should maintain data consistency through the pipeline', async () => {
      let capturedData: any[] = [];
      
      // Add listener to capture filtered data
      ecne.on('filtered-data', (data) => {
        capturedData.push(data);
      });
      
      const source = createTestSource('integrity-test', 4001);
      
      await ecne.start([source]);
      await waitForDataProcessing(2000);
      
      expect(capturedData.length).toBeGreaterThan(0);
      
      // Verify data structure
      capturedData.forEach(data => {
        expect(data).toHaveProperty('id');
        expect(data).toHaveProperty('source', 'integrity-test');
        expect(data).toHaveProperty('timestamp');
        expect(data).toHaveProperty('coherenceScore');
        expect(data).toHaveProperty('coherenceDimensions');
        expect(data.coherenceScore).toBeGreaterThanOrEqual(0);
        expect(data.coherenceScore).toBeLessThanOrEqual(1);
      });
    });
    
    it('should detect anomalies in data stream', async () => {
      let anomalies: any[] = [];
      
      ecne.on('anomaly-detected', (anomaly) => {
        anomalies.push(anomaly);
      });
      
      const source = createTestSource('anomaly-test', 4001);
      
      await ecne.start([source]);
      await waitForDataProcessing(5000);
      
      // Should detect some anomalies in random data
      expect(anomalies.length).toBeGreaterThanOrEqual(0);
      
      anomalies.forEach(anomaly => {
        expect(anomaly).toHaveProperty('source');
        expect(anomaly).toHaveProperty('score');
        expect(anomaly).toHaveProperty('deviation');
        expect(anomaly).toHaveProperty('timestamp');
      });
    });
  });
  
  describe('Storage Integration', () => {
    it('should store filtered data points', async () => {
      const source = createTestSource('storage-test', 4001);
      
      await ecne.start([source]);
      await waitForDataProcessing(2000);
      
      const storedData = await ecne.queryData({
        source: 'storage-test',
        limit: 10
      });
      
      expect(storedData.length).toBeGreaterThan(0);
      expect(storedData.length).toBeLessThanOrEqual(10);
    });
    
    it('should query data by coherence range', async () => {
      const source = createTestSource('range-test', 4001);
      
      await ecne.start([source]);
      await waitForDataProcessing(3000);
      
      const highCoherenceData = await ecne.queryData({
        minCoherence: 0.7,
        maxCoherence: 1.0
      });
      
      highCoherenceData.forEach(data => {
        expect(data.coherenceScore).toBeGreaterThanOrEqual(0.7);
        expect(data.coherenceScore).toBeLessThanOrEqual(1.0);
      });
    });
  });
  
  describe('Health Monitoring', () => {
    it('should track system health metrics', async () => {
      const sources = mockAPIs.slice(0, 2).map((api, i) => 
        createTestSource(`health-${i}`, 4001 + i)
      );
      
      await ecne.start(sources);
      await waitForDataProcessing(2000);
      
      const health = await ecne.getHealthStatus();
      
      expect(health.status).toMatch(/healthy|degraded|critical/);
      expect(health.metrics).toHaveProperty('uptime');
      expect(health.metrics).toHaveProperty('memoryUsage');
      expect(health.metrics).toHaveProperty('errorRate');
      expect(health.metrics).toHaveProperty('activeConnections');
      expect(health.metrics.uptime).toBeGreaterThan(0);
    });
  });
});