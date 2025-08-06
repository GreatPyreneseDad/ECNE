/**
 * Advanced Anomaly Detection for ECNE Data River
 * Implements multiple statistical and ML-based anomaly detection methods
 */

import { FilteredDataPoint } from '../core/coherence-filter';
import { EventEmitter } from 'events';

export interface AnomalyDetectorConfig {
  // Statistical thresholds
  zScoreThreshold: number;
  iqrMultiplier: number;
  
  // Isolation Forest parameters
  numTrees: number;
  sampleSize: number;
  
  // DBSCAN parameters
  epsilon: number;
  minPoints: number;
  
  // Time series parameters
  seasonalPeriod: number; // hours
  trendWindow: number; // data points
  
  // Ensemble voting
  minVotes: number; // minimum detectors to flag anomaly
}

export interface AnomalyScore {
  method: string;
  score: number;
  threshold: number;
  isAnomaly: boolean;
  details?: any;
}

export interface EnhancedAnomaly {
  id: string;
  dataPoint: FilteredDataPoint;
  timestamp: Date;
  scores: AnomalyScore[];
  overallScore: number;
  isAnomaly: boolean;
  anomalyType: 'point' | 'contextual' | 'collective';
  explanation: string;
}

export class AdvancedAnomalyDetector extends EventEmitter {
  private dataBuffer: FilteredDataPoint[] = [];
  private coherenceStats: Map<string, {
    values: number[];
    mean: number;
    std: number;
    median: number;
    q1: number;
    q3: number;
  }> = new Map();
  
  // Isolation Forest trees
  private isolationTrees: IsolationTree[] = [];
  
  // Time series decomposition
  private trendComponent: number[] = [];
  private seasonalComponent: number[] = [];
  private residuals: number[] = [];

  constructor(private config: AnomalyDetectorConfig) {
    super();
  }

  /**
   * Process new data point for anomaly detection
   */
  async detectAnomalies(dataPoint: FilteredDataPoint): Promise<EnhancedAnomaly | null> {
    // Add to buffer
    this.dataBuffer.push(dataPoint);
    if (this.dataBuffer.length > 10000) {
      this.dataBuffer.shift();
    }
    
    // Update statistics
    this.updateStatistics(dataPoint);
    
    // Run multiple anomaly detection methods
    const scores: AnomalyScore[] = [];
    
    // 1. Statistical methods
    scores.push(this.detectStatisticalAnomaly(dataPoint));
    scores.push(this.detectIQRAnomaly(dataPoint));
    scores.push(this.detectMADAnomaly(dataPoint));
    
    // 2. ML-based methods
    if (this.dataBuffer.length > 100) {
      scores.push(await this.detectIsolationForestAnomaly(dataPoint));
      scores.push(this.detectDBSCANAnomaly(dataPoint));
    }
    
    // 3. Time series methods
    if (this.dataBuffer.length > this.config.trendWindow) {
      scores.push(this.detectTimeSeriesAnomaly(dataPoint));
      scores.push(this.detectSeasonalAnomaly(dataPoint));
    }
    
    // 4. Coherence-specific methods
    scores.push(this.detectCoherenceDimensionAnomaly(dataPoint));
    scores.push(this.detectCoherencePatternAnomaly(dataPoint));
    
    // Ensemble voting
    const anomalyVotes = scores.filter(s => s.isAnomaly).length;
    const isAnomaly = anomalyVotes >= this.config.minVotes;
    
    // Calculate overall score
    const overallScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
    
    if (isAnomaly) {
      const anomaly: EnhancedAnomaly = {
        id: `anomaly-${Date.now()}-${dataPoint.id}`,
        dataPoint,
        timestamp: new Date(),
        scores,
        overallScore,
        isAnomaly,
        anomalyType: this.classifyAnomalyType(dataPoint, scores),
        explanation: this.generateExplanation(dataPoint, scores)
      };
      
      this.emit('anomaly-detected', anomaly);
      return anomaly;
    }
    
    return null;
  }

  /**
   * Statistical anomaly detection using Z-score
   */
  private detectStatisticalAnomaly(dataPoint: FilteredDataPoint): AnomalyScore {
    const stats = this.coherenceStats.get(dataPoint.source);
    if (!stats || stats.values.length < 30) {
      return {
        method: 'z-score',
        score: 0,
        threshold: this.config.zScoreThreshold,
        isAnomaly: false
      };
    }
    
    const zScore = Math.abs((dataPoint.coherenceScore - stats.mean) / stats.std);
    
    return {
      method: 'z-score',
      score: zScore / 10, // Normalize to 0-1 range
      threshold: this.config.zScoreThreshold,
      isAnomaly: zScore > this.config.zScoreThreshold,
      details: { zScore, mean: stats.mean, std: stats.std }
    };
  }

