/**
 * Enhanced Coherence Filter with Analytics
 * Integrates ML-based pattern detection and optimization
 */

import { CoherenceFilter, FilterConfig, DataPoint, FilteredDataPoint, GCTParameters } from './coherence-filter';
import { CoherenceAnomalyDetector, DimensionalAnomalyDetector } from '../analytics/anomaly-detector';
import { CoherencePredictor, PatternClusterer } from '../analytics/pattern-predictor';
import { WeightOptimizer, FeedbackData } from '../analytics/weight-optimizer';

export interface EnhancedFilterConfig extends FilterConfig {
  enableAnomalyDetection?: boolean;
  enablePrediction?: boolean;
  enableAutoTuning?: boolean;
  anomalyThreshold?: number;
}

export interface EnhancedDataPoint extends FilteredDataPoint {
  isAnomaly?: boolean;
  anomalyScore?: number;
  predictedFutureScore?: number;
  patternCluster?: string;
}

export class EnhancedCoherenceFilter extends CoherenceFilter {
  private anomalyDetector: CoherenceAnomalyDetector;
  private dimensionalDetector: DimensionalAnomalyDetector;
  private predictor: CoherencePredictor;
  private clusterer: PatternClusterer;
  private optimizer: WeightOptimizer;
  private enhancedConfig: EnhancedFilterConfig;
  private recentPoints: EnhancedDataPoint[] = [];

  constructor(config: EnhancedFilterConfig) {
    super(config);
    this.enhancedConfig = config;
    
    // Initialize analytics components
    this.anomalyDetector = new CoherenceAnomalyDetector(
      100,
      config.anomalyThreshold || 3
    );
    this.dimensionalDetector = new DimensionalAnomalyDetector();
    this.predictor = new CoherencePredictor();
    this.clusterer = new PatternClusterer();
    this.optimizer = new WeightOptimizer();
  }

  /**
   * Enhanced filter with analytics
   */
  async filter(dataPoint: DataPoint): Promise<EnhancedDataPoint | null> {
    // Run base filter
    const filtered = await super.filter(dataPoint);
    if (!filtered) return null;

    // Enhance with analytics
    const enhanced: EnhancedDataPoint = { ...filtered };

    // Anomaly detection
    if (this.enhancedConfig.enableAnomalyDetection) {
      const anomalyResult = this.anomalyDetector.detect(filtered.coherenceScore);
      enhanced.isAnomaly = anomalyResult.isAnomaly;
      enhanced.anomalyScore = anomalyResult.deviation;

      // Check dimensional anomalies
      const dimAnomalies = this.dimensionalDetector.detectMultiDimensional(
        filtered.coherenceDimensions
      );
      
      // Log significant anomalies
      if (anomalyResult.isAnomaly) {
        console.log(`Anomaly detected: ${dataPoint.source} - Score: ${filtered.coherenceScore.toFixed(3)}`);
      }
    }

    // Prediction
    if (this.enhancedConfig.enablePrediction) {
      this.predictor.addDataPoint(filtered);
      const prediction = this.predictor.predictEnsemble(dataPoint.source, 10);
      enhanced.predictedFutureScore = prediction.predictedScore;
    }

    // Store for clustering
    this.recentPoints.push(enhanced);
    if (this.recentPoints.length > 1000) {
      this.recentPoints.shift();
    }

    // Periodic clustering
    if (this.recentPoints.length % 100 === 0) {
      this.updateClusters();
    }

    return enhanced;
  }

  /**
   * Process user feedback for optimization
   */
  provideFeedback(dataPointId: string, wasRelevant: boolean): void {
    const point = this.recentPoints.find(p => p.id === dataPointId);
    if (!point) return;

    const feedback: FeedbackData = {
      dataPointId,
      wasRelevant,
      coherenceScore: point.coherenceScore,
      dimensions: point.coherenceDimensions
    };

    this.optimizer.addFeedback(feedback);

    // Auto-tune weights if enabled
    if (this.enhancedConfig.enableAutoTuning) {
      this.autoTuneWeights();
    }
  }

  /**
   * Automatically optimize weights based on feedback
   */
  private autoTuneWeights(): void {
    const currentWeights = this.getConfig().weights;
    const result = this.optimizer.optimizeWeights(currentWeights);

    if (result.improvement > 0.05) { // 5% improvement threshold
      console.log(`Auto-tuning weights: ${JSON.stringify(result.weights)} (${(result.improvement * 100).toFixed(1)}% improvement)`);
      this.updateConfig({ weights: result.weights });
    }
  }

  /**
   * Update pattern clusters
   */
  private updateClusters(): void {
    const clusters = this.clusterer.clusterPatterns(this.recentPoints, 5);
    
    // Assign cluster IDs to points
    clusters.forEach(cluster => {
      cluster.members.forEach(memberId => {
        const point = this.recentPoints.find(p => p.id === memberId);
        if (point) {
          point.patternCluster = cluster.id;
        }
      });
    });
  }

