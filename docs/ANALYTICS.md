# 📈 Analytics & Machine Learning Guide

## Overview

ECNE's analytics engine provides advanced machine learning capabilities that enhance the basic coherence filtering with predictive analytics, anomaly detection, and automatic optimization.

## Core Analytics Components

### 1. Anomaly Detection (`src/analytics/anomaly-detector.ts`)

Identifies unusual patterns in coherence scores using statistical methods.

#### Statistical Methods

**Z-Score Analysis**:
```typescript
const zScore = Math.abs((coherenceScore - mean) / stdDev);
const isAnomaly = zScore > threshold; // Default threshold: 3.0
```

**Multi-dimensional Detection**:
```typescript
// Separate anomaly detection for each dimension
const dimensionalAnomalies = {
  psi: detector.detect(dimensions.psi),
  rho: detector.detect(dimensions.rho),
  q: detector.detect(dimensions.q),
  f: detector.detect(dimensions.f)
};
```

#### Implementation Features

- **Sliding Window**: Maintains recent history for context-aware detection
- **Adaptive Thresholds**: Adjusts sensitivity based on data volatility
- **Multi-dimensional Analysis**: Detects anomalies in individual coherence dimensions
- **Real-time Alerts**: Immediate notification of unusual patterns

#### Usage Example

```typescript
const detector = new CoherenceAnomalyDetector(100, 2.5); // window size, z-threshold

const result = detector.detect(0.95); // Unusually high coherence score
if (result.isAnomaly) {
  console.log(`Anomaly detected: score ${result.score}, deviation ${result.deviation}`);
}
```

### 2. Pattern Prediction (`src/analytics/pattern-predictor.ts`)

Forecasts future coherence scores using time-series analysis.

#### Prediction Algorithms

**Exponential Smoothing**:
```typescript
// Simple exponential smoothing with alpha = 0.3
let forecast = sourceData[0];
for (let i = 1; i < sourceData.length; i++) {
  forecast = alpha * sourceData[i] + (1 - alpha) * forecast;
}
```

**Linear Regression**:
```typescript
// Calculate trend line for predictions
const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
const intercept = (sumY - slope * sumX) / n;
const prediction = slope * futureX + intercept;
```

**Ensemble Prediction**:
```typescript
// Weighted average of multiple methods
const ensemblePrediction = (
  exponential.score * exponential.confidence +
  linear.score * linear.confidence
) / (exponential.confidence + linear.confidence);
```

#### Prediction Capabilities

- **Short-term Forecasting**: 5-60 minute ahead predictions
- **Confidence Intervals**: Measure prediction reliability
- **Multiple Models**: Ensemble approach for better accuracy
- **Source-specific**: Individual predictions per data source

### 3. Weight Optimization (`src/analytics/weight-optimizer.ts`)

Automatically tunes coherence dimension weights based on user feedback.

#### Optimization Algorithm

**Gradient Descent**:
```typescript
// Update weights using calculated gradients
const newWeights = {
  psi: weights.psi - learningRate * gradients.psi,
  rho: weights.rho - learningRate * gradients.rho,
  q: weights.q - learningRate * gradients.q,
  f: weights.f - learningRate * gradients.f
};

// Normalize to ensure weights sum to 1
const sum = Object.values(newWeights).reduce((s, w) => s + w, 0);
Object.keys(newWeights).forEach(key => newWeights[key] /= sum);
```

**Loss Function** (Binary Cross-Entropy):
```typescript
const loss = -target * Math.log(predicted + 1e-7) - (1 - target) * Math.log(1 - predicted + 1e-7);
```

#### Performance Metrics

```typescript
interface PerformanceMetrics {
  accuracy: number;    // (TP + TN) / Total
  precision: number;   // TP / (TP + FP)
  recall: number;      // TP / (TP + FN)
  f1Score: number;     // 2 * (precision * recall) / (precision + recall)
}
```

### 4. Pattern Clustering (`src/analytics/pattern-predictor.ts`)

Groups similar data points using unsupervised learning.

#### K-Means Clustering

**Feature Vector**:
```typescript
// Convert data points to feature vectors
const vectors = dataPoints.map(p => [
  p.coherenceScore,
  p.dimensions.psi,
  p.dimensions.rho,
  p.dimensions.q,
  p.dimensions.f
]);
```

**Clustering Process**:
1. Initialize K centroids randomly
2. Assign points to nearest centroid
3. Update centroids based on assignments
4. Repeat until convergence

