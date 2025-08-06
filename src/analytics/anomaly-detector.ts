/**
 * Anomaly Detection for Coherence Scores
 * Uses statistical methods to identify unusual patterns
 */

export interface AnomalyResult {
  isAnomaly: boolean;
  score: number;
  deviation: number;
  reason: string;
}

export class CoherenceAnomalyDetector {
  private history: number[] = [];
  private readonly windowSize: number;
  private readonly zScoreThreshold: number;
  
  constructor(windowSize: number = 100, zScoreThreshold: number = 3) {
    this.windowSize = windowSize;
    this.zScoreThreshold = zScoreThreshold;
  }

  /**
   * Detect if a coherence score is anomalous
   */
  detect(coherenceScore: number): AnomalyResult {
    // Add to history
    this.history.push(coherenceScore);
    if (this.history.length > this.windowSize) {
      this.history.shift();
    }

    // Need minimum samples
    if (this.history.length < 10) {
      return {
        isAnomaly: false,
        score: coherenceScore,
        deviation: 0,
        reason: 'Insufficient data'
      };
    }

    // Calculate statistics
    const mean = this.calculateMean();
    const stdDev = this.calculateStdDev(mean);
    const zScore = Math.abs((coherenceScore - mean) / stdDev);

    // Detect anomaly
    const isAnomaly = zScore > this.zScoreThreshold;
    
    return {
      isAnomaly,
      score: coherenceScore,
      deviation: zScore,
      reason: isAnomaly 
        ? `Z-score ${zScore.toFixed(2)} exceeds threshold ${this.zScoreThreshold}`
        : 'Within normal range'
    };
  }

  /**
   * Calculate moving average
   */
  getMovingAverage(period: number = 10): number {
    if (this.history.length === 0) return 0;
    const recent = this.history.slice(-period);
    return recent.reduce((sum, val) => sum + val, 0) / recent.length;
  }

  /**
   * Detect trend direction
   */
  getTrend(period: number = 20): 'increasing' | 'decreasing' | 'stable' {
    if (this.history.length < period) return 'stable';
    
    const recent = this.history.slice(-period);
    const firstHalf = recent.slice(0, period / 2);
    const secondHalf = recent.slice(period / 2);
    
    const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
    
    const difference = secondAvg - firstAvg;
    if (Math.abs(difference) < 0.05) return 'stable';
    return difference > 0 ? 'increasing' : 'decreasing';
  }

  private calculateMean(): number {
    return this.history.reduce((sum, val) => sum + val, 0) / this.history.length;
  }

  private calculateStdDev(mean: number): number {
    const variance = this.history.reduce((sum, val) => 
      sum + Math.pow(val - mean, 2), 0
    ) / this.history.length;
    return Math.sqrt(variance);
  }
}

/**
 * Multi-dimensional anomaly detection
 */
export class DimensionalAnomalyDetector {
  private detectors: Map<string, CoherenceAnomalyDetector> = new Map();
  
  constructor() {
    // Initialize detectors for each dimension
    ['psi', 'rho', 'q', 'f'].forEach(dim => {
      this.detectors.set(dim, new CoherenceAnomalyDetector());
    });
  }

  /**
   * Detect anomalies across all dimensions
   */
  detectMultiDimensional(dimensions: {
    psi: number;
    rho: number;
    q: number;
    f: number;
  }): Map<string, AnomalyResult> {
    const results = new Map<string, AnomalyResult>();
    
    Object.entries(dimensions).forEach(([dim, value]) => {
      const detector = this.detectors.get(dim);
      if (detector) {
        results.set(dim, detector.detect(value));
      }
    });
    
    return results;
  }

  /**
   * Get correlation between dimensions
   */
  getDimensionCorrelation(): number[][] {
    // Simple correlation matrix
    const dims = ['psi', 'rho', 'q', 'f'];
    const matrix: number[][] = [];
    
    for (let i = 0; i < dims.length; i++) {
      matrix[i] = [];
      for (let j = 0; j < dims.length; j++) {
        if (i === j) {
          matrix[i][j] = 1;
        } else {
          // Simplified correlation calculation
          matrix[i][j] = 0; // Would implement Pearson correlation
        }
      }
    }
    
    return matrix;
  }
}