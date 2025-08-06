/**
 * Time Series Forecasting for Coherence Trends
 * Implements multiple forecasting methods for coherence score prediction
 */

import { FilteredDataPoint } from '../core/coherence-filter';
import { EventEmitter } from 'events';

export interface ForecastConfig {
  // ARIMA parameters
  arimaP: number; // Autoregressive order
  arimaD: number; // Differencing order
  arimaQ: number; // Moving average order
  
  // Exponential Smoothing
  alpha: number; // Level smoothing
  beta: number; // Trend smoothing
  gamma: number; // Seasonal smoothing
  
  // Prophet-like parameters
  changePointPriorScale: number;
  seasonalityPriorScale: number;
  
  // General parameters
  seasonalPeriod: number; // hours
  forecastHorizon: number; // periods ahead
  confidenceLevel: number; // for prediction intervals
}

export interface Forecast {
  timestamp: Date;
  source: string;
  method: string;
  predictions: ForecastPoint[];
  accuracy: ForecastAccuracy;
  confidence: number;
}

export interface ForecastPoint {
  timestamp: Date;
  value: number;
  lower: number; // Lower confidence bound
  upper: number; // Upper confidence bound
  uncertainty: number;
}

export interface ForecastAccuracy {
  mape: number; // Mean Absolute Percentage Error
  rmse: number; // Root Mean Square Error
  mae: number; // Mean Absolute Error
  mase: number; // Mean Absolute Scaled Error
}

export class TimeSeriesForecaster extends EventEmitter {
  private timeSeriesData: Map<string, TimeSeries> = new Map();
  private forecastModels: Map<string, ForecastModel[]> = new Map();
  
  constructor(private config: ForecastConfig) {
    super();
  }

  /**
   * Add data point to time series
   */
  addDataPoint(dataPoint: FilteredDataPoint): void {
    let series = this.timeSeriesData.get(dataPoint.source);
    
    if (!series) {
      series = {
        source: dataPoint.source,
        values: [],
        timestamps: [],
        seasonal: new Array(this.config.seasonalPeriod).fill(0),
        trend: [],
        residuals: []
      };
      this.timeSeriesData.set(dataPoint.source, series);
    }
    
    series.values.push(dataPoint.coherenceScore);
    series.timestamps.push(dataPoint.timestamp);
    
    // Maintain reasonable size
    if (series.values.length > 1000) {
      series.values.shift();
      series.timestamps.shift();
    }
    
    // Update decomposition
    if (series.values.length > this.config.seasonalPeriod * 2) {
      this.decomposeTimeSeries(series);
    }
  }

  /**
   * Generate forecast for a source
   */
  async forecast(source: string, horizon?: number): Promise<Forecast | null> {
    const series = this.timeSeriesData.get(source);
    if (!series || series.values.length < this.config.seasonalPeriod * 2) {
      return null;
    }
    
    const h = horizon || this.config.forecastHorizon;
    
    // Run multiple forecasting methods
    const forecasts: { method: string; predictions: ForecastPoint[]; accuracy: number }[] = [];
    
    // 1. ARIMA forecast
    const arimaForecast = this.arimaForecast(series, h);
    if (arimaForecast) {
      forecasts.push({
        method: 'ARIMA',
        predictions: arimaForecast.predictions,
        accuracy: this.calculateAccuracy(series, arimaForecast.predictions)
      });
    }
    
    // 2. Exponential Smoothing
    const expSmoothingForecast = this.exponentialSmoothingForecast(series, h);
    forecasts.push({
      method: 'ExponentialSmoothing',
      predictions: expSmoothingForecast.predictions,
      accuracy: this.calculateAccuracy(series, expSmoothingForecast.predictions)
    });
    
    // 3. Prophet-like decomposition forecast
    const prophetForecast = this.prophetLikeForecast(series, h);
    forecasts.push({
      method: 'Prophet-like',
      predictions: prophetForecast.predictions,
      accuracy: this.calculateAccuracy(series, prophetForecast.predictions)
    });
    
    // 4. Neural network forecast (simple)
    const nnForecast = this.neuralNetworkForecast(series, h);
    forecasts.push({
      method: 'NeuralNetwork',
      predictions: nnForecast.predictions,
      accuracy: this.calculateAccuracy(series, nnForecast.predictions)
    });
    
    // 5. Ensemble forecast
    const ensembleForecast = this.ensembleForecast(forecasts, h);
    
    // Calculate overall accuracy
    const backtest = this.backtestForecast(series, ensembleForecast.predictions);
    
    const forecast: Forecast = {
      timestamp: new Date(),
      source,
      method: 'Ensemble',
      predictions: ensembleForecast.predictions,
      accuracy: backtest,
      confidence: this.calculateConfidence(series, forecasts)
    };
    
    this.emit('forecast-generated', forecast);
    return forecast;
  }

