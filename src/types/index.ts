// Core data types
export interface DataPoint {
  id: string;
  source: string;
  timestamp: Date;
  content: any;
  metadata?: {
    apiVersion?: string;
    rateLimit?: number;
    contentType?: string;
    [key: string]: any;
  };
}

export interface CoherenceDimensions {
  psi: number;  // Internal Consistency
  rho: number;  // Accumulated Wisdom
  q: number;    // Moral Activation
  f: number;    // Social Belonging
}

export interface FilteredDataPoint extends DataPoint {
  coherenceScore: number;
  coherenceDimensions: CoherenceDimensions;
  anomaly?: {
    detected: boolean;
    type?: string;
    confidence?: number;
  };
  prediction?: {
    nextScore: number;
    confidence: number;
    horizon: number;
  };
}

// API Configuration
export interface APISource {
  id: string;
  name: string;
  baseUrl: string;
  endpoints: APIEndpoint[];
  authentication?: Authentication;
  rateLimits?: RateLimits;
  transformation?: DataTransformation;
  enabled?: boolean;
}

export interface APIEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  params?: Record<string, any>;
  body?: any;
  refreshInterval?: number; // seconds
  timeout?: number; // milliseconds
  retries?: number;
}

export interface Authentication {
  type: 'api-key' | 'bearer' | 'oauth2' | 'basic';
  apiKey?: string;
  token?: string;
  username?: string;
  password?: string;
  headerName?: string;
  paramName?: string;
}

export interface RateLimits {
  requestsPerMinute: number;
  requestsPerHour: number;
  concurrent?: number;
}

export interface DataTransformation {
  steps: TransformationStep[];
  validation?: ValidationSchema;
  errorHandling?: ErrorHandlingStrategy;
}

export interface TransformationStep {
  type: 'map' | 'filter' | 'flatten' | 'group' | 'sort' | 'custom';
  config: any;
}

export interface ValidationSchema {
  schema: Record<string, any>;
  strict?: boolean;
}

export interface ErrorHandlingStrategy {
  strategy: 'skip-invalid' | 'throw' | 'default-value';
  logErrors?: boolean;
  maxErrors?: number;
}

// Filter Configuration
export interface FilterConfig {
  sensitivity: number;
  weights: {
    psi: number;
    rho: number;
    q: number;
    f: number;
  };
  contextWindowSize?: number;
  patternHistorySize?: number;
  enableAnomalyDetection?: boolean;
  enablePrediction?: boolean;
  enableOptimization?: boolean;
}

// Analytics Types
export interface AnomalyResult {
  isAnomaly: boolean;
  score: number;
  deviation: number;
  dimension?: keyof CoherenceDimensions;
  reason?: string;
}

export interface PredictionResult {
  sourceId: string;
  timestamp: Date;
  predictedScore: number;
  confidence: number;
  method: 'exponential' | 'linear' | 'ensemble';
  horizon: number; // minutes
}

export interface PatternCluster {
  id: string;
  centroid: number[];
  members: string[];
  coherenceRange: {
    min: number;
    max: number;
  };
  commonSources: string[];
  confidence: number;
}

// Dashboard Types
export interface DashboardConfig {
  port: number;
  host: string;
  cors?: {
    origin: string | string[];
    credentials?: boolean;
  };
  ssl?: {
    cert: string;
    key: string;
  };
}

export interface WebSocketMessage {
  event: string;
  data: any;
  timestamp: Date;
}

// Error Types
export class ECNEError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'ECNEError';
  }
}

export class ValidationError extends ECNEError {
  constructor(message: string, public errors?: string[]) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends ECNEError {
  constructor(message: string, public retryAfter?: number) {
    super(message, 'RATE_LIMIT_ERROR');
    this.name = 'RateLimitError';
  }
}