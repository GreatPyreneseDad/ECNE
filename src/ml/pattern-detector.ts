/**
 * Machine Learning Pattern Detection for ECNE
 * Implements pattern recognition and anomaly detection
 */

import { FilteredDataPoint } from '../core/coherence-filter';
import { EventEmitter } from 'events';

export interface Pattern {
  id: string;
  signature: string;
  frequency: number;
  avgCoherence: number;
  lastSeen: Date;
  features: Record<string, any>;
  cluster?: number;
}

export interface Anomaly {
  id: string;
  dataPoint: FilteredDataPoint;
  anomalyScore: number;
  type: 'statistical' | 'pattern' | 'coherence' | 'temporal';
  description: string;
  timestamp: Date;
}

export interface PatternDetectorConfig {
  minPatternFrequency: number;
  anomalyThreshold: number;
  clusteringEnabled: boolean;
  maxPatterns: number;
  timeWindowHours: number;
}

export class PatternDetector extends EventEmitter {
  private patterns: Map<string, Pattern> = new Map();
  private dataHistory: FilteredDataPoint[] = [];
  private coherenceHistory: number[] = [];
  private anomalies: Anomaly[] = [];
  
  // Statistical tracking
  private stats = {
    mean: 0,
    stdDev: 0,
    median: 0,
    mad: 0, // Median Absolute Deviation
    percentiles: new Map<number, number>()
  };

  constructor(private config: PatternDetectorConfig) {
    super();
  }

  /**
   * Process a new data point for pattern detection
   */
  async processDataPoint(dataPoint: FilteredDataPoint): Promise<void> {
    // Add to history
    this.dataHistory.push(dataPoint);
    this.coherenceHistory.push(dataPoint.coherenceScore);
    
    // Maintain window
    const cutoff = new Date(Date.now() - this.config.timeWindowHours * 60 * 60 * 1000);
    this.dataHistory = this.dataHistory.filter(dp => dp.timestamp > cutoff);
    this.coherenceHistory = this.coherenceHistory.slice(-1000); // Keep last 1000 for stats
    
    // Update statistics
    this.updateStatistics();
    
    // Extract and update patterns
    const pattern = this.extractPattern(dataPoint);
    this.updatePattern(pattern, dataPoint);
    
    // Detect anomalies
    const anomalies = await this.detectAnomalies(dataPoint);
    if (anomalies.length > 0) {
      this.anomalies.push(...anomalies);
      anomalies.forEach(anomaly => {
        this.emit('anomaly-detected', anomaly);
      });
    }
    
    // Perform clustering if enabled
    if (this.config.clusteringEnabled && this.patterns.size > 10) {
      this.performClustering();
    }
    
    // Clean up old patterns
    this.cleanupPatterns();
  }

  /**
   * Extract pattern signature from data point
   */
  private extractPattern(dataPoint: FilteredDataPoint): Pattern {
    // Create feature vector
    const features: Record<string, any> = {
      source: dataPoint.source,
      contentKeys: Object.keys(dataPoint.content || {}).sort().join(','),
      coherenceBucket: Math.floor(dataPoint.coherenceScore * 10) / 10,
      dimensionProfile: this.getDimensionProfile(dataPoint.coherenceDimensions),
      hour: new Date(dataPoint.timestamp).getHours(),
      dayOfWeek: new Date(dataPoint.timestamp).getDay()
    };
    
    // Generate signature
    const signature = this.generateSignature(features);
    
    return {
      id: `pattern-${signature}`,
      signature,
      frequency: 0,
      avgCoherence: dataPoint.coherenceScore,
      lastSeen: dataPoint.timestamp,
      features
    };
  }

  /**
   * Generate signature from features
   */
  private generateSignature(features: Record<string, any>): string {
    const parts = [
      features.source,
      features.contentKeys,
      features.coherenceBucket,
      features.dimensionProfile
    ];
    return parts.join(':');
  }

