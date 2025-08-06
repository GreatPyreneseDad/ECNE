import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { CoherenceFilter } from '../../src/core/coherence-filter';
import { DataPoint, FilteredDataPoint, CoherenceDimensions } from '../../src/types';
import { StorageAdapter } from '../../src/storage/storage-adapter';

// Helper functions
const createDataPoint = (overrides: Partial<DataPoint> = {}): DataPoint => {
  return {
    id: `test-${Date.now()}-${Math.random()}`,
    source: 'test-api',
    timestamp: new Date(),
    content: { test: true, value: Math.random() },
    ...overrides
  };
};

const createMockStorage = (): jest.Mocked<StorageAdapter> => {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    store: jest.fn().mockResolvedValue(undefined),
    storeBatch: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    delete: jest.fn().mockResolvedValue(true),
    deleteMany: jest.fn().mockResolvedValue(0),
    getHealth: jest.fn().mockResolvedValue({
      connected: true,
      latency: 0,
      storedCount: 0
    }),
    clear: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn().mockResolvedValue(false),
    getById: jest.fn().mockResolvedValue(null),
    getLatest: jest.fn().mockResolvedValue([]),
    getBySource: jest.fn().mockResolvedValue([]),
    getByCoherenceRange: jest.fn().mockResolvedValue([])
  } as any;
};

