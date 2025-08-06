/**
 * Coherence Weight Auto-Tuning System
 * Optimizes dimension weights based on feedback and performance
 */

import { CoherenceWeights, FilteredDataPoint } from '../core/coherence-filter';
import { EventEmitter } from 'events';

export interface FeedbackData {
  dataPointId: string;
  feedback: 'positive' | 'negative' | 'neutral';
  confidence: number; // 0-1
  reason?: string;
  timestamp: Date;
}

export interface OptimizationResult {
  oldWeights: CoherenceWeights & Record<string, number>;
  newWeights: CoherenceWeights & Record<string, number>;
  improvement: number;
  confidence: number;
}

export interface WeightOptimizerConfig {
  learningRate: number;
  minFeedbackForUpdate: number;
  explorationRate: number;
  decayFactor: number;
  updateInterval: number; // minutes
}

export class WeightOptimizer extends EventEmitter {
  private feedbackHistory: Map<string, FeedbackData> = new Map();
  private dataPointHistory: Map<string, FilteredDataPoint> = new Map();
  private currentWeights: CoherenceWeights & Record<string, number>;
  private performanceHistory: Array<{
    weights: CoherenceWeights & Record<string, number>;
    performance: number;
    timestamp: Date;
  }> = [];
  private updateTimer?: NodeJS.Timeout;

  constructor(
    private config: WeightOptimizerConfig,
    initialWeights: CoherenceWeights & Record<string, number>
  ) {
    super();
    this.currentWeights = { ...initialWeights };
    
    // Start periodic optimization
    if (config.updateInterval > 0) {
      this.updateTimer = setInterval(() => {
        this.optimizeWeights();
      }, config.updateInterval * 60 * 1000);
    }
  }

  /**
   * Record feedback for a data point
   */
  recordFeedback(feedback: FeedbackData): void {
    this.feedbackHistory.set(feedback.dataPointId, feedback);
    this.emit('feedback-recorded', feedback);
    
    // Check if we should trigger optimization
    if (this.feedbackHistory.size >= this.config.minFeedbackForUpdate) {
      this.optimizeWeights();
    }
  }

  /**
   * Record a filtered data point for optimization
   */
  recordDataPoint(dataPoint: FilteredDataPoint): void {
    this.dataPointHistory.set(dataPoint.id, dataPoint);
    
    // Maintain history size
    if (this.dataPointHistory.size > 10000) {
      const oldestId = Array.from(this.dataPointHistory.keys())[0];
      this.dataPointHistory.delete(oldestId);
    }
  }

  /**
   * Optimize weights based on feedback
   */
  async optimizeWeights(): Promise<OptimizationResult | null> {
    const feedbackData = this.prepareFeedbackData();
    
    if (feedbackData.length < this.config.minFeedbackForUpdate) {
      return null;
    }
    
    // Calculate current performance
    const currentPerformance = this.calculatePerformance(this.currentWeights, feedbackData);
    
    // Try different weight variations
    const variations = this.generateWeightVariations();
    let bestWeights = this.currentWeights;
    let bestPerformance = currentPerformance;
    
    for (const weights of variations) {
      const performance = this.calculatePerformance(weights, feedbackData);
      
      if (performance > bestPerformance) {
        bestPerformance = performance;
        bestWeights = weights;
      }
    }
    
    // Apply gradient-based optimization
    const gradientWeights = this.applyGradientDescent(feedbackData);
    const gradientPerformance = this.calculatePerformance(gradientWeights, feedbackData);
    
    if (gradientPerformance > bestPerformance) {
      bestPerformance = gradientPerformance;
      bestWeights = gradientWeights;
    }
    
    // Calculate improvement
    const improvement = bestPerformance - currentPerformance;
    const confidence = this.calculateConfidence(feedbackData.length, improvement);
    
    // Update weights if improvement is significant
    if (improvement > 0.01 && confidence > 0.5) {
      const result: OptimizationResult = {
        oldWeights: this.currentWeights,
        newWeights: bestWeights,
        improvement,
        confidence
      };
      
      this.currentWeights = bestWeights;
      
      // Record performance history
      this.performanceHistory.push({
        weights: bestWeights,
        performance: bestPerformance,
        timestamp: new Date()
      });
      
      // Clear old feedback
      this.clearOldFeedback();
      
      this.emit('weights-updated', result);
      return result;
    }
    
    return null;
  }