  /**
   * Get analytics insights
   */
  getAnalytics(): {
    anomalyRate: number;
    trendDirection: string;
    topPatterns: any[];
    performanceMetrics: any;
    weightSuggestions: any[];
  } {
    const anomalyCount = this.recentPoints.filter(p => p.isAnomaly).length;
    const anomalyRate = this.recentPoints.length > 0 
      ? anomalyCount / this.recentPoints.length 
      : 0;

    const trend = this.anomalyDetector.getTrend();
    const clusters = this.clusterer.clusterPatterns(this.recentPoints, 3);
    const performance = this.optimizer.getPerformanceMetrics(this.getConfig().weights);
    const suggestions = this.optimizer.suggestAdjustments(this.getConfig().weights);

    return {
      anomalyRate,
      trendDirection: trend,
      topPatterns: clusters.map(c => ({
        id: c.id,
        size: c.members.length,
        coherenceRange: c.coherenceRange,
        sources: c.commonSources
      })),
      performanceMetrics: performance,
      weightSuggestions: suggestions
    };
  }

  /**
   * Predict future coherence for a source
   */
  predictCoherence(source: string, horizon: number = 10): {
    current: number;
    predicted: number;
    confidence: number;
    trend: string;
  } {
    const sourcePoints = this.recentPoints.filter(p => p.source === source);
    const currentScore = sourcePoints.length > 0 
      ? sourcePoints[sourcePoints.length - 1].coherenceScore 
      : 0.5;

    const prediction = this.predictor.predictEnsemble(source, horizon);
    const trend = this.anomalyDetector.getTrend();

    return {
      current: currentScore,
      predicted: prediction.predictedScore,
      confidence: prediction.confidence,
      trend
    };
  }

  /**
   * Get dimension correlation matrix
   */
  getDimensionCorrelations(): number[][] {
    return this.dimensionalDetector.getDimensionCorrelation();
  }

  /**
   * Export analytics data
   */
  exportAnalytics(): {
    timestamp: Date;
    config: EnhancedFilterConfig;
    statistics: any;
    patterns: any[];
    performance: any;
  } {
    return {
      timestamp: new Date(),
      config: this.enhancedConfig,
      statistics: this.getStatistics(),
      patterns: this.clusterer.clusterPatterns(this.recentPoints, 5),
      performance: this.optimizer.getPerformanceMetrics(this.getConfig().weights)
    };
  }
}

/**
 * A/B Testing framework for filter configurations
 */
export class FilterABTester {
  private variantA: EnhancedCoherenceFilter;
  private variantB: EnhancedCoherenceFilter;
  private resultsA: FilteredDataPoint[] = [];
  private resultsB: FilteredDataPoint[] = [];
  private startTime: Date;

  constructor(
    configA: EnhancedFilterConfig,
    configB: EnhancedFilterConfig
  ) {
    this.variantA = new EnhancedCoherenceFilter(configA);
    this.variantB = new EnhancedCoherenceFilter(configB);
    this.startTime = new Date();
  }

  /**
   * Process data through both variants
   */
  async process(dataPoint: DataPoint): Promise<{
    variantA: EnhancedDataPoint | null;
    variantB: EnhancedDataPoint | null;
  }> {
    const [resultA, resultB] = await Promise.all([
      this.variantA.filter(dataPoint),
      this.variantB.filter(dataPoint)
    ]);

    if (resultA) this.resultsA.push(resultA);
    if (resultB) this.resultsB.push(resultB);

    return { variantA: resultA, variantB: resultB };
  }

  /**
   * Get A/B test results
   */
  getResults(): {
    duration: number;
    variantA: {
      filtered: number;
      avgCoherence: number;
      anomalyRate: number;
    };
    variantB: {
      filtered: number;
      avgCoherence: number;
      anomalyRate: number;
    };
    recommendation: string;
  } {
    const duration = (Date.now() - this.startTime.getTime()) / 1000 / 60; // minutes
    
    const statsA = this.calculateStats(this.resultsA);
    const statsB = this.calculateStats(this.resultsB);

    // Determine winner based on multiple factors
    let recommendation = 'Insufficient data';
    if (this.resultsA.length > 100 && this.resultsB.length > 100) {
      if (statsA.avgCoherence > statsB.avgCoherence && statsA.filtered > statsB.filtered) {
        recommendation = 'Variant A performs better';
      } else if (statsB.avgCoherence > statsA.avgCoherence && statsB.filtered > statsA.filtered) {
        recommendation = 'Variant B performs better';
      } else {
        recommendation = 'Mixed results - need more testing';
      }
    }

    return {
      duration,
      variantA: statsA,
      variantB: statsB,
      recommendation
    };
  }

  private calculateStats(results: FilteredDataPoint[]): any {
    if (results.length === 0) {
      return { filtered: 0, avgCoherence: 0, anomalyRate: 0 };
    }

    const avgCoherence = results.reduce((sum, r) => sum + r.coherenceScore, 0) / results.length;
    const anomalyCount = results.filter(r => (r as EnhancedDataPoint).isAnomaly).length;

    return {
      filtered: results.length,
      avgCoherence,
      anomalyRate: anomalyCount / results.length
    };
  }
}