describe('CoherenceFilter', () => {
  let filter: CoherenceFilter;
  let mockStorage: jest.Mocked<StorageAdapter>;
  
  beforeEach(() => {
    mockStorage = createMockStorage();
    filter = new CoherenceFilter({
      sensitivity: 0.5,
      weights: { psi: 0.25, rho: 0.25, q: 0.25, f: 0.25 }
    });
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('filter method', () => {
    it('should filter data points below sensitivity threshold', async () => {
      const lowCoherenceData = createDataPoint({
        content: { random: 'noise', value: Math.random() }
      });
      
      // Mock low coherence calculation
      jest.spyOn(filter as any, 'calculateCoherence').mockResolvedValue({
        psi: 0.1,
        rho: 0.1,
        q: 0.1,
        f: 0.1
      });
      
      const result = await filter.filter(lowCoherenceData);
      expect(result).toBeNull();
    });
    
    it('should pass data points above sensitivity threshold', async () => {
      const highCoherenceData = createDataPoint({
        content: {
          category: 'technology',
          relevance: 'high',
          timestamp: new Date()
        }
      });
      
      // Mock high coherence calculation
      jest.spyOn(filter as any, 'calculateCoherence').mockResolvedValue({
        psi: 0.8,
        rho: 0.7,
        q: 0.6,
        f: 0.7
      });
      
      const result = await filter.filter(highCoherenceData);
      expect(result).toBeDefined();
      expect(result?.coherenceScore).toBeGreaterThan(0.5);
      expect(result?.id).toBe(highCoherenceData.id);
    });
    
    it('should handle malformed input gracefully', async () => {
      const malformedInputs = [
        null,
        undefined,
        {},
        { source: 'test' }, // missing required fields
        { content: null, timestamp: 'invalid' },
        { id: 123, source: [], timestamp: {} } // wrong types
      ];
      
      for (const input of malformedInputs) {
        await expect(filter.filter(input as any)).resolves.not.toThrow();
        const result = await filter.filter(input as any);
        expect(result).toBeNull();
      }
    });
    
    it('should include coherence dimensions in filtered result', async () => {
      const dataPoint = createDataPoint();
      const expectedDimensions: CoherenceDimensions = {
        psi: 0.8,
        rho: 0.7,
        q: 0.6,
        f: 0.9
      };
      
      jest.spyOn(filter as any, 'calculateCoherence').mockResolvedValue(expectedDimensions);
      
      const result = await filter.filter(dataPoint);
      expect(result?.coherenceDimensions).toEqual(expectedDimensions);
    });
  });
  
  describe('dimension calculations', () => {
    it('should calculate psi (internal consistency) correctly', async () => {
      const consistentData = [
        createDataPoint({ source: 'api1', content: { type: 'article', category: 'tech' } }),
        createDataPoint({ source: 'api1', content: { type: 'article', category: 'tech' } }),
        createDataPoint({ source: 'api1', content: { type: 'article', category: 'tech' } })
      ];
      
      // Process consistent data to build context
      for (const data of consistentData.slice(0, 2)) {
        await filter.filter(data);
      }
      
      // The third point should have high psi
      const result = await filter.filter(consistentData[2]);
      expect(result).toBeDefined();
      if (result) {
        expect(result.coherenceDimensions.psi).toBeGreaterThan(0.5);
      }
    });
    
    it('should calculate rho (accumulated wisdom) based on patterns', async () => {
      // Create data with repeated patterns
      const patternData = Array(10).fill(null).map(() => 
        createDataPoint({
          source: 'news-api',
          content: { 
            category: 'technology',
            topic: 'ai',
            sentiment: 'positive'
          }
        })
      );
      
      // Process pattern data
      for (const data of patternData) {
        await filter.filter(data);
      }
      
      // New data with same pattern should have high rho
      const samePatternData = createDataPoint({
        source: 'news-api',
        content: {
          category: 'technology',
          topic: 'ai',
          sentiment: 'positive'
        }
      });
      
      const result = await filter.filter(samePatternData);
      expect(result).toBeDefined();
      if (result) {
        expect(result.coherenceDimensions.rho).toBeGreaterThan(0.5);
      }
    });
    
    it('should calculate q (moral activation) based on keywords', async () => {
      const moralData = createDataPoint({
        content: {
          title: 'Ethics in AI development',
          description: 'Justice and fairness in machine learning',
          tags: ['ethics', 'moral', 'justice', 'fairness']
        }
      });
      
      const result = await filter.filter(moralData);
      expect(result).toBeDefined();
      if (result) {
        expect(result.coherenceDimensions.q).toBeGreaterThan(0.3);
      }
    });
    
    it('should calculate f (social belonging) based on social indicators', async () => {
      const socialData = createDataPoint({
        content: {
          title: 'Community collaboration project',
          engagement: { likes: 1000, shares: 500, comments: 200 },
          tags: ['community', 'together', 'collaboration']
        },
        metadata: {
          social_engagement: true
        }
      });
      
      const result = await filter.filter(socialData);
      expect(result).toBeDefined();
      if (result) {
        expect(result.coherenceDimensions.f).toBeGreaterThan(0.4);
      }
    });
  });
  
  describe('weight calculations', () => {
    it('should apply custom weights correctly', async () => {
      const customFilter = new CoherenceFilter({
        sensitivity: 0.5,
        weights: { psi: 0.7, rho: 0.1, q: 0.1, f: 0.1 }
      });
      
      const dataPoint = createDataPoint();
      
      // Mock dimension values
      jest.spyOn(customFilter as any, 'calculateCoherence').mockResolvedValue({
        psi: 0.8, // High internal consistency
        rho: 0.2,
        q: 0.2,
        f: 0.2
      });
      
      const result = await customFilter.filter(dataPoint);
      expect(result).toBeDefined();
      
      // With heavy psi weight (0.7), score should be high
      const expectedScore = 0.8 * 0.7 + 0.2 * 0.1 + 0.2 * 0.1 + 0.2 * 0.1;
      expect(result?.coherenceScore).toBeCloseTo(expectedScore, 2);
    });
    
    it('should validate weights sum to 1', () => {
      expect(() => {
        new CoherenceFilter({
          sensitivity: 0.5,
          weights: { psi: 0.5, rho: 0.5, q: 0.5, f: 0.5 } // Sum = 2
        });
      }).toThrow();
    });
  });
  
  describe('context window', () => {
    it('should maintain context window size limit', async () => {
      const filter = new CoherenceFilter({
        sensitivity: 0.5,
        weights: { psi: 0.25, rho: 0.25, q: 0.25, f: 0.25 },
        contextWindowSize: 10
      });
      
      // Add more than window size
      for (let i = 0; i < 20; i++) {
        await filter.filter(createDataPoint());
      }
      
      // Check context size
      const context = (filter as any).contextBuffer;
      expect(context.length).toBeLessThanOrEqual(10);
    });
  });
  
  describe('error handling', () => {
    it('should handle calculation errors gracefully', async () => {
      jest.spyOn(filter as any, 'calculateCoherence').mockRejectedValue(
        new Error('Calculation error')
      );
      
      const result = await filter.filter(createDataPoint());
      expect(result).toBeNull();
    });
    
    it('should handle invalid weights gracefully', async () => {
      const filter = new CoherenceFilter({
        sensitivity: 0.5,
        weights: { psi: NaN, rho: 0.25, q: 0.25, f: 0.25 } as any
      });
      
      const result = await filter.filter(createDataPoint());
      expect(result).toBeNull();
    });
  });
  
  describe('performance', () => {
    it('should process multiple data points efficiently', async () => {
      const dataPoints = Array(100).fill(null).map(() => createDataPoint());
      
      const startTime = Date.now();
      const results = await Promise.all(
        dataPoints.map(dp => filter.filter(dp))
      );
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(1000); // Should process 100 points in under 1 second
      expect(results.filter(r => r !== null).length).toBeGreaterThan(0);
    });
  });
});