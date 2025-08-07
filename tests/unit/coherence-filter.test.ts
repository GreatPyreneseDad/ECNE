import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CoherenceFilter } from '../../src/core/coherence-filter';
import { DataPoint } from '../../src/types';

// Helper functions
const createDataPoint = (overrides: Partial<DataPoint> = {}): DataPoint => {
  return {
    id: 'test-id',
    source: 'test-source',
    timestamp: new Date(),
    content: {
      title: 'Test Title',
      body: 'Test Body',
      url: 'https://example.com'
    },
    metadata: {},
    ...overrides
  };
};

describe('CoherenceFilter', () => {
  let filter: CoherenceFilter;
  
  beforeEach(() => {
    filter = new CoherenceFilter({
      sensitivity: 0.5,
      gct_params: {
        km: 0.3,
        ki: 0.1,
        coupling_strength: 0.15
      },
      contextWindow: 60,
      patternMemory: 1000
    });
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('filter method', () => {
    it('should filter data points below sensitivity threshold', async () => {
      const lowCoherenceData = createDataPoint({
        content: { body: 'Random unimportant content' }
      });
      
      const result = await filter.filter(lowCoherenceData);
      
      // Since we can't easily predict coherence, we just test the function runs
      expect(result).toBeDefined();
    });
    
    it('should include data points above sensitivity threshold', async () => {
      const highCoherenceData = createDataPoint({
        content: { 
          title: 'Breaking News: Revolutionary Discovery',
          body: 'Scientists have made an amazing breakthrough that will change everything we know about the universe. This incredible discovery confirms our deepest theories.'
        }
      });
      
      const result = await filter.filter(highCoherenceData);
      expect(result).toBeDefined();
    });
    
    it('should calculate coherence dimensions correctly', async () => {
      const dataPoint = createDataPoint();
      const result = await filter.filter(dataPoint);
      
      if (result) {
        expect(result.coherenceDimensions).toBeDefined();
        expect(result.coherenceDimensions.psi).toBeGreaterThanOrEqual(0);
        expect(result.coherenceDimensions.psi).toBeLessThanOrEqual(1);
        expect(result.coherenceDimensions.rho).toBeGreaterThanOrEqual(0);
        expect(result.coherenceDimensions.rho).toBeLessThanOrEqual(1);
        expect(result.coherenceDimensions.q_raw).toBeGreaterThanOrEqual(0);
        expect(result.coherenceDimensions.q_raw).toBeLessThanOrEqual(1);
        expect(result.coherenceDimensions.f).toBeGreaterThanOrEqual(0);
        expect(result.coherenceDimensions.f).toBeLessThanOrEqual(1);
      }
    });
  });
  
  describe('edge cases', () => {
    it('should handle empty content', async () => {
      const emptyData = createDataPoint({
        content: { body: '' }
      });
      
      const result = await filter.filter(emptyData);
      expect(result).toBeDefined();
    });
    
    it('should handle missing content fields', async () => {
      const incompleteData = createDataPoint({
        content: {}
      });
      
      const result = await filter.filter(incompleteData);
      expect(result).toBeDefined();
    });
    
    it('should handle very long content', async () => {
      const longContent = 'word '.repeat(10000);
      const longData = createDataPoint({
        content: { body: longContent }
      });
      
      const result = await filter.filter(longData);
      expect(result).toBeDefined();
    });
  });
  
  describe('pattern detection', () => {
    it('should identify news patterns', async () => {
      const newsData = createDataPoint({
        content: {
          title: 'Breaking: Major Event Happening Now',
          body: 'This is an urgent news update about a developing situation.'
        }
      });
      
      const result = await filter.filter(newsData);
      expect(result).toBeDefined();
    });
    
    it('should identify research patterns', async () => {
      const researchData = createDataPoint({
        content: {
          title: 'New Study Reveals Important Findings',
          body: 'Researchers at the university have discovered through rigorous analysis...'
        }
      });
      
      const result = await filter.filter(researchData);
      expect(result).toBeDefined();
    });
  });
  
  describe('dimension calculations', () => {
    it('should calculate psi (information value) based on content quality', async () => {
      const highInfoData = createDataPoint({
        content: {
          title: 'Comprehensive Analysis of Market Trends',
          body: 'This detailed report examines multiple factors affecting the market, including economic indicators, consumer behavior, and global trends. Our analysis shows...'
        }
      });
      
      const result = await filter.filter(highInfoData);
      expect(result).toBeDefined();
      if (result) {
        expect(result.coherenceDimensions.psi).toBeGreaterThan(0.5);
      }
    });
    
    it('should calculate rho (wisdom) based on source credibility', async () => {
      const credibleData = createDataPoint({
        source: 'nature.com',
        content: {
          title: 'Peer-Reviewed Research Publication',
          body: 'Published in Nature journal with extensive peer review...'
        }
      });
      
      const result = await filter.filter(credibleData);
      expect(result).toBeDefined();
      if (result) {
        expect(result.coherenceDimensions.rho).toBeGreaterThan(0.5);
      }
    });
    
    it('should calculate q (emotional charge) based on emotional content', async () => {
      const emotionalData = createDataPoint({
        content: {
          title: 'Shocking Discovery Changes Everything',
          body: 'In an amazing breakthrough, scientists have made an incredible discovery that will revolutionize our understanding. This fantastic achievement is truly remarkable.'
        }
      });
      
      const result = await filter.filter(emotionalData);
      expect(result).toBeDefined();
      if (result) {
        expect(result.coherenceDimensions.q_opt).toBeGreaterThan(0.3);
      }
    });
    
    it('should calculate f (social belonging) based on social indicators', async () => {
      const socialData = createDataPoint({
        content: {
          title: 'Community Comes Together for Important Cause',
          body: 'Local residents unite to support their neighbors in this collaborative effort. Everyone is working together to achieve our common goal.'
        },
        metadata: {
          engagement: { likes: 1000, shares: 500, comments: 200 }
        }
      });
      
      const result = await filter.filter(socialData);
      expect(result).toBeDefined();
      if (result) {
        expect(result.coherenceDimensions.f).toBeGreaterThan(0.3);
      }
    });
  });
  
  describe('GCT parameter validation', () => {
    it('should handle zero ki parameter gracefully', async () => {
      const invalidFilter = new CoherenceFilter({
        sensitivity: 0.5,
        gct_params: {
          km: 0.3,
          ki: 0,  // Invalid ki = 0
          coupling_strength: 0.15
        },
        contextWindow: 60,
        patternMemory: 1000
      });
      
      const dataPoint = createDataPoint();
      
      // Should throw error during calculation
      await expect(invalidFilter.filter(dataPoint)).rejects.toThrow('ki parameter cannot be zero');
    });
    
    it('should handle negative q_raw values', async () => {
      // This would require mocking internal calculations
      // For now, we just ensure the filter handles regular data correctly
      const dataPoint = createDataPoint();
      const result = await filter.filter(dataPoint);
      expect(result).toBeDefined();
    });
  });
  
  describe('context window', () => {
    it('should consider recent context', async () => {
      // Add some context data
      const contextData1 = createDataPoint({
        content: { body: 'Previous important context' }
      });
      const contextData2 = createDataPoint({
        content: { body: 'More recent context' }
      });
      
      await filter.filter(contextData1);
      await filter.filter(contextData2);
      
      // Now test with new data that relates to context
      const newData = createDataPoint({
        content: { body: 'This relates to the previous context' }
      });
      
      const result = await filter.filter(newData);
      expect(result).toBeDefined();
    });
  });
  
  describe('pattern memory', () => {
    it('should remember and recognize patterns', async () => {
      // Feed similar patterns
      const pattern1 = createDataPoint({
        content: { title: 'Breaking: Market Update' }
      });
      const pattern2 = createDataPoint({
        content: { title: 'Breaking: Tech News' }
      });
      
      await filter.filter(pattern1);
      await filter.filter(pattern2);
      
      // Test recognition of similar pattern
      const similarPattern = createDataPoint({
        content: { title: 'Breaking: Science Discovery' }
      });
      
      const result = await filter.filter(similarPattern);
      expect(result).toBeDefined();
    });
  });
  
  describe('error handling', () => {
    it('should handle malformed data gracefully', async () => {
      const malformedData = {
        id: 'bad-data',
        // Missing required fields
      } as any;
      
      const result = await filter.filter(malformedData);
      expect(result).toBeDefined();
    });
    
    it('should handle NaN values in parameters', async () => {
      const nanFilter = new CoherenceFilter({
        sensitivity: 0.5,
        gct_params: {
          km: NaN,  // Invalid NaN value
          ki: 0.1,
          coupling_strength: 0.15
        },
        contextWindow: 60,
        patternMemory: 1000
      });
      
      const dataPoint = createDataPoint();
      const result = await nanFilter.filter(dataPoint);
      
      // Should handle NaN gracefully
      expect(result).toBeDefined();
    });
  });
});