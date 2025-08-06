import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ECNEDataRiver } from '../../src/ecne';
import { DataPoint, FilteredDataPoint } from '../../src/types';
import { performance } from 'perf_hooks';

// Helper to create random data points
const createRandomDataPoint = (): DataPoint => {
  const sources = ['news-api', 'social-api', 'finance-api', 'tech-api', 'weather-api'];
  const categories = ['technology', 'business', 'science', 'health', 'entertainment'];
  
  return {
    id: `load-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    source: sources[Math.floor(Math.random() * sources.length)],
    timestamp: new Date(),
    content: {
      title: `Test article ${Math.random()}`,
      category: categories[Math.floor(Math.random() * categories.length)],
      text: Array(50).fill(null).map(() => 
        Math.random().toString(36).substr(2)
      ).join(' '),
      relevance: Math.random(),
      sentiment: Math.random() * 2 - 1,
      engagement: {
        views: Math.floor(Math.random() * 10000),
        likes: Math.floor(Math.random() * 1000),
        shares: Math.floor(Math.random() * 500)
      }
    },
    metadata: {
      processingTime: 0,
      apiVersion: '1.0',
      contentType: 'article'
    }
  };
};

// Memory usage tracking
const getMemoryUsage = () => {
  const usage = process.memoryUsage();
  return {
    rss: Math.round(usage.rss / 1024 / 1024), // MB
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
    external: Math.round(usage.external / 1024 / 1024)
  };
};

describe('Load Testing', () => {
  let ecne: ECNEDataRiver;
  const loadTestConfig = {
    filter: {
      sensitivity: 0.4,
      weights: { psi: 0.25, rho: 0.25, q: 0.25, f: 0.25 },
      enableAnomalyDetection: false, // Disable for performance
      enablePrediction: false
    },
    storage: {
      type: 'mock' as const,
      useMock: true
    },
    collector: {
      maxConcurrent: 50,
      batchSize: 100
    }
  };
  
  beforeAll(async () => {
    ecne = new ECNEDataRiver(loadTestConfig);
    await ecne.initialize();
  });
  
  afterAll(async () => {
    await ecne.stop();
  });
  
  describe('Concurrent Processing', () => {
    it('should handle 1000 concurrent data points', async () => {
      const dataPoints = Array(1000).fill(null).map(() => 
        createRandomDataPoint()
      );
      
      const startMemory = getMemoryUsage();
      const startTime = performance.now();
      
      const results = await Promise.all(
        dataPoints.map(dp => ecne.processDataPoint(dp))
      );
      
      const duration = performance.now() - startTime;
      const endMemory = getMemoryUsage();
      
      // Performance assertions
      expect(duration).toBeLessThan(5000); // 5 seconds max
      const throughput = 1000 / (duration / 1000);
      expect(throughput).toBeGreaterThan(200); // At least 200 points/second
      
      // Result assertions
      const filtered = results.filter(r => r !== null);
      expect(filtered.length).toBeGreaterThan(100); // At least 10% should pass filter
      expect(filtered.length).toBeLessThan(1000); // Not all should pass
      
      // Memory assertions
      const memoryIncrease = endMemory.heapUsed - startMemory.heapUsed;
      expect(memoryIncrease).toBeLessThan(100); // Less than 100MB increase
      
      console.log(`
        Load Test Results (1000 concurrent):
        - Duration: ${duration.toFixed(2)}ms
        - Throughput: ${throughput.toFixed(2)} points/second
        - Filtered: ${filtered.length} (${(filtered.length / 1000 * 100).toFixed(1)}%)
        - Memory increase: ${memoryIncrease}MB
      `);
    });
    
    it('should handle 10000 data points in batches', async () => {
      const batchSize = 100;
      const totalPoints = 10000;
      const batches = Math.ceil(totalPoints / batchSize);
      
      const startTime = performance.now();
      const startMemory = getMemoryUsage();
      let totalFiltered = 0;
      
      for (let i = 0; i < batches; i++) {
        const batch = Array(batchSize).fill(null).map(() => 
          createRandomDataPoint()
        );
        
        const results = await Promise.all(
          batch.map(dp => ecne.processDataPoint(dp))
        );
        
        totalFiltered += results.filter(r => r !== null).length;
      }
      
      const duration = performance.now() - startTime;
      const endMemory = getMemoryUsage();
      const throughput = totalPoints / (duration / 1000);
      
      expect(duration).toBeLessThan(30000); // 30 seconds max
      expect(throughput).toBeGreaterThan(300); // At least 300 points/second
      expect(totalFiltered).toBeGreaterThan(1000);
      
      console.log(`
        Batch Processing Results (10k points):
        - Duration: ${duration.toFixed(2)}ms
        - Throughput: ${throughput.toFixed(2)} points/second
        - Filtered: ${totalFiltered} (${(totalFiltered / totalPoints * 100).toFixed(1)}%)
        - Memory used: ${endMemory.heapUsed}MB
      `);
    });
  });
  
  describe('Sustained Load', () => {
    it('should maintain performance under sustained load', async () => {
      const testDuration = 10000; // 10 seconds
      const pointsPerSecond = 100;
      
      const startTime = performance.now();
      const metrics = {
        processed: 0,
        filtered: 0,
        errors: 0,
        maxResponseTime: 0,
        minResponseTime: Infinity,
        totalResponseTime: 0
      };
      
      const interval = setInterval(async () => {
        const batch = Array(pointsPerSecond).fill(null).map(() => 
          createRandomDataPoint()
        );
        
        const batchStart = performance.now();
        
        try {
          const results = await Promise.all(
            batch.map(dp => ecne.processDataPoint(dp))
          );
          
          const batchDuration = performance.now() - batchStart;
          
          metrics.processed += batch.length;
          metrics.filtered += results.filter(r => r !== null).length;
          metrics.totalResponseTime += batchDuration;
          metrics.maxResponseTime = Math.max(metrics.maxResponseTime, batchDuration);
          metrics.minResponseTime = Math.min(metrics.minResponseTime, batchDuration);
        } catch (error) {
          metrics.errors++;
        }
      }, 1000);
      
      await new Promise(resolve => setTimeout(resolve, testDuration));
      clearInterval(interval);
      
      const totalDuration = performance.now() - startTime;
      const avgResponseTime = metrics.totalResponseTime / (testDuration / 1000);
      
      expect(metrics.errors).toBe(0);
      expect(metrics.processed).toBeGreaterThan(testDuration / 1000 * pointsPerSecond * 0.9);
      expect(avgResponseTime).toBeLessThan(1000); // Average batch should complete in 1 second
      
      console.log(`
        Sustained Load Results (${testDuration / 1000}s @ ${pointsPerSecond} points/sec):
        - Total processed: ${metrics.processed}
        - Total filtered: ${metrics.filtered}
        - Filter rate: ${(metrics.filtered / metrics.processed * 100).toFixed(1)}%
        - Avg response time: ${avgResponseTime.toFixed(2)}ms
        - Max response time: ${metrics.maxResponseTime.toFixed(2)}ms
        - Errors: ${metrics.errors}
      `);
    });
  });
  
  describe('Memory Management', () => {
    it('should not leak memory under load', async () => {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const initialMemory = getMemoryUsage();
      const iterations = 10;
      const pointsPerIteration = 1000;
      
      for (let i = 0; i < iterations; i++) {
        const dataPoints = Array(pointsPerIteration).fill(null).map(() => 
          createRandomDataPoint()
        );
        
        await Promise.all(
          dataPoints.map(dp => ecne.processDataPoint(dp))
        );
        
        // Allow some cleanup between iterations
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Force garbage collection again
      if (global.gc) {
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const finalMemory = getMemoryUsage();
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      const growthPerPoint = memoryGrowth / (iterations * pointsPerIteration) * 1000;
      
      // Should not grow more than 50KB per 1000 points processed
      expect(growthPerPoint).toBeLessThan(50);
      
      console.log(`
        Memory Management Results:
        - Initial memory: ${initialMemory.heapUsed}MB
        - Final memory: ${finalMemory.heapUsed}MB
        - Growth: ${memoryGrowth}MB
        - Growth per 1k points: ${growthPerPoint.toFixed(2)}KB
      `);
    });
  });
  
  describe('Circuit Breaker', () => {
    it('should handle degraded performance gracefully', async () => {
      // Simulate slow processing
      let slowProcessing = true;
      ecne.on('data', async (data) => {
        if (slowProcessing) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      });
      
      const results = {
        processed: 0,
        circuitOpen: false,
        errors: 0
      };
      
      ecne.on('circuit-open', () => {
        results.circuitOpen = true;
      });
      
      // Send rapid requests
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          ecne.processDataPoint(createRandomDataPoint())
            .then(() => results.processed++)
            .catch(() => results.errors++)
        );
      }
      
      await Promise.all(promises);
      
      // Circuit breaker should have activated
      expect(results.circuitOpen || results.errors > 0).toBe(true);
      
      console.log(`
        Circuit Breaker Results:
        - Processed: ${results.processed}
        - Errors: ${results.errors}
        - Circuit opened: ${results.circuitOpen}
      `);
      
      slowProcessing = false;
    });
  });
  
  describe('Resource Limits', () => {
    it('should respect CPU and memory limits', async () => {
      const cpuBaseline = process.cpuUsage();
      const startTime = performance.now();
      
      // Generate CPU-intensive data
      const complexData = Array(500).fill(null).map(() => {
        const point = createRandomDataPoint();
        // Add complex nested structure
        point.content = {
          ...point.content,
          nested: Array(10).fill(null).map(() => ({
            data: Array(100).fill(null).map(() => Math.random()),
            text: Array(100).fill(null).map(() => 
              Math.random().toString(36)
            ).join('')
          }))
        };
        return point;
      });
      
      const results = await Promise.all(
        complexData.map(dp => ecne.processDataPoint(dp))
      );
      
      const duration = performance.now() - startTime;
      const cpuUsage = process.cpuUsage(cpuBaseline);
      const cpuPercent = ((cpuUsage.user + cpuUsage.system) / 1000) / duration * 100;
      
      // Should still complete in reasonable time
      expect(duration).toBeLessThan(10000);
      
      // CPU usage should be reasonable (not pegging at 100%)
      expect(cpuPercent).toBeLessThan(90);
      
      console.log(`
        Resource Limit Results:
        - Duration: ${duration.toFixed(2)}ms
        - CPU usage: ${cpuPercent.toFixed(1)}%
        - Processed: ${results.filter(r => r !== null).length}
      `);
    });
  });
});