/**
 * Auto-tuning for Coherence Weights
 * Optimizes weights based on user feedback and performance metrics
 */

import { CoherenceWeights } from '../core/coherence-filter';

export interface OptimizationResult {
  weights: CoherenceWeights;
  improvement: number;
  iterations: number;
  converged: boolean;
}

export interface FeedbackData {
  dataPointId: string;
  wasRelevant: boolean;
  coherenceScore: number;
  dimensions: CoherenceWeights;
}

export class WeightOptimizer {
  private feedbackHistory: FeedbackData[] = [];
  private readonly learningRate: number;
  private readonly maxIterations: number;
  
  constructor(
    learningRate: number = 0.01,
    maxIterations: number = 100
  ) {
    this.learningRate = learningRate;
    this.maxIterations = maxIterations;
  }

  /**
   * Add user feedback for a data point
   */
  addFeedback(feedback: FeedbackData): void {
    this.feedbackHistory.push(feedback);
    
    // Keep history manageable
    if (this.feedbackHistory.length > 1000) {
      this.feedbackHistory = this.feedbackHistory.slice(-1000);
    }
  }

  /**
   * Optimize weights using gradient descent
   */
  optimizeWeights(currentWeights: CoherenceWeights): OptimizationResult {
    if (this.feedbackHistory.length < 10) {
      return {
        weights: currentWeights,
        improvement: 0,
        iterations: 0,
        converged: false
      };
    }

    let weights = { ...currentWeights };
    let previousLoss = this.calculateLoss(weights);
    let converged = false;
    let iterations = 0;

    while (iterations < this.maxIterations && !converged) {
      // Calculate gradients
      const gradients = this.calculateGradients(weights);
      
      // Update weights
      const newWeights: CoherenceWeights = {
        psi: weights.psi - this.learningRate * gradients.psi,
        rho: weights.rho - this.learningRate * gradients.rho,
        q: weights.q - this.learningRate * gradients.q,
        f: weights.f - this.learningRate * gradients.f
      };

      // Normalize weights to sum to 1
      const sum = Object.values(newWeights).reduce((s, w) => s + w, 0);
      Object.keys(newWeights).forEach(key => {
        (newWeights as any)[key] /= sum;
      });

      // Check convergence
      const currentLoss = this.calculateLoss(newWeights);
      const improvement = previousLoss - currentLoss;
      
      if (Math.abs(improvement) < 0.0001) {
        converged = true;
      }

      weights = newWeights;
      previousLoss = currentLoss;
      iterations++;
    }

    const finalLoss = this.calculateLoss(weights);
    const initialLoss = this.calculateLoss(currentWeights);
    const improvement = (initialLoss - finalLoss) / initialLoss;

    return {
      weights,
      improvement,
      iterations,
      converged
    };
  }

  /**
   * Calculate loss function (binary cross-entropy)
   */
  private calculateLoss(weights: CoherenceWeights): number {
    let totalLoss = 0;
    
    this.feedbackHistory.forEach(feedback => {
      const predictedScore = this.calculateWeightedScore(
        feedback.dimensions,
        weights
      );
      
      // Binary cross-entropy loss
      const target = feedback.wasRelevant ? 1 : 0;
      const loss = -target * Math.log(predictedScore + 1e-7) 
                   - (1 - target) * Math.log(1 - predictedScore + 1e-7);
      
      totalLoss += loss;
    });
    
    return totalLoss / this.feedbackHistory.length;
  }

  /**
   * Calculate gradients for each weight
   */
  private calculateGradients(weights: CoherenceWeights): CoherenceWeights {
    const epsilon = 0.0001;
    const gradients: CoherenceWeights = {
      psi: 0,
      rho: 0,
      q: 0,
      f: 0
    };

    // Numerical gradient calculation
    Object.keys(weights).forEach(dim => {
      const weightsCopy = { ...weights };
      
      // Forward difference
      (weightsCopy as any)[dim] += epsilon;
      const lossPlus = this.calculateLoss(weightsCopy);
      
      (weightsCopy as any)[dim] = (weights as any)[dim] - epsilon;
      const lossMinus = this.calculateLoss(weightsCopy);
      
      (gradients as any)[dim] = (lossPlus - lossMinus) / (2 * epsilon);
    });

    return gradients;
  }