**Cluster Analysis**:
```typescript
interface PatternCluster {
  id: string;
  centroid: number[];           // 5D centroid coordinates
  members: string[];            // Data point IDs in cluster
  coherenceRange: {             // Score range for cluster
    min: number;
    max: number;
  };
  commonSources: string[];      // Most frequent data sources
}
```

## Advanced Analytics Features

### Time-Series Analysis

**Trend Detection**:
```typescript
getTrend(period: number = 20): 'increasing' | 'decreasing' | 'stable' {
  const recent = this.history.slice(-period);
  const firstHalf = recent.slice(0, period / 2);
  const secondHalf = recent.slice(period / 2);
  
  const difference = secondAvg - firstAvg;
  if (Math.abs(difference) < 0.05) return 'stable';
  return difference > 0 ? 'increasing' : 'decreasing';
}
```

**Seasonal Pattern Detection**:
```typescript
// Detect recurring patterns (daily, weekly, monthly)
const seasonalPeriods = [24, 168, 720]; // hours, weekly, monthly
seasonalPeriods.forEach(period => {
  const correlation = calculateAutoCorrelation(data, period);
  if (correlation > 0.7) {
    patterns.push({ type: 'seasonal', period, strength: correlation });
  }
});
```

### Real-time Analytics

**Streaming Statistics**:
```typescript
class StreamingStats {
  private count = 0;
  private mean = 0;
  private m2 = 0; // Sum of squares of differences

  update(value: number): void {
    this.count++;
    const delta = value - this.mean;
    this.mean += delta / this.count;
    const delta2 = value - this.mean;
    this.m2 += delta * delta2;
  }

  get variance(): number {
    return this.count > 1 ? this.m2 / (this.count - 1) : 0;
  }
}
```

**Incremental Learning**:
```typescript
// Update models without full retraining
updateModel(newDataPoint: FilteredDataPoint): void {
  this.predictor.addDataPoint(newDataPoint);
  this.anomalyDetector.updateBaseline(newDataPoint.coherenceScore);
  
  // Incremental clustering update
  this.clusterer.assignToNearestCluster(newDataPoint);
}
```

### Performance Optimization

**Efficient Data Structures**:
```typescript
// Circular buffer for fixed-size history
class CircularBuffer<T> {
  private buffer: T[];
  private index = 0;
  private full = false;

  constructor(private size: number) {
    this.buffer = new Array(size);
  }

  push(item: T): void {
    this.buffer[this.index] = item;
    this.index = (this.index + 1) % this.size;
    if (this.index === 0) this.full = true;
  }

  get length(): number {
    return this.full ? this.size : this.index;
  }
}
```

**Vectorized Operations**:
```typescript
// Use typed arrays for numerical computations
const scores = new Float32Array(dataPoints.length);
const predictions = new Float32Array(dataPoints.length);

// Bulk operations on arrays
function vectorMultiply(a: Float32Array, b: Float32Array): Float32Array {
  const result = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i] * b[i];
  }
  return result;
}
```

## A/B Testing Framework

### Test Configuration

```typescript
class FilterABTester {
  constructor(
    configA: FilterConfig,    // Control configuration
    configB: FilterConfig     // Test configuration
  ) {
    this.variantA = new EnhancedCoherenceFilter(configA);
    this.variantB = new EnhancedCoherenceFilter(configB);
  }

  async process(dataPoint: DataPoint): Promise<{
    variantA: FilteredDataPoint | null;
    variantB: FilteredDataPoint | null;
  }> {
    // Process same data through both variants
    const [resultA, resultB] = await Promise.all([
      this.variantA.filter(dataPoint),
      this.variantB.filter(dataPoint)
    ]);
    
    return { variantA: resultA, variantB: resultB };
  }
}
```

### Statistical Significance Testing

```typescript
// Chi-square test for categorical outcomes
function chiSquareTest(observed: number[], expected: number[]): {
  statistic: number;
  pValue: number;
  significant: boolean;
} {
  const statistic = observed.reduce((sum, obs, i) => {
    return sum + Math.pow(obs - expected[i], 2) / expected[i];
  }, 0);
  
  const pValue = 1 - chiSquareCDF(statistic, observed.length - 1);
  return {
    statistic,
    pValue,
    significant: pValue < 0.05
  };
}
```

### Test Results Analysis

