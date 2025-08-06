/**
 * ECNE Plugin System Interface
 * Allows extensibility through custom coherence dimensions, data extractors, and visualizations
 */

import { DataPoint, FilteredDataPoint, CoherenceDimensions } from '../core/coherence-filter';

/**
 * Base plugin interface
 */
export interface Plugin {
  name: string;
  version: string;
  description: string;
  author?: string;
  enabled: boolean;
}

/**
 * Custom coherence dimension plugin
 */
export interface CoherenceDimensionPlugin extends Plugin {
  type: 'coherence-dimension';
  dimensionKey: string;
  dimensionName: string;
  
  /**
   * Calculate the custom coherence dimension value
   * @returns Value between 0 and 1
   */
  calculate(dataPoint: DataPoint, context: PluginContext): Promise<number>;
  
  /**
   * Get default weight for this dimension
   */
  getDefaultWeight(): number;
  
  /**
   * Generate human-readable explanation for high values
   */
  explainHighValue(value: number): string;
}

/**
 * Data extractor plugin for custom data sources
 */
export interface DataExtractorPlugin extends Plugin {
  type: 'data-extractor';
  sourceType: string;
  
  /**
   * Extract data from a custom source
   */
  extract(config: ExtractorConfig): AsyncIterableIterator<DataPoint>;
  
  /**
   * Validate extractor configuration
   */
  validateConfig(config: ExtractorConfig): ValidationResult;
  
  /**
   * Get rate limit recommendations
   */
  getRateLimitConfig(): RateLimitConfig;
}

/**
 * Visualization plugin for custom dashboard components
 */
export interface VisualizationPlugin extends Plugin {
  type: 'visualization';
  componentName: string;
  
  /**
   * Render configuration for the visualization
   */
  getRenderConfig(): VisualizationConfig;
  
  /**
   * Transform data for visualization
   */
  transformData(data: FilteredDataPoint[]): any;
  
  /**
   * Get supported export formats
   */
  getSupportedExports(): ExportFormat[];
}

/**
 * Filter enhancement plugin
 */
export interface FilterEnhancementPlugin extends Plugin {
  type: 'filter-enhancement';
  
  /**
   * Pre-process data before coherence calculation
   */
  preProcess?(dataPoint: DataPoint): Promise<DataPoint>;
  
  /**
   * Post-process filtered data
   */
  postProcess?(dataPoint: FilteredDataPoint): Promise<FilteredDataPoint>;
  
  /**
   * Enhance coherence calculation
   */
  enhanceCoherence?(dimensions: CoherenceDimensions, dataPoint: DataPoint): Promise<CoherenceDimensions>;
}

/**
 * Plugin context provided to plugins
 */
export interface PluginContext {
  // Access to recent data points for context
  getRecentDataPoints(count: number): DataPoint[];
  
  // Access to historical patterns
  getPatternHistory(pattern: string): number;
  
  // Access to configuration
  getConfig(): any;
  
  // Logging
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): void;
  
  // Metrics
  recordMetric(name: string, value: number, tags?: Record<string, string>): void;
}

/**
 * Extractor configuration
 */
export interface ExtractorConfig {
  endpoint?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, any>;
  polling?: {
    interval: number;
    enabled: boolean;
  };
  [key: string]: any;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour?: number;
  concurrentRequests: number;
  retryAfter?: number;
}

/**
 * Visualization configuration
 */
export interface VisualizationConfig {
  chartType: 'line' | 'bar' | 'scatter' | 'heatmap' | 'network' | 'custom';
  dimensions: {
    width: number;
    height: number;
  };
  options: Record<string, any>;
  requiresData: string[]; // Required data fields
}

/**
 * Export format
 */
export interface ExportFormat {
  format: 'csv' | 'json' | 'pdf' | 'png' | 'svg';
  name: string;
  mimeType: string;
}

/**
 * Plugin manifest for loading
 */
export interface PluginManifest {
  plugins: Array<
    | CoherenceDimensionPlugin
    | DataExtractorPlugin
    | VisualizationPlugin
    | FilterEnhancementPlugin
  >;
}

/**
 * Plugin lifecycle hooks
 */
export interface PluginLifecycle {
  /**
   * Called when plugin is loaded
   */
  onLoad?(context: PluginContext): Promise<void>;
  
  /**
   * Called when plugin is enabled
   */
  onEnable?(context: PluginContext): Promise<void>;
  
  /**
   * Called when plugin is disabled
   */
  onDisable?(context: PluginContext): Promise<void>;
  
  /**
   * Called when plugin is unloaded
   */
  onUnload?(context: PluginContext): Promise<void>;
}

/**
 * Type guards for plugin types
 */
export function isCoherenceDimensionPlugin(plugin: Plugin): plugin is CoherenceDimensionPlugin {
  return plugin.type === 'coherence-dimension';
}

export function isDataExtractorPlugin(plugin: Plugin): plugin is DataExtractorPlugin {
  return plugin.type === 'data-extractor';
}

export function isVisualizationPlugin(plugin: Plugin): plugin is VisualizationPlugin {
  return plugin.type === 'visualization';
}

export function isFilterEnhancementPlugin(plugin: Plugin): plugin is FilterEnhancementPlugin {
  return plugin.type === 'filter-enhancement';
}