  /**
   * Prepare feedback data with corresponding data points
   */
  private prepareFeedbackData(): Array<{
    feedback: FeedbackData;
    dataPoint: FilteredDataPoint;
  }> {
    const data: Array<{ feedback: FeedbackData; dataPoint: FilteredDataPoint }> = [];
    
    for (const [id, feedback] of this.feedbackHistory) {
      const dataPoint = this.dataPointHistory.get(id);
      if (dataPoint) {
        data.push({ feedback, dataPoint });
      }
    }
    
    return data;
  }

  /**
   * Calculate performance score for given weights
   */
  private calculatePerformance(
    weights: CoherenceWeights & Record<string, number>,
    feedbackData: Array<{ feedback: FeedbackData; dataPoint: FilteredDataPoint }>
  ): number {
    let score = 0;
    let totalWeight = 0;
    
    for (const { feedback, dataPoint } of feedbackData) {
      // Recalculate coherence score with new weights
      const newScore = this.recalculateScore(dataPoint, weights);
      
      // Calculate feedback alignment
      let alignment = 0;
      if (feedback.feedback === 'positive') {
        alignment = newScore; // Higher score is better for positive feedback
      } else if (feedback.feedback === 'negative') {
        alignment = 1 - newScore; // Lower score is better for negative feedback
      } else {
        alignment = 1 - Math.abs(newScore - 0.5) * 2; // Middle score is better for neutral
      }
      
      // Weight by feedback confidence
      score += alignment * feedback.confidence;
      totalWeight += feedback.confidence;
    }
    
    return totalWeight > 0 ? score / totalWeight : 0;
  }

  /**
   * Recalculate coherence score with new weights
   */
  private recalculateScore(
    dataPoint: FilteredDataPoint,
    weights: CoherenceWeights & Record<string, number>
  ): number {
    const dimensions = dataPoint.coherenceDimensions;
    let score = 0;
    let totalWeight = 0;
    
    // Standard dimensions
    score += dimensions.psi * (weights.psi || 0);
    score += dimensions.rho * (weights.rho || 0);
    score += dimensions.q * (weights.q || 0);
    score += dimensions.f * (weights.f || 0);
    totalWeight += (weights.psi || 0) + (weights.rho || 0) + (weights.q || 0) + (weights.f || 0);
    
    // Custom dimensions
    if ('custom' in dimensions && dimensions.custom) {
      for (const [key, value] of Object.entries(dimensions.custom)) {
        if (key in weights) {
          score += value * weights[key];
          totalWeight += weights[key];
        }
      }
    }
    
    return totalWeight > 0 ? score / totalWeight : 0;
  }

  /**
   * Generate weight variations for exploration
   */
  private generateWeightVariations(): Array<CoherenceWeights & Record<string, number>> {
    const variations: Array<CoherenceWeights & Record<string, number>> = [];
    const dimensions = Object.keys(this.currentWeights);
    
    // Single dimension variations
    for (const dim of dimensions) {
      // Increase weight
      const increaseVariation = { ...this.currentWeights };
      increaseVariation[dim] = Math.min(1, increaseVariation[dim] + this.config.explorationRate);
      variations.push(this.normalizeWeights(increaseVariation));
      
      // Decrease weight
      const decreaseVariation = { ...this.currentWeights };
      decreaseVariation[dim] = Math.max(0, decreaseVariation[dim] - this.config.explorationRate);
      variations.push(this.normalizeWeights(decreaseVariation));
    }
    
    // Random variations
    for (let i = 0; i < 5; i++) {
      const randomVariation = { ...this.currentWeights };
      for (const dim of dimensions) {
        const noise = (Math.random() - 0.5) * this.config.explorationRate * 2;
        randomVariation[dim] = Math.max(0, Math.min(1, randomVariation[dim] + noise));
      }
      variations.push(this.normalizeWeights(randomVariation));
    }
    
    return variations;
  }