```typescript
interface ABTestResults {
  duration: number;           // Test duration in minutes
  sampleSizes: {             // Sample sizes for each variant
    variantA: number;
    variantB: number;
  };
  metrics: {                 // Key performance metrics
    variantA: TestMetrics;
    variantB: TestMetrics;
  };
  significance: {            // Statistical significance
    coherenceScore: boolean;
    filterRate: boolean;
    anomalyRate: boolean;
  };
  recommendation: string;    // Which variant to choose
  confidence: number;        // Confidence level (0-1)
}
```

## Data Quality Monitoring

### Data Quality Metrics

```typescript
interface DataQualityMetrics {
  completeness: number;      // Percentage of non-null values
  consistency: number;       // Cross-source data consistency
  accuracy: number;          // Accuracy against ground truth
  timeliness: number;        // Freshness of data
  validity: number;          // Schema compliance
  uniqueness: number;        // Duplicate detection
}
```

### Drift Detection

**Concept Drift**:
```typescript
// Detect changes in data distribution
class ConceptDriftDetector {
  private referenceBatch: number[];
  private currentBatch: number[];

  detectDrift(): {
    isDrift: boolean;
    severity: 'low' | 'medium' | 'high';
    confidence: number;
  } {
    const ksStatistic = this.kolmogorovSmirnovTest();
    const isDrift = ksStatistic > this.threshold;
    
    return {
      isDrift,
      severity: this.classifySeverity(ksStatistic),
      confidence: 1 - this.calculatePValue(ksStatistic)
    };
  }
}
```

**Model Drift**:
```typescript
// Monitor model performance degradation
interface ModelDriftMetrics {
  accuracyDrift: number;     // Change in model accuracy
  predictionDrift: number;   // Change in prediction distribution  
  featureDrift: number;      // Change in input feature distribution
  lastDriftDetection: Date;  // When drift was last detected
}
```

## Visualization & Reporting

### Analytics Dashboard Widgets

**Coherence Trends**:
```typescript
// Time-series chart data
interface CoherenceTrendData {
  timestamps: Date[];
  coherenceScores: number[];
  predictions: number[];
  anomalies: boolean[];
  confidence: number[];
}
```

**Dimension Analysis**:
```typescript
// Radar chart for dimension balance
interface DimensionAnalysis {
  dimensions: ['psi', 'rho', 'q', 'f'];
  current: number[];         // Current dimension values
  optimal: number[];         // Suggested optimal values
  historical: number[][];    // Historical trends
}
```

**Performance Metrics**:
```typescript
// Performance tracking over time
interface PerformanceReport {
  timeRange: { start: Date; end: Date };
  totalDataPoints: number;
  filteredDataPoints: number;
  filterRate: number;
  averageCoherence: number;
  anomalyCount: number;
  predictionAccuracy: number;
  modelPerformance: PerformanceMetrics;
}
```

## Integration Examples

### Real-time Analytics Pipeline

```typescript
// Complete analytics integration
const analytics = new AnalyticsEngine({
  anomalyThreshold: 2.5,
  predictionHorizon: 10,
  optimizationEnabled: true
});

// Process data through analytics pipeline
collector.on('data', async (dataPoint) => {
  const filtered = await filter.filter(dataPoint);
  if (filtered) {
    // Add to predictor
    analytics.predictor.addDataPoint(filtered);
    
    // Check for anomalies
    const anomaly = analytics.anomalyDetector.detect(filtered.coherenceScore);
    if (anomaly.isAnomaly) {
      dashboard.alert(`Anomaly in ${filtered.source}: ${anomaly.reason}`);
    }
    
    // Update patterns
    analytics.clusterer.updateClusters(filtered);
    
    // Store enhanced data
    await storage.store({
      ...filtered,
      prediction: analytics.predictor.predict(filtered.source),
      cluster: analytics.clusterer.assignCluster(filtered)
    });
  }
});
```

### Batch Analytics Jobs

```typescript
// Periodic analytics jobs
cron.schedule('0 * * * *', async () => {  // Every hour
  // Recalculate clusters
  const recentData = await storage.getRecentData(1000);
  const clusters = analytics.clusterer.clusterPatterns(recentData, 5);
  
  // Update predictions
  const sources = await storage.getActiveSources();
  sources.forEach(source => {
    const prediction = analytics.predictor.predictEnsemble(source.id, 60);
    cache.set(`prediction:${source.id}`, prediction, 3600);
  });
  
  // Generate performance report
  const report = analytics.generateReport();
  await storage.saveReport(report);
});
```

---

ECNE's analytics engine transforms raw coherence filtering into an intelligent, adaptive system that learns from patterns, predicts future trends, and continuously optimizes performance based on user feedback and data quality metrics.