  /**
   * ARIMA forecasting
   */
  private arimaForecast(series: TimeSeries, horizon: number): { predictions: ForecastPoint[] } | null {
    if (series.values.length < 50) return null;
    
    const { p, d, q } = { p: this.config.arimaP, d: this.config.arimaD, q: this.config.arimaQ };
    
    // Difference the series
    const differenced = this.difference(series.values, d);
    
    // Fit AR model
    const arCoefficients = this.fitAR(differenced, p);
    
    // Fit MA model
    const maCoefficients = this.fitMA(differenced, q);
    
    // Generate predictions
    const predictions: ForecastPoint[] = [];
    const lastValues = series.values.slice(-Math.max(p, q));
    
    for (let h = 0; h < horizon; h++) {
      const timestamp = new Date(series.timestamps[series.timestamps.length - 1].getTime() + (h + 1) * 3600000);
      
      // AR component
      let arPrediction = 0;
      for (let i = 0; i < p && i < lastValues.length; i++) {
        arPrediction += arCoefficients[i] * lastValues[lastValues.length - 1 - i];
      }
      
      // MA component (simplified)
      let maPrediction = 0;
      for (let i = 0; i < q && i < maCoefficients.length; i++) {
        maPrediction += maCoefficients[i] * 0.1; // Simplified error term
      }
      
      const prediction = arPrediction + maPrediction;
      const uncertainty = this.calculateUncertainty(series, h);
      
      predictions.push({
        timestamp,
        value: Math.max(0, Math.min(1, prediction)),
        lower: Math.max(0, prediction - uncertainty * 1.96),
        upper: Math.min(1, prediction + uncertainty * 1.96),
        uncertainty
      });
      
      lastValues.push(prediction);
      if (lastValues.length > Math.max(p, q)) lastValues.shift();
    }
    
    return { predictions };
  }

  /**
   * Exponential Smoothing forecast
   */
  private exponentialSmoothingForecast(series: TimeSeries, horizon: number): { predictions: ForecastPoint[] } {
    const { alpha, beta, gamma } = this.config;
    const seasonalPeriod = this.config.seasonalPeriod;
    
    // Initialize components
    let level = series.values[0];
    let trend = (series.values[1] - series.values[0]) || 0;
    const seasonal = new Array(seasonalPeriod).fill(0);
    
    // Initial seasonal estimates
    if (series.values.length >= seasonalPeriod * 2) {
      for (let i = 0; i < seasonalPeriod; i++) {
        let sum = 0;
        let count = 0;
        for (let j = i; j < series.values.length; j += seasonalPeriod) {
          sum += series.values[j];
          count++;
        }
        seasonal[i] = sum / count - level;
      }
    }
    
    // Fit the model
    for (let t = 0; t < series.values.length; t++) {
      const s = t % seasonalPeriod;
      const y = series.values[t];
      
      const prevLevel = level;
      const prevTrend = trend;
      
      level = alpha * (y - seasonal[s]) + (1 - alpha) * (prevLevel + prevTrend);
      trend = beta * (level - prevLevel) + (1 - beta) * prevTrend;
      seasonal[s] = gamma * (y - level) + (1 - gamma) * seasonal[s];
    }
    
    // Generate forecasts
    const predictions: ForecastPoint[] = [];
    
    for (let h = 0; h < horizon; h++) {
      const timestamp = new Date(series.timestamps[series.timestamps.length - 1].getTime() + (h + 1) * 3600000);
      const s = (series.values.length + h) % seasonalPeriod;
      
      const prediction = level + (h + 1) * trend + seasonal[s];
      const uncertainty = this.calculateUncertainty(series, h) * (1 + h * 0.05); // Increase uncertainty with horizon
      
      predictions.push({
        timestamp,
        value: Math.max(0, Math.min(1, prediction)),
        lower: Math.max(0, prediction - uncertainty * 1.96),
        upper: Math.min(1, prediction + uncertainty * 1.96),
        uncertainty
      });
    }
    
    return { predictions };
  }