  /**
   * Get dimension profile (high/medium/low for each dimension)
   */
  private getDimensionProfile(dimensions: any): string {
    const profile: string[] = [];
    
    const categorize = (value: number): string => {
      if (value > 0.7) return 'H';
      if (value > 0.3) return 'M';
      return 'L';
    };
    
    profile.push(categorize(dimensions.psi));
    profile.push(categorize(dimensions.rho));
    profile.push(categorize(dimensions.q));
    profile.push(categorize(dimensions.f));
    
    return profile.join('');
  }

  /**
   * Update pattern with new occurrence
   */
  private updatePattern(pattern: Pattern, dataPoint: FilteredDataPoint): void {
    const existing = this.patterns.get(pattern.signature);
    
    if (existing) {
      existing.frequency++;
      existing.avgCoherence = (existing.avgCoherence * (existing.frequency - 1) + dataPoint.coherenceScore) / existing.frequency;
      existing.lastSeen = dataPoint.timestamp;
    } else {
      pattern.frequency = 1;
      this.patterns.set(pattern.signature, pattern);
    }
    
    // Emit pattern update
    this.emit('pattern-updated', pattern);
  }

  /**
   * Detect anomalies in the data point
   */
  private async detectAnomalies(dataPoint: FilteredDataPoint): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];
    
    // Statistical anomaly detection (coherence score)
    const zScore = this.calculateZScore(dataPoint.coherenceScore);
    if (Math.abs(zScore) > 3) {
      anomalies.push({
        id: `anomaly-${Date.now()}-stat`,
        dataPoint,
        anomalyScore: Math.abs(zScore) / 10, // Normalize to 0-1
        type: 'statistical',
        description: `Coherence score ${zScore > 0 ? 'unusually high' : 'unusually low'} (z-score: ${zScore.toFixed(2)})`,
        timestamp: new Date()
      });
    }
    
    // Pattern-based anomaly detection
    const patternAnomaly = this.detectPatternAnomaly(dataPoint);
    if (patternAnomaly) {
      anomalies.push(patternAnomaly);
    }
    
    // Coherence dimension anomaly
    const dimensionAnomaly = this.detectDimensionAnomaly(dataPoint);
    if (dimensionAnomaly) {
      anomalies.push(dimensionAnomaly);
    }
    
    // Temporal anomaly detection
    const temporalAnomaly = this.detectTemporalAnomaly(dataPoint);
    if (temporalAnomaly) {
      anomalies.push(temporalAnomaly);
    }
    
    return anomalies;
  }

  /**
   * Calculate Z-score for anomaly detection
   */
  private calculateZScore(value: number): number {
    if (this.stats.stdDev === 0) return 0;
    return (value - this.stats.mean) / this.stats.stdDev;
  }

  /**
   * Detect pattern-based anomalies
   */
  private detectPatternAnomaly(dataPoint: FilteredDataPoint): Anomaly | null {
    const pattern = this.extractPattern(dataPoint);
    const existing = this.patterns.get(pattern.signature);
    
    // Check if this is a rare pattern
    if (!existing || existing.frequency < this.config.minPatternFrequency) {
      // Check if similar patterns exist
      const similarPatterns = this.findSimilarPatterns(pattern);
      
      if (similarPatterns.length === 0) {
        return {
          id: `anomaly-${Date.now()}-pattern`,
          dataPoint,
          anomalyScore: 0.8,
          type: 'pattern',
          description: 'Rare or unique pattern detected',
          timestamp: new Date()
        };
      }
    }
    
    return null;
  }

  /**
   * Detect coherence dimension anomalies
   */
  private detectDimensionAnomaly(dataPoint: FilteredDataPoint): Anomaly | null {
    const dimensions = dataPoint.coherenceDimensions;
    const profile = this.getDimensionProfile(dimensions);
    
    // Check for unusual dimension combinations
    const unusualCombinations = ['HLLL', 'LLLH', 'HHLL', 'LLHH'];
    
    if (unusualCombinations.includes(profile)) {
      return {
        id: `anomaly-${Date.now()}-dimension`,
        dataPoint,
        anomalyScore: 0.6,
        type: 'coherence',
        description: `Unusual coherence dimension profile: ${profile}`,
        timestamp: new Date()
      };
    }
    
    return null;
  }

  /**
   * Detect temporal anomalies
   */
  private detectTemporalAnomaly(dataPoint: FilteredDataPoint): Anomaly | null {
    const hour = new Date(dataPoint.timestamp).getHours();
    const source = dataPoint.source;
    
    // Get typical activity pattern for this source
    const sourceData = this.dataHistory.filter(dp => dp.source === source);
    const hourlyActivity = new Array(24).fill(0);
    
    sourceData.forEach(dp => {
      const h = new Date(dp.timestamp).getHours();
      hourlyActivity[h]++;
    });
    
    const avgActivity = hourlyActivity.reduce((a, b) => a + b) / 24;
    const currentActivity = hourlyActivity[hour];
    
    // Check if current hour is unusual for this source
    if (currentActivity < avgActivity * 0.1 && sourceData.length > 100) {
      return {
        id: `anomaly-${Date.now()}-temporal`,
        dataPoint,
        anomalyScore: 0.5,
        type: 'temporal',
        description: `Unusual activity time for source ${source} at hour ${hour}`,
        timestamp: new Date()
      };
    }
    
    return null;
  }

  /**
   * Find similar patterns using simple distance metric
   */
  private findSimilarPatterns(pattern: Pattern): Pattern[] {
    const similar: Pattern[] = [];
    
    for (const [signature, existing] of this.patterns) {
      if (signature === pattern.signature) continue;
      
      const similarity = this.calculatePatternSimilarity(pattern, existing);
      if (similarity > 0.8) {
        similar.push(existing);
      }
    }
    
    return similar;
  }

  /**
   * Calculate similarity between two patterns
   */
  private calculatePatternSimilarity(a: Pattern, b: Pattern): number {
    let similarity = 0;
    let factors = 0;
    
    // Source similarity
    if (a.features.source === b.features.source) {
      similarity += 0.3;
    }
    factors++;
    
    // Content structure similarity
    const aKeys = a.features.contentKeys.split(',');
    const bKeys = b.features.contentKeys.split(',');
    const intersection = aKeys.filter(k => bKeys.includes(k)).length;
    const union = new Set([...aKeys, ...bKeys]).size;
    
    if (union > 0) {
      similarity += 0.3 * (intersection / union);
    }
    factors++;
    
    // Coherence profile similarity
    if (a.features.dimensionProfile === b.features.dimensionProfile) {
      similarity += 0.2;
    }
    factors++;
    
    // Temporal similarity
    if (Math.abs(a.features.hour - b.features.hour) <= 2) {
      similarity += 0.1;
    }
    factors++;
    
    // Coherence bucket similarity
    if (a.features.coherenceBucket === b.features.coherenceBucket) {
      similarity += 0.1;
    }
    factors++;
    
    return similarity;
  }

  /**
   * Perform simple k-means clustering on patterns
   */
  private performClustering(): void {
    const patterns = Array.from(this.patterns.values());
    if (patterns.length < 3) return;
    
    // Simple k-means with k=3 (high, medium, low coherence clusters)
    const k = Math.min(3, Math.floor(patterns.length / 5));
    const clusters = this.kMeansClustering(patterns, k);
    
    // Update pattern clusters
    clusters.forEach((cluster, idx) => {
      cluster.forEach(pattern => {
        pattern.cluster = idx;
      });
    });
    
    this.emit('clustering-complete', { clusters: clusters.length });
  }

  /**
   * Simple k-means clustering implementation
   */
  private kMeansClustering(patterns: Pattern[], k: number): Pattern[][] {
    // Initialize centroids randomly
    const centroids = patterns.slice(0, k).map(p => p.avgCoherence);
    const clusters: Pattern[][] = Array(k).fill(null).map(() => []);
    
    // Iterate until convergence
    let changed = true;
    let iterations = 0;
    
    while (changed && iterations < 100) {
      changed = false;
      
      // Clear clusters
      clusters.forEach(c => c.length = 0);
      
      // Assign patterns to nearest centroid
      patterns.forEach(pattern => {
        let minDist = Infinity;
        let clusterIdx = 0;
        
        centroids.forEach((centroid, idx) => {
          const dist = Math.abs(pattern.avgCoherence - centroid);
          if (dist < minDist) {
            minDist = dist;
            clusterIdx = idx;
          }
        });
        
        clusters[clusterIdx].push(pattern);
      });
      
      // Update centroids
      centroids.forEach((centroid, idx) => {
        if (clusters[idx].length > 0) {
          const newCentroid = clusters[idx].reduce((sum, p) => sum + p.avgCoherence, 0) / clusters[idx].length;
          if (Math.abs(newCentroid - centroid) > 0.01) {
            changed = true;
            centroids[idx] = newCentroid;
          }
        }
      });
      
      iterations++;
    }
    
    return clusters;
  }

  /**
   * Update statistics
   */
  private updateStatistics(): void {
    if (this.coherenceHistory.length === 0) return;
    
    // Calculate mean
    this.stats.mean = this.coherenceHistory.reduce((a, b) => a + b) / this.coherenceHistory.length;
    
    // Calculate standard deviation
    const variance = this.coherenceHistory.reduce((sum, val) => {
      return sum + Math.pow(val - this.stats.mean, 2);
    }, 0) / this.coherenceHistory.length;
    this.stats.stdDev = Math.sqrt(variance);
    
    // Calculate median
    const sorted = [...this.coherenceHistory].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    this.stats.median = sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
    
    // Calculate MAD (Median Absolute Deviation)
    const deviations = sorted.map(val => Math.abs(val - this.stats.median));
    deviations.sort((a, b) => a - b);
    this.stats.mad = deviations[Math.floor(deviations.length / 2)];
    
    // Calculate percentiles
    [25, 50, 75, 90, 95, 99].forEach(p => {
      const idx = Math.floor((p / 100) * sorted.length);
      this.stats.percentiles.set(p, sorted[idx]);
    });
  }

  /**
   * Clean up old patterns
   */
  private cleanupPatterns(): void {
    const cutoff = new Date(Date.now() - this.config.timeWindowHours * 60 * 60 * 1000);
    const toRemove: string[] = [];
    
    for (const [signature, pattern] of this.patterns) {
      if (pattern.lastSeen < cutoff || this.patterns.size > this.config.maxPatterns) {
        toRemove.push(signature);
      }
    }
    
    // Remove least frequent patterns if over limit
    if (this.patterns.size > this.config.maxPatterns) {
      const sorted = Array.from(this.patterns.entries())
        .sort((a, b) => a[1].frequency - b[1].frequency);
      
      const removeCount = this.patterns.size - this.config.maxPatterns;
      sorted.slice(0, removeCount).forEach(([signature]) => {
        toRemove.push(signature);
      });
    }
    
    toRemove.forEach(signature => this.patterns.delete(signature));
  }

  /**
   * Get current patterns
   */
  getPatterns(): Pattern[] {
    return Array.from(this.patterns.values())
      .sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Get recent anomalies
   */
  getAnomalies(limit: number = 100): Anomaly[] {
    return this.anomalies.slice(-limit);
  }

  /**
   * Get statistics
   */
  getStatistics(): any {
    return {
      ...this.stats,
      totalPatterns: this.patterns.size,
      totalAnomalies: this.anomalies.length,
      dataPoints: this.dataHistory.length
    };
  }

  /**
   * Predict next coherence score based on patterns
   */
  predictNextCoherence(source: string): { prediction: number; confidence: number } | null {
    const sourceData = this.dataHistory
      .filter(dp => dp.source === source)
      .slice(-20); // Last 20 points
    
    if (sourceData.length < 5) {
      return null;
    }
    
    // Simple moving average prediction
    const recentScores = sourceData.map(dp => dp.coherenceScore);
    const weights = recentScores.map((_, idx) => (idx + 1) / recentScores.length);
    const weightSum = weights.reduce((a, b) => a + b);
    
    const prediction = recentScores.reduce((sum, score, idx) => {
      return sum + score * weights[idx];
    }, 0) / weightSum;
    
    // Calculate confidence based on variance
    const variance = recentScores.reduce((sum, score) => {
      return sum + Math.pow(score - prediction, 2);
    }, 0) / recentScores.length;
    
    const confidence = Math.max(0, 1 - Math.sqrt(variance));
    
    return { prediction, confidence };
  }
}