  /**
   * IQR-based anomaly detection
   */
  private detectIQRAnomaly(dataPoint: FilteredDataPoint): AnomalyScore {
    const stats = this.coherenceStats.get(dataPoint.source);
    if (!stats || stats.values.length < 30) {
      return {
        method: 'iqr',
        score: 0,
        threshold: this.config.iqrMultiplier,
        isAnomaly: false
      };
    }
    
    const iqr = stats.q3 - stats.q1;
    const lowerBound = stats.q1 - this.config.iqrMultiplier * iqr;
    const upperBound = stats.q3 + this.config.iqrMultiplier * iqr;
    
    const isOutlier = dataPoint.coherenceScore < lowerBound || dataPoint.coherenceScore > upperBound;
    const distance = Math.max(
      lowerBound - dataPoint.coherenceScore,
      dataPoint.coherenceScore - upperBound,
      0
    );
    
    return {
      method: 'iqr',
      score: Math.min(distance / iqr, 1),
      threshold: this.config.iqrMultiplier,
      isAnomaly: isOutlier,
      details: { iqr, lowerBound, upperBound }
    };
  }

  /**
   * Median Absolute Deviation (MAD) anomaly detection
   */
  private detectMADAnomaly(dataPoint: FilteredDataPoint): AnomalyScore {
    const stats = this.coherenceStats.get(dataPoint.source);
    if (!stats || stats.values.length < 30) {
      return {
        method: 'mad',
        score: 0,
        threshold: 3,
        isAnomaly: false
      };
    }
    
    // Calculate MAD
    const deviations = stats.values.map(v => Math.abs(v - stats.median));
    const mad = this.calculateMedian(deviations);
    
    if (mad === 0) {
      return {
        method: 'mad',
        score: 0,
        threshold: 3,
        isAnomaly: false
      };
    }
    
    const modifiedZScore = 0.6745 * (dataPoint.coherenceScore - stats.median) / mad;
    const absModifiedZ = Math.abs(modifiedZScore);
    
    return {
      method: 'mad',
      score: Math.min(absModifiedZ / 10, 1),
      threshold: 3,
      isAnomaly: absModifiedZ > 3,
      details: { mad, modifiedZScore, median: stats.median }
    };
  }

  /**
   * Isolation Forest anomaly detection
   */
  private async detectIsolationForestAnomaly(dataPoint: FilteredDataPoint): Promise<AnomalyScore> {
    // Build trees if needed
    if (this.isolationTrees.length < this.config.numTrees) {
      this.buildIsolationForest();
    }
    
    // Calculate anomaly score
    const pathLengths = this.isolationTrees.map(tree => 
      this.getPathLength(tree, this.extractFeatures(dataPoint))
    );
    
    const avgPathLength = pathLengths.reduce((a, b) => a + b) / pathLengths.length;
    const n = Math.min(this.dataBuffer.length, this.config.sampleSize);
    const c = 2 * Math.log(n - 1) - (2 * (n - 1) / n); // Average path length of BST
    
    const anomalyScore = Math.pow(2, -avgPathLength / c);
    
    return {
      method: 'isolation-forest',
      score: anomalyScore,
      threshold: 0.6,
      isAnomaly: anomalyScore > 0.6,
      details: { avgPathLength, numTrees: this.isolationTrees.length }
    };
  }

  /**
   * DBSCAN-based anomaly detection
   */
  private detectDBSCANAnomaly(dataPoint: FilteredDataPoint): AnomalyScore {
    const features = this.extractFeatures(dataPoint);
    const neighbors = this.findNeighbors(features, this.config.epsilon);
    
    const isNoise = neighbors.length < this.config.minPoints;
    const density = neighbors.length / this.dataBuffer.length;
    
    return {
      method: 'dbscan',
      score: isNoise ? 1 - density : 0,
      threshold: 0.5,
      isAnomaly: isNoise,
      details: { neighbors: neighbors.length, epsilon: this.config.epsilon }
    };
  }