  /**
   * Apply gradient descent optimization
   */
  private applyGradientDescent(
    feedbackData: Array<{ feedback: FeedbackData; dataPoint: FilteredDataPoint }>
  ): CoherenceWeights & Record<string, number> {
    const gradients: Record<string, number> = {};
    const dimensions = Object.keys(this.currentWeights);
    
    // Calculate gradients for each dimension
    for (const dim of dimensions) {
      let gradient = 0;
      let count = 0;
      
      for (const { feedback, dataPoint } of feedbackData) {
        const dimensionValue = this.getDimensionValue(dataPoint, dim);
        
        // Calculate gradient based on feedback
        if (feedback.feedback === 'positive') {
          gradient += dimensionValue * feedback.confidence;
        } else if (feedback.feedback === 'negative') {
          gradient -= dimensionValue * feedback.confidence;
        }
        count += feedback.confidence;
      }
      
      gradients[dim] = count > 0 ? gradient / count : 0;
    }
    
    // Apply gradients with learning rate
    const newWeights = { ...this.currentWeights };
    for (const dim of dimensions) {
      newWeights[dim] += gradients[dim] * this.config.learningRate;
      newWeights[dim] = Math.max(0, Math.min(1, newWeights[dim]));
    }
    
    return this.normalizeWeights(newWeights);
  }

  /**
   * Get dimension value from data point
   */
  private getDimensionValue(dataPoint: FilteredDataPoint, dimension: string): number {
    const dimensions = dataPoint.coherenceDimensions;
    
    if (dimension in dimensions) {
      return dimensions[dimension as keyof typeof dimensions];
    }
    
    if ('custom' in dimensions && dimensions.custom && dimension in dimensions.custom) {
      return dimensions.custom[dimension];
    }
    
    return 0;
  }

  /**
   * Normalize weights to sum to 1
   */
  private normalizeWeights(weights: CoherenceWeights & Record<string, number>): CoherenceWeights & Record<string, number> {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    
    if (sum === 0) {
      // Equal weights if all are zero
      const equalWeight = 1 / Object.keys(weights).length;
      const normalized: any = {};
      for (const key of Object.keys(weights)) {
        normalized[key] = equalWeight;
      }
      return normalized;
    }
    
    const normalized: any = {};
    for (const [key, value] of Object.entries(weights)) {
      normalized[key] = value / sum;
    }
    
    return normalized;
  }

  /**
   * Calculate confidence in the optimization result
   */
  private calculateConfidence(feedbackCount: number, improvement: number): number {
    // Base confidence on feedback count
    const feedbackConfidence = Math.min(1, feedbackCount / (this.config.minFeedbackForUpdate * 2));
    
    // Confidence based on improvement magnitude
    const improvementConfidence = Math.min(1, improvement * 10);
    
    // Combined confidence
    return feedbackConfidence * improvementConfidence;
  }

  /**
   * Clear old feedback data
   */
  private clearOldFeedback(): void {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
    
    for (const [id, feedback] of this.feedbackHistory) {
      if (feedback.timestamp < cutoff) {
        this.feedbackHistory.delete(id);
      }
    }
  }

  /**
   * Get current weights
   */
  getCurrentWeights(): CoherenceWeights & Record<string, number> {
    return { ...this.currentWeights };
  }

  /**
   * Get optimization history
   */
  getOptimizationHistory(): Array<{
    weights: CoherenceWeights & Record<string, number>;
    performance: number;
    timestamp: Date;
  }> {
    return [...this.performanceHistory];
  }

  /**
   * Manually set weights
   */
  setWeights(weights: CoherenceWeights & Record<string, number>): void {
    this.currentWeights = this.normalizeWeights(weights);
    this.emit('weights-set', this.currentWeights);
  }

  /**
   * Stop the optimizer
   */
  stop(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = undefined;
    }
  }

  /**
   * Get optimizer statistics
   */
  getStatistics(): any {
    return {
      feedbackCount: this.feedbackHistory.size,
      dataPointCount: this.dataPointHistory.size,
      optimizationRuns: this.performanceHistory.length,
      currentWeights: this.currentWeights,
      lastOptimization: this.performanceHistory.length > 0 
        ? this.performanceHistory[this.performanceHistory.length - 1].timestamp 
        : null
    };
  }
}