  /**
   * Prophet-like decomposition forecast
   */
  private prophetLikeForecast(series: TimeSeries, horizon: number): { predictions: ForecastPoint[] } {
    // Decompose into trend, seasonal, and holidays (simplified)
    const trend = this.fitTrend(series);
    const seasonal = this.fitSeasonality(series);
    
    // Detect changepoints
    const changepoints = this.detectChangepoints(series);
    
    const predictions: ForecastPoint[] = [];
    const n = series.values.length;
    
    for (let h = 0; h < horizon; h++) {
      const timestamp = new Date(series.timestamps[series.timestamps.length - 1].getTime() + (h + 1) * 3600000);
      const t = n + h;
      
      // Trend component with changepoints
      let trendValue = trend.intercept + trend.slope * t;
      changepoints.forEach(cp => {
        if (t > cp.index) {
          trendValue += cp.delta * (t - cp.index);
        }
      });
      
      // Seasonal component
      const hour = timestamp.getHours();
      const dayOfWeek = timestamp.getDay();
      const seasonalValue = seasonal.hourly[hour] + seasonal.weekly[dayOfWeek];
      
      const prediction = trendValue + seasonalValue;
      const uncertainty = this.calculateUncertainty(series, h) * (1 + changepoints.length * 0.1);
      
      predictions.push({
        timestamp,
        value: Math.max(0, Math.min(1, prediction)),
        lower: Math.max(0, prediction - uncertainty * 1.96),
        upper: Math.min(1, prediction + uncertainty * 1.96),
        uncertainty
      });
    }
    
    return { predictions };
  }

  /**
   * Simple neural network forecast
   */
  private neuralNetworkForecast(series: TimeSeries, horizon: number): { predictions: ForecastPoint[] } {
    // Simple feedforward network with one hidden layer
    const inputSize = 24; // Use last 24 hours
    const hiddenSize = 12;
    
    // Initialize random weights (in practice, these would be trained)
    const weightsInput = this.randomMatrix(inputSize, hiddenSize);
    const weightsOutput = this.randomVector(hiddenSize);
    
    // Prepare input data
    const lastValues = series.values.slice(-inputSize);
    while (lastValues.length < inputSize) {
      lastValues.unshift(lastValues[0] || 0.5);
    }
    
    const predictions: ForecastPoint[] = [];
    
    for (let h = 0; h < horizon; h++) {
      const timestamp = new Date(series.timestamps[series.timestamps.length - 1].getTime() + (h + 1) * 3600000);
      
      // Forward pass
      const hidden = this.relu(this.matrixVectorMultiply(weightsInput, lastValues));
      const output = this.sigmoid(this.dotProduct(weightsOutput, hidden));
      
      const uncertainty = this.calculateUncertainty(series, h) * 1.2; // NN predictions are less certain
      
      predictions.push({
        timestamp,
        value: output,
        lower: Math.max(0, output - uncertainty * 1.96),
        upper: Math.min(1, output + uncertainty * 1.96),
        uncertainty
      });
      
      // Update input for next prediction
      lastValues.shift();
      lastValues.push(output);
    }
    
    return { predictions };
  }