  /**
   * Calculate weighted coherence score
   */
  private calculateWeightedScore(
    dimensions: CoherenceWeights,
    weights: CoherenceWeights
  ): number {
    return dimensions.psi * weights.psi +
           dimensions.rho * weights.rho +
           dimensions.q * weights.q +
           dimensions.f * weights.f;
  }

  /**
   * Get performance metrics for current weights
   */
  getPerformanceMetrics(weights: CoherenceWeights): {
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
  } {
    if (this.feedbackHistory.length === 0) {
      return { accuracy: 0, precision: 0, recall: 0, f1Score: 0 };
    }

    let truePositives = 0;
    let falsePositives = 0;
    let trueNegatives = 0;
    let falseNegatives = 0;

    this.feedbackHistory.forEach(feedback => {
      const predictedScore = this.calculateWeightedScore(
        feedback.dimensions,
        weights
      );
      const predicted = predictedScore >= 0.5;
      const actual = feedback.wasRelevant;

      if (predicted && actual) truePositives++;
      else if (predicted && !actual) falsePositives++;
      else if (!predicted && !actual) trueNegatives++;
      else if (!predicted && actual) falseNegatives++;
    });

    const accuracy = (truePositives + trueNegatives) / this.feedbackHistory.length;
    const precision = truePositives / (truePositives + falsePositives + 1e-7);
    const recall = truePositives / (truePositives + falseNegatives + 1e-7);
    const f1Score = 2 * (precision * recall) / (precision + recall + 1e-7);

    return { accuracy, precision, recall, f1Score };
  }

  /**
   * Suggest weight adjustments based on dimension performance
   */
  suggestAdjustments(currentWeights: CoherenceWeights): {
    dimension: string;
    currentWeight: number;
    suggestedWeight: number;
    reason: string;
  }[] {
    const suggestions: any[] = [];
    const dimensionPerformance = this.analyzeDimensionPerformance();

    Object.entries(dimensionPerformance).forEach(([dim, perf]) => {
      const currentWeight = (currentWeights as any)[dim];
      let suggestedWeight = currentWeight;
      let reason = '';

      if (perf.correlation > 0.7) {
        suggestedWeight = Math.min(currentWeight * 1.2, 0.4);
        reason = 'High correlation with relevance';
      } else if (perf.correlation < 0.3) {
        suggestedWeight = Math.max(currentWeight * 0.8, 0.1);
        reason = 'Low correlation with relevance';
      }

      if (Math.abs(suggestedWeight - currentWeight) > 0.01) {
        suggestions.push({
          dimension: dim,
          currentWeight,
          suggestedWeight,
          reason
        });
      }
    });

    return suggestions;
  }

  /**
   * Analyze individual dimension performance
   */
  private analyzeDimensionPerformance(): Record<string, {
    correlation: number;
    importance: number;
  }> {
    const performance: any = {};
    const dimensions = ['psi', 'rho', 'q', 'f'];

    dimensions.forEach(dim => {
      const relevantScores: number[] = [];
      const irrelevantScores: number[] = [];

      this.feedbackHistory.forEach(feedback => {
        const score = (feedback.dimensions as any)[dim];
        if (feedback.wasRelevant) {
          relevantScores.push(score);
        } else {
          irrelevantScores.push(score);
        }
      });

      // Calculate correlation (simplified)
      const avgRelevant = relevantScores.reduce((s, v) => s + v, 0) / (relevantScores.length || 1);
      const avgIrrelevant = irrelevantScores.reduce((s, v) => s + v, 0) / (irrelevantScores.length || 1);
      const correlation = Math.abs(avgRelevant - avgIrrelevant);

      performance[dim] = {
        correlation,
        importance: correlation // Simplified importance measure
      };
    });

    return performance;
  }
}