  /**
   * Time series anomaly detection
   */
  private detectTimeSeriesAnomaly(dataPoint: FilteredDataPoint): AnomalyScore {
    // Decompose time series
    this.decomposeTimeSeries();
    
    // Get expected value from trend + seasonal
    const currentIdx = this.dataBuffer.length - 1;
    const expected = (this.trendComponent[currentIdx] || 0) + 
                    (this.seasonalComponent[currentIdx % this.config.seasonalPeriod] || 0);
    
    const residual = dataPoint.coherenceScore - expected;
    const residualStd = this.calculateStd(this.residuals);
    
    const score = residualStd > 0 ? Math.abs(residual) / (3 * residualStd) : 0;
    
    return {
      method: 'time-series',
      score: Math.min(score, 1),
      threshold: 0.8,
      isAnomaly: score > 0.8,
      details: { expected, residual, residualStd }
    };
  }

  /**
   * Seasonal pattern anomaly detection
   */
  private detectSeasonalAnomaly(dataPoint: FilteredDataPoint): AnomalyScore {
    const hour = new Date(dataPoint.timestamp).getHours();
    const dayOfWeek = new Date(dataPoint.timestamp).getDay();
    
    // Get historical data for same hour and day
    const historicalData = this.dataBuffer.filter(dp => {
      const dpHour = new Date(dp.timestamp).getHours();
      const dpDay = new Date(dp.timestamp).getDay();
      return dp.source === dataPoint.source && dpHour === hour && dpDay === dayOfWeek;
    });
    
    if (historicalData.length < 5) {
      return {
        method: 'seasonal',
        score: 0,
        threshold: 0.7,
        isAnomaly: false
      };
    }
    
    const values = historicalData.map(dp => dp.coherenceScore);
    const mean = values.reduce((a, b) => a + b) / values.length;
    const std = this.calculateStd(values);
    
    const deviation = Math.abs(dataPoint.coherenceScore - mean);
    const score = std > 0 ? deviation / (2 * std) : 0;
    
    return {
      method: 'seasonal',
      score: Math.min(score, 1),
      threshold: 0.7,
      isAnomaly: score > 0.7,
      details: { hour, dayOfWeek, historicalMean: mean, historicalStd: std }
    };
  }

  /**
   * Coherence dimension anomaly detection
   */
  private detectCoherenceDimensionAnomaly(dataPoint: FilteredDataPoint): AnomalyScore {
    const dims = dataPoint.coherenceDimensions;
    
    // Check for unusual dimension combinations
    const dimArray = [dims.psi, dims.rho, dims.q, dims.f];
    const mean = dimArray.reduce((a, b) => a + b) / 4;
    const variance = dimArray.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / 4;
    
    // High variance indicates unbalanced dimensions
    const imbalanceScore = Math.sqrt(variance);
    
    // Check for extreme values
    const hasExtreme = dimArray.some(d => d < 0.1 || d > 0.9);
    
    return {
      method: 'coherence-dimension',
      score: Math.max(imbalanceScore, hasExtreme ? 0.8 : 0),
      threshold: 0.6,
      isAnomaly: imbalanceScore > 0.6 || hasExtreme,
      details: { dimensions: dims, imbalanceScore, hasExtreme }
    };
  }

  /**
   * Pattern-based coherence anomaly detection
   */
  private detectCoherencePatternAnomaly(dataPoint: FilteredDataPoint): AnomalyScore {
    // Get recent pattern for this source
    const recentData = this.dataBuffer
      .filter(dp => dp.source === dataPoint.source)
      .slice(-20);
    
    if (recentData.length < 10) {
      return {
        method: 'coherence-pattern',
        score: 0,
        threshold: 0.7,
        isAnomaly: false
      };
    }
    
    // Calculate pattern similarity
    const patterns = recentData.map(dp => this.getDimensionPattern(dp.coherenceDimensions));
    const currentPattern = this.getDimensionPattern(dataPoint.coherenceDimensions);
    
    const patternCounts = new Map<string, number>();
    patterns.forEach(p => patternCounts.set(p, (patternCounts.get(p) || 0) + 1));
    
    const currentCount = patternCounts.get(currentPattern) || 0;
    const rarity = 1 - (currentCount / patterns.length);
    
    return {
      method: 'coherence-pattern',
      score: rarity,
      threshold: 0.7,
      isAnomaly: rarity > 0.7,
      details: { pattern: currentPattern, frequency: currentCount / patterns.length }
    };
  }

  /**
   * Extract features for ML algorithms
   */
  private extractFeatures(dataPoint: FilteredDataPoint): number[] {
    const hour = new Date(dataPoint.timestamp).getHours();
    const dayOfWeek = new Date(dataPoint.timestamp).getDay();
    
    return [
      dataPoint.coherenceScore,
      dataPoint.coherenceDimensions.psi,
      dataPoint.coherenceDimensions.rho,
      dataPoint.coherenceDimensions.q,
      dataPoint.coherenceDimensions.f,
      hour / 24, // Normalize
      dayOfWeek / 7 // Normalize
    ];
  }