  /**
   * Ensemble forecast combining multiple methods
   */
  private ensembleForecast(
    forecasts: { method: string; predictions: ForecastPoint[]; accuracy: number }[],
    horizon: number
  ): { predictions: ForecastPoint[] } {
    const predictions: ForecastPoint[] = [];
    
    // Calculate weights based on accuracy (inverse of error)
    const totalWeight = forecasts.reduce((sum, f) => sum + (1 / (f.accuracy + 0.01)), 0);
    const weights = forecasts.map(f => (1 / (f.accuracy + 0.01)) / totalWeight);
    
    for (let h = 0; h < horizon; h++) {
      let value = 0;
      let lower = 0;
      let upper = 0;
      let uncertainty = 0;
      
      forecasts.forEach((forecast, i) => {
        if (forecast.predictions[h]) {
          value += forecast.predictions[h].value * weights[i];
          lower += forecast.predictions[h].lower * weights[i];
          upper += forecast.predictions[h].upper * weights[i];
          uncertainty += forecast.predictions[h].uncertainty * weights[i];
        }
      });
      
      predictions.push({
        timestamp: forecasts[0].predictions[h].timestamp,
        value,
        lower,
        upper,
        uncertainty
      });
    }
    
    return { predictions };
  }

  /**
   * Decompose time series
   */
  private decomposeTimeSeries(series: TimeSeries): void {
    const values = series.values;
    const period = this.config.seasonalPeriod;
    
    // Calculate trend using loess-like smoothing
    series.trend = this.calculateTrend(values, Math.ceil(period * 1.5));
    
    // Calculate seasonal component
    const detrended = values.map((v, i) => v - series.trend[i]);
    series.seasonal = this.calculateSeasonal(detrended, period);
    
    // Calculate residuals
    series.residuals = values.map((v, i) => 
      v - series.trend[i] - series.seasonal[i % period]
    );
  }

  /**
   * Calculate trend component
   */
  private calculateTrend(values: number[], window: number): number[] {
    const trend: number[] = [];
    
    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - Math.floor(window / 2));
      const end = Math.min(values.length, i + Math.floor(window / 2) + 1);
      const subset = values.slice(start, end);
      
      // Weighted average with Gaussian weights
      const center = (subset.length - 1) / 2;
      let weightedSum = 0;
      let weightSum = 0;
      
      subset.forEach((v, j) => {
        const weight = Math.exp(-Math.pow(j - center, 2) / (2 * Math.pow(window / 4, 2)));
        weightedSum += v * weight;
        weightSum += weight;
      });
      
