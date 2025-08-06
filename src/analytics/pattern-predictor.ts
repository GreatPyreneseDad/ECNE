/**
 * Pattern Prediction and Forecasting
 * Simple ML algorithms for coherence prediction
 */

import { FilteredDataPoint } from '../core/coherence-filter';

export interface PredictionResult {
  predictedScore: number;
  confidence: number;
  horizon: number; // minutes into future
  method: string;
}

export interface PatternCluster {
  id: string;
  centroid: number[];
  members: string[];
  coherenceRange: { min: number; max: number };
  commonSources: string[];
}

export class CoherencePredictor {
  private readonly historySize: number;
  private dataHistory: FilteredDataPoint[] = [];
  
  constructor(historySize: number = 1000) {
    this.historySize = historySize;
  }

  /**
   * Add data point to history
   */
  addDataPoint(point: FilteredDataPoint): void {
    this.dataHistory.push(point);
    if (this.dataHistory.length > this.historySize) {
      this.dataHistory.shift();
    }
  }

  /**
   * Predict future coherence using exponential smoothing
   */
  predictExponentialSmoothing(
    source: string,
    horizon: number = 5
  ): PredictionResult {
    const sourceData = this.dataHistory
      .filter(p => p.source === source)
      .map(p => p.coherenceScore);
    
    if (sourceData.length < 3) {
      return {
        predictedScore: sourceData[sourceData.length - 1] || 0.5,
        confidence: 0.1,
        horizon,
        method: 'exponential_smoothing'
      };
    }

    // Simple exponential smoothing
    const alpha = 0.3; // smoothing factor
    let forecast = sourceData[0];
    
    for (let i = 1; i < sourceData.length; i++) {
      forecast = alpha * sourceData[i] + (1 - alpha) * forecast;
    }

    // Calculate confidence based on variance
    const variance = this.calculateVariance(sourceData);
    const confidence = Math.max(0.1, 1 - variance);

    return {
      predictedScore: Math.min(1, Math.max(0, forecast)),
      confidence,
      horizon,
      method: 'exponential_smoothing'
    };
  }

  /**
   * Linear regression prediction
   */
  predictLinearRegression(
    source: string,
    horizon: number = 5
  ): PredictionResult {
    const sourceData = this.dataHistory
      .filter(p => p.source === source)
      .map((p, i) => ({ x: i, y: p.coherenceScore }));
    
    if (sourceData.length < 5) {
      return {
        predictedScore: 0.5,
        confidence: 0.1,
        horizon,
        method: 'linear_regression'
      };
    }

    // Calculate linear regression
    const n = sourceData.length;
    const sumX = sourceData.reduce((sum, p) => sum + p.x, 0);
    const sumY = sourceData.reduce((sum, p) => sum + p.y, 0);
    const sumXY = sourceData.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumX2 = sourceData.reduce((sum, p) => sum + p.x * p.x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Predict future value
    const futureX = n + horizon / 5; // Assuming 5-minute intervals
    const prediction = slope * futureX + intercept;

    // Calculate R-squared for confidence
    const yMean = sumY / n;
    const ssTotal = sourceData.reduce((sum, p) => 
      sum + Math.pow(p.y - yMean, 2), 0
    );
    const ssResidual = sourceData.reduce((sum, p) => 
      sum + Math.pow(p.y - (slope * p.x + intercept), 2), 0
    );
    const rSquared = 1 - (ssResidual / ssTotal);

    return {
      predictedScore: Math.min(1, Math.max(0, prediction)),
      confidence: Math.max(0.1, rSquared),
      horizon,
      method: 'linear_regression'
    };
  }

  /**
   * Ensemble prediction combining multiple methods
   */
  predictEnsemble(source: string, horizon: number = 5): PredictionResult {
    const exponential = this.predictExponentialSmoothing(source, horizon);
    const linear = this.predictLinearRegression(source, horizon);

    // Weighted average based on confidence
    const totalConfidence = exponential.confidence + linear.confidence;
    const weightedScore = (
      exponential.predictedScore * exponential.confidence +
      linear.predictedScore * linear.confidence
    ) / totalConfidence;

    return {
      predictedScore: weightedScore,
      confidence: totalConfidence / 2,
      horizon,
      method: 'ensemble'
    };
  }

  private calculateVariance(data: number[]): number {
    const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
    return data.reduce((sum, val) => 
      sum + Math.pow(val - mean, 2), 0
    ) / data.length;
  }
}

/**
 * Pattern clustering for similar data points
 */
export class PatternClusterer {
  private clusters: Map<string, PatternCluster> = new Map();
  
  /**
   * Simple K-means clustering for coherence patterns
   */
  clusterPatterns(
    dataPoints: FilteredDataPoint[],
    k: number = 5
  ): PatternCluster[] {
    if (dataPoints.length < k) return [];

    // Convert to feature vectors
    const vectors = dataPoints.map(p => [
      p.coherenceScore,
      p.coherenceDimensions.psi,
      p.coherenceDimensions.rho,
      p.coherenceDimensions.q,
      p.coherenceDimensions.f
    ]);

    // Initialize centroids randomly
    const centroids: number[][] = [];
    for (let i = 0; i < k; i++) {
      const randomIndex = Math.floor(Math.random() * vectors.length);
      centroids.push([...vectors[randomIndex]]);
    }

    // K-means iterations
    const maxIterations = 50;
    let iterations = 0;
    let assignments: number[] = new Array(vectors.length).fill(0);

    while (iterations < maxIterations) {
      // Assign points to nearest centroid
      const newAssignments = vectors.map(vector => {
        let minDistance = Infinity;
        let closestCentroid = 0;

        centroids.forEach((centroid, i) => {
          const distance = this.euclideanDistance(vector, centroid);
          if (distance < minDistance) {
            minDistance = distance;
            closestCentroid = i;
          }
        });

        return closestCentroid;
      });

      // Check for convergence
      if (JSON.stringify(assignments) === JSON.stringify(newAssignments)) {
        break;
      }

      assignments = newAssignments;

      // Update centroids
      for (let i = 0; i < k; i++) {
        const clusterVectors = vectors.filter((_, idx) => assignments[idx] === i);
        if (clusterVectors.length > 0) {
          centroids[i] = this.calculateCentroid(clusterVectors);
        }
      }

      iterations++;
    }

    // Create cluster objects
    const clusters: PatternCluster[] = [];
    for (let i = 0; i < k; i++) {
      const memberIndices = assignments
        .map((a, idx) => a === i ? idx : -1)
        .filter(idx => idx !== -1);
      
      const members = memberIndices.map(idx => dataPoints[idx].id);
      const memberPoints = memberIndices.map(idx => dataPoints[idx]);
      
      if (members.length > 0) {
        const coherenceScores = memberPoints.map(p => p.coherenceScore);
        const sources = [...new Set(memberPoints.map(p => p.source))];
        
        clusters.push({
          id: `cluster-${i}`,
          centroid: centroids[i],
          members,
          coherenceRange: {
            min: Math.min(...coherenceScores),
            max: Math.max(...coherenceScores)
          },
          commonSources: sources.slice(0, 3) // Top 3 sources
        });
      }
    }

    return clusters;
  }

  private euclideanDistance(a: number[], b: number[]): number {
    return Math.sqrt(
      a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0)
    );
  }

  private calculateCentroid(vectors: number[][]): number[] {
    const dimensions = vectors[0].length;
    const centroid: number[] = new Array(dimensions).fill(0);
    
    vectors.forEach(vector => {
      vector.forEach((val, i) => {
        centroid[i] += val;
      });
    });
    
    return centroid.map(val => val / vectors.length);
  }
}