  /**
   * Build Isolation Forest
   */
  private buildIsolationForest(): void {
    this.isolationTrees = [];
    
    for (let i = 0; i < this.config.numTrees; i++) {
      const sample = this.randomSample(
        this.dataBuffer,
        Math.min(this.config.sampleSize, this.dataBuffer.length)
      );
      
      const features = sample.map(dp => this.extractFeatures(dp));
      const tree = this.buildIsolationTree(features, 0);
      this.isolationTrees.push(tree);
    }
  }

  /**
   * Build single isolation tree
   */
  private buildIsolationTree(data: number[][], depth: number): IsolationTree {
    if (data.length <= 1 || depth > 10) {
      return { isLeaf: true, size: data.length };
    }
    
    // Random feature and split value
    const featureIdx = Math.floor(Math.random() * data[0].length);
    const values = data.map(d => d[featureIdx]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    if (min === max) {
      return { isLeaf: true, size: data.length };
    }
    
    const splitValue = min + Math.random() * (max - min);
    
    const left = data.filter(d => d[featureIdx] < splitValue);
    const right = data.filter(d => d[featureIdx] >= splitValue);
    
    return {
      isLeaf: false,
      featureIdx,
      splitValue,
      left: this.buildIsolationTree(left, depth + 1),
      right: this.buildIsolationTree(right, depth + 1)
    };
  }

  /**
   * Get path length in isolation tree
   */
  private getPathLength(tree: IsolationTree, features: number[], depth: number = 0): number {
    if (tree.isLeaf) {
      return depth + this.c(tree.size);
    }
    
    if (features[tree.featureIdx!] < tree.splitValue!) {
      return this.getPathLength(tree.left!, features, depth + 1);
    } else {
      return this.getPathLength(tree.right!, features, depth + 1);
    }
  }

  /**
   * Average path length of unsuccessful search in BST
   */
  private c(n: number): number {
    if (n <= 1) return 0;
    return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1) / n);
  }

  /**
   * Find neighbors within epsilon distance
   */
  private findNeighbors(features: number[], epsilon: number): FilteredDataPoint[] {
    return this.dataBuffer.filter(dp => {
      const dpFeatures = this.extractFeatures(dp);
      const distance = this.euclideanDistance(features, dpFeatures);
      return distance <= epsilon;
    });
  }

  /**
   * Calculate Euclidean distance
   */
  private euclideanDistance(a: number[], b: number[]): number {
    return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0));
  }

  /**
   * Decompose time series using simple moving averages
   */
  private decomposeTimeSeries(): void {
    const values = this.dataBuffer.map(dp => dp.coherenceScore);
    
    // Calculate trend using moving average
    this.trendComponent = this.movingAverage(values, this.config.trendWindow);
    
    // Calculate seasonal component
    const detrended = values.map((v, i) => v - (this.trendComponent[i] || v));
    this.seasonalComponent = this.extractSeasonalPattern(detrended);
    
    // Calculate residuals
    this.residuals = values.map((v, i) => 
      v - (this.trendComponent[i] || 0) - (this.seasonalComponent[i % this.config.seasonalPeriod] || 0)
    );
  }

  /**
   * Calculate moving average
   */
  private movingAverage(values: number[], window: number): number[] {
    const result: number[] = [];
    
    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - Math.floor(window / 2));
      const end = Math.min(values.length, i + Math.floor(window / 2) + 1);
      const subset = values.slice(start, end);
      result.push(subset.reduce((a, b) => a + b) / subset.length);
    }
    
    return result;
  }

  /**
   * Extract seasonal pattern
   */
  private extractSeasonalPattern(detrended: number[]): number[] {
    const pattern: number[] = new Array(this.config.seasonalPeriod).fill(0);
    const counts: number[] = new Array(this.config.seasonalPeriod).fill(0);
    
    detrended.forEach((value, i) => {
      const seasonIdx = i % this.config.seasonalPeriod;
      pattern[seasonIdx] += value;
      counts[seasonIdx]++;
    });
    
    return pattern.map((sum, i) => counts[i] > 0 ? sum / counts[i] : 0);
  }

  /**
   * Get dimension pattern string
   */
  private getDimensionPattern(dims: any): string {
    const categorize = (v: number): string => {
      if (v > 0.7) return 'H';
      if (v > 0.3) return 'M';
      return 'L';
    };
    
    return [dims.psi, dims.rho, dims.q, dims.f].map(categorize).join('');
  }

  /**
   * Classify anomaly type
   */
  private classifyAnomalyType(dataPoint: FilteredDataPoint, scores: AnomalyScore[]): 'point' | 'contextual' | 'collective' {
    const statisticalAnomalies = scores.filter(s => 
      ['z-score', 'iqr', 'mad'].includes(s.method) && s.isAnomaly
    ).length;
    
    const contextualAnomalies = scores.filter(s => 
      ['time-series', 'seasonal'].includes(s.method) && s.isAnomaly
    ).length;
    
    const collectiveAnomalies = scores.filter(s => 
      ['dbscan', 'coherence-pattern'].includes(s.method) && s.isAnomaly
    ).length;
    
    if (collectiveAnomalies > 0) return 'collective';
    if (contextualAnomalies > statisticalAnomalies) return 'contextual';
    return 'point';
  }

  /**
   * Generate human-readable explanation
   */
  private generateExplanation(dataPoint: FilteredDataPoint, scores: AnomalyScore[]): string {
    const anomalousScores = scores.filter(s => s.isAnomaly);
    const explanations: string[] = [];
    
    anomalousScores.forEach(score => {
      switch (score.method) {
        case 'z-score':
          explanations.push(`Coherence score is ${score.details.zScore.toFixed(2)} standard deviations from mean`);
          break;
        case 'iqr':
          explanations.push(`Value falls outside the interquartile range by ${(score.score * 100).toFixed(0)}%`);
          break;
        case 'isolation-forest':
          explanations.push(`Data point is isolated from normal patterns (anomaly score: ${score.score.toFixed(2)})`);
          break;
        case 'time-series':
          explanations.push(`Unexpected deviation from time series trend (residual: ${score.details.residual.toFixed(3)})`);
          break;
        case 'seasonal':
          explanations.push(`Unusual pattern for ${score.details.hour}:00 on day ${score.details.dayOfWeek}`);
          break;
        case 'coherence-dimension':
          explanations.push(`Unusual coherence dimension balance${score.details.hasExtreme ? ' with extreme values' : ''}`);
          break;
        case 'coherence-pattern':
          explanations.push(`Rare coherence pattern '${score.details.pattern}' (frequency: ${(score.details.frequency * 100).toFixed(0)}%)`);
          break;
      }
    });
    
    return explanations.join('; ');
  }

  /**
   * Update statistics for a source
   */
  private updateStatistics(dataPoint: FilteredDataPoint): void {
    let stats = this.coherenceStats.get(dataPoint.source);
    
    if (!stats) {
      stats = {
        values: [],
        mean: 0,
        std: 0,
        median: 0,
        q1: 0,
        q3: 0
      };
      this.coherenceStats.set(dataPoint.source, stats);
    }
    
    stats.values.push(dataPoint.coherenceScore);
    if (stats.values.length > 1000) {
      stats.values.shift();
    }
    
    // Update statistics
    stats.mean = stats.values.reduce((a, b) => a + b) / stats.values.length;
    stats.std = this.calculateStd(stats.values);
    
    const sorted = [...stats.values].sort((a, b) => a - b);
    stats.median = this.calculateMedian(sorted);
    stats.q1 = sorted[Math.floor(sorted.length * 0.25)];
    stats.q3 = sorted[Math.floor(sorted.length * 0.75)];
  }

  /**
   * Calculate standard deviation
   */
  private calculateStd(values: number[]): number {
    const mean = values.reduce((a, b) => a + b) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Calculate median
   */
  private calculateMedian(sortedValues: number[]): number {
    const mid = Math.floor(sortedValues.length / 2);
    return sortedValues.length % 2 === 0
      ? (sortedValues[mid - 1] + sortedValues[mid]) / 2
      : sortedValues[mid];
  }

  /**
   * Random sample from array
   */
  private randomSample<T>(array: T[], size: number): T[] {
    const shuffled = [...array].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, size);
  }

  /**
   * Get detection statistics
   */
  getStatistics(): any {
    const sourceStats: any = {};
    
    this.coherenceStats.forEach((stats, source) => {
      sourceStats[source] = {
        dataPoints: stats.values.length,
        mean: stats.mean,
        std: stats.std,
        median: stats.median,
        q1: stats.q1,
        q3: stats.q3
      };
    });
    
    return {
      totalDataPoints: this.dataBuffer.length,
      sources: sourceStats,
      isolationForestTrees: this.isolationTrees.length,
      timeSeriesLength: this.trendComponent.length
    };
  }
}

interface IsolationTree {
  isLeaf: boolean;
  size: number;
  featureIdx?: number;
  splitValue?: number;
  left?: IsolationTree;
  right?: IsolationTree;
}