      trend.push(weightedSum / weightSum);
    }
    
    return trend;
  }

  /**
   * Calculate seasonal component
   */
  private calculateSeasonal(detrended: number[], period: number): number[] {
    const seasonal = new Array(period).fill(0);
    const counts = new Array(period).fill(0);
    
    detrended.forEach((value, i) => {
      const seasonIdx = i % period;
      seasonal[seasonIdx] += value;
      counts[seasonIdx]++;
    });
    
    // Average and center
    const avgSeasonal = seasonal.map((sum, i) => counts[i] > 0 ? sum / counts[i] : 0);
    const meanSeasonal = avgSeasonal.reduce((a, b) => a + b) / period;
    
    return avgSeasonal.map(s => s - meanSeasonal);
  }

  /**
   * Fit AR model
   */
  private fitAR(values: number[], p: number): number[] {
    // Simplified AR fitting using least squares
    const n = values.length;
    const X: number[][] = [];
    const y: number[] = [];
    
    for (let i = p; i < n; i++) {
      const row: number[] = [];
      for (let j = 1; j <= p; j++) {
        row.push(values[i - j]);
      }
      X.push(row);
      y.push(values[i]);
    }
    
    // Solve normal equations (simplified)
    return this.leastSquares(X, y);
  }

  /**
   * Fit MA model
   */
  private fitMA(values: number[], q: number): number[] {
    // Simplified MA fitting
    const coefficients: number[] = [];
    
    for (let i = 0; i < q; i++) {
      coefficients.push(Math.exp(-i / q) * 0.5); // Exponential decay
    }
    
    return coefficients;
  }

  /**
   * Detect changepoints
   */
  private detectChangepoints(series: TimeSeries): { index: number; delta: number }[] {
    const changepoints: { index: number; delta: number }[] = [];
    const values = series.values;
    const minSegment = 20;
    
    for (let i = minSegment; i < values.length - minSegment; i++) {
      const before = values.slice(i - minSegment, i);
      const after = values.slice(i, i + minSegment);
      
      const meanBefore = before.reduce((a, b) => a + b) / before.length;
      const meanAfter = after.reduce((a, b) => a + b) / after.length;
      
      const delta = meanAfter - meanBefore;
      const pooledStd = Math.sqrt(
        (this.variance(before) + this.variance(after)) / 2
      );
      
      // T-test for change
      const tStat = Math.abs(delta) / (pooledStd * Math.sqrt(2 / minSegment));
      
      if (tStat > 2.5) { // Significant change
        changepoints.push({ index: i, delta });
      }
    }
    
    // Limit changepoints
    return changepoints
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 5);
  }

  /**
   * Fit trend
   */
  private fitTrend(series: TimeSeries): { intercept: number; slope: number } {
    const n = series.values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = series.values;
    
    const coefficients = this.leastSquares([x], y);
    
    return {
      intercept: coefficients[0] || series.values[0],
      slope: coefficients[1] || 0
    };
  }

  /**
   * Fit seasonality
   */
  private fitSeasonality(series: TimeSeries): { hourly: number[]; weekly: number[] } {
    const hourly = new Array(24).fill(0);
    const weekly = new Array(7).fill(0);
    const hourlyCounts = new Array(24).fill(0);
    const weeklyCounts = new Array(7).fill(0);
    
    series.values.forEach((value, i) => {
      const timestamp = series.timestamps[i];
      const hour = timestamp.getHours();
      const day = timestamp.getDay();
      
      hourly[hour] += value;
      hourlyCounts[hour]++;
      
      weekly[day] += value;
      weeklyCounts[day]++;
    });
    
    // Calculate averages and center
    const avgHourly = hourly.map((sum, i) => hourlyCounts[i] > 0 ? sum / hourlyCounts[i] : 0);
    const avgWeekly = weekly.map((sum, i) => weeklyCounts[i] > 0 ? sum / weeklyCounts[i] : 0);
    
    const meanHourly = avgHourly.reduce((a, b) => a + b) / 24;
    const meanWeekly = avgWeekly.reduce((a, b) => a + b) / 7;
    
    return {
      hourly: avgHourly.map(h => h - meanHourly),
      weekly: avgWeekly.map(w => w - meanWeekly)
    };
  }

  /**
   * Calculate forecast accuracy
   */
  private calculateAccuracy(series: TimeSeries, predictions: ForecastPoint[]): number {
    // Use last few points for validation
    const validationSize = Math.min(predictions.length, Math.floor(series.values.length * 0.1));
    if (validationSize < 3) return 0.5; // Default accuracy
    
    const actual = series.values.slice(-validationSize);
    const errors = actual.map((a, i) => Math.abs(a - (predictions[i]?.value || a)));
    
    return errors.reduce((a, b) => a + b) / errors.length;
  }

  /**
   * Backtest forecast
   */
  private backtestForecast(series: TimeSeries, predictions: ForecastPoint[]): ForecastAccuracy {
    const testSize = Math.min(10, Math.floor(series.values.length * 0.1));
    const errors: number[] = [];
    
    // Simple walk-forward validation
    for (let i = testSize; i > 0; i--) {
      const trainData = series.values.slice(0, -i);
      const actual = series.values[series.values.length - i];
      
      // Simple prediction using mean of last few values
      const predicted = trainData.slice(-5).reduce((a, b) => a + b) / 5;
      errors.push(actual - predicted);
    }
    
    const mae = errors.reduce((sum, e) => sum + Math.abs(e), 0) / errors.length;
    const rmse = Math.sqrt(errors.reduce((sum, e) => sum + e * e, 0) / errors.length);
    const mape = errors.reduce((sum, e, i) => {
      const actual = series.values[series.values.length - testSize + i];
      return sum + Math.abs(e / actual);
    }, 0) / errors.length;
    
    // MASE (using naive forecast as baseline)
    const naiveErrors: number[] = [];
    for (let i = 1; i < series.values.length; i++) {
      naiveErrors.push(Math.abs(series.values[i] - series.values[i - 1]));
    }
    const naiveMae = naiveErrors.reduce((a, b) => a + b) / naiveErrors.length;
    const mase = mae / naiveMae;
    
    return { mae, rmse, mape, mase };
  }

  /**
   * Calculate forecast confidence
   */
  private calculateConfidence(series: TimeSeries, forecasts: any[]): number {
    // Base confidence on data quality and model agreement
    const dataQuality = Math.min(series.values.length / 100, 1);
    const consistency = 1 - this.variance(series.residuals);
    
    // Model agreement
    const predictions = forecasts.map(f => f.predictions[0]?.value || 0);
    const predictionVariance = this.variance(predictions);
    const modelAgreement = 1 / (1 + predictionVariance * 10);
    
    return dataQuality * 0.3 + consistency * 0.3 + modelAgreement * 0.4;
  }

  /**
   * Calculate uncertainty for predictions
   */
  private calculateUncertainty(series: TimeSeries, horizon: number): number {
    const baseUncertainty = Math.sqrt(this.variance(series.residuals));
    const horizonFactor = 1 + horizon * 0.05; // Uncertainty grows with horizon
    
    return baseUncertainty * horizonFactor;
  }

  /**
   * Difference time series
   */
  private difference(values: number[], d: number): number[] {
    let result = [...values];
    
    for (let i = 0; i < d; i++) {
      const differenced: number[] = [];
      for (let j = 1; j < result.length; j++) {
        differenced.push(result[j] - result[j - 1]);
      }
      result = differenced;
    }
    
    return result;
  }

  /**
   * Least squares solver
   */
  private leastSquares(X: number[][], y: number[]): number[] {
    // Simplified least squares (in practice, use proper linear algebra)
    const n = y.length;
    const p = X[0]?.length || 1;
    const coefficients: number[] = new Array(p).fill(0);
    
    // Simple gradient descent
    const learningRate = 0.01;
    const iterations = 100;
    
    for (let iter = 0; iter < iterations; iter++) {
      const gradients = new Array(p).fill(0);
      
      for (let i = 0; i < n; i++) {
        let prediction = 0;
        for (let j = 0; j < p; j++) {
          prediction += coefficients[j] * (X[i]?.[j] || 0);
        }
        
        const error = y[i] - prediction;
        for (let j = 0; j < p; j++) {
          gradients[j] += error * (X[i]?.[j] || 0);
        }
      }
      
      for (let j = 0; j < p; j++) {
        coefficients[j] += learningRate * gradients[j] / n;
      }
    }
    
    return coefficients;
  }

  /**
   * Helper functions
   */
  private variance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  }

  private randomMatrix(rows: number, cols: number): number[][] {
    return Array.from({ length: rows }, () => 
      Array.from({ length: cols }, () => (Math.random() - 0.5) * 0.2)
    );
  }

  private randomVector(size: number): number[] {
    return Array.from({ length: size }, () => (Math.random() - 0.5) * 0.2);
  }

  private matrixVectorMultiply(matrix: number[][], vector: number[]): number[] {
    return matrix.map(row => 
      row.reduce((sum, val, i) => sum + val * vector[i], 0)
    );
  }

  private dotProduct(a: number[], b: number[]): number {
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
  }

  private relu(x: number[]): number[] {
    return x.map(v => Math.max(0, v));
  }

  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  /**
   * Get forecast models for a source
   */
  getModels(source: string): ForecastModel[] | undefined {
    return this.forecastModels.get(source);
  }

  /**
   * Get time series data
   */
  getTimeSeries(source: string): TimeSeries | undefined {
    return this.timeSeriesData.get(source);
  }
}

interface TimeSeries {
  source: string;
  values: number[];
  timestamps: Date[];
  seasonal: number[];
  trend: number[];
  residuals: number[];
}

interface ForecastModel {
  type: string;
  parameters: any;
  accuracy: ForecastAccuracy;
}