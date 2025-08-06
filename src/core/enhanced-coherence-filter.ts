/**
 * Enhanced ECNE Coherence Filter with Plugin Support
 * Extends the base filter with plugin capabilities
 */

import { CoherenceFilter, FilterConfig, DataPoint, FilteredDataPoint, CoherenceDimensions } from './coherence-filter';
import { PluginManager } from '../plugins/plugin-manager';

export interface ExtendedCoherenceDimensions extends CoherenceDimensions {
  custom?: Record<string, number>;
}

export interface ExtendedFilteredDataPoint extends FilteredDataPoint {
  coherenceDimensions: ExtendedCoherenceDimensions;
  customDimensions?: Record<string, number>;
}

export interface EnhancedFilterConfig extends FilterConfig {
  customWeights?: Record<string, number>;
  pluginManager?: PluginManager;
}

export class EnhancedCoherenceFilter extends CoherenceFilter {
  private pluginManager?: PluginManager;
  private customWeights: Record<string, number> = {};

  constructor(config: EnhancedFilterConfig) {
    super(config);
    this.pluginManager = config.pluginManager;
    this.customWeights = config.customWeights || {};
  }

  /**
   * Enhanced filter with plugin support
   */
  async filter(dataPoint: DataPoint): Promise<ExtendedFilteredDataPoint | null> {
    // Apply pre-processing plugins
    let processedDataPoint = dataPoint;
    if (this.pluginManager) {
      processedDataPoint = await this.pluginManager.applyPreProcessing(dataPoint);
      this.pluginManager.updateContext(processedDataPoint);
    }

    // Calculate base coherence dimensions
    const baseDimensions = await this.calculateBaseCoherence(processedDataPoint);
    
    // Calculate custom dimensions from plugins
    const customDimensions = this.pluginManager 
      ? await this.pluginManager.calculateCustomDimensions(processedDataPoint)
      : {};

    // Enhance coherence with plugins
    let enhancedDimensions = baseDimensions;
    if (this.pluginManager) {
      enhancedDimensions = await this.pluginManager.enhanceCoherence(baseDimensions, processedDataPoint);
    }

    // Create extended dimensions
    const extendedDimensions: ExtendedCoherenceDimensions = {
      ...enhancedDimensions,
      custom: customDimensions
    };

    // Calculate combined score
    const score = this.calculateCombinedScore(extendedDimensions);

    if (score >= this.config.sensitivity) {
      this.updateContext(processedDataPoint);
      this.updatePatterns(processedDataPoint);

      let filteredPoint: ExtendedFilteredDataPoint = {
        ...processedDataPoint,
        coherenceScore: score,
        coherenceDimensions: extendedDimensions,
        customDimensions,
        relevanceReason: this.generateExtendedRelevanceReasons(extendedDimensions)
      };

      // Apply post-processing plugins
      if (this.pluginManager) {
        filteredPoint = await this.pluginManager.applyPostProcessing(filteredPoint) as ExtendedFilteredDataPoint;
      }

      return filteredPoint;
    }

    return null;
  }

  /**
   * Calculate base coherence (without custom dimensions)
   */
  private async calculateBaseCoherence(dataPoint: DataPoint): Promise<CoherenceDimensions> {
    return super['calculateCoherence'](dataPoint);
  }

  /**
   * Calculate combined score including custom dimensions
   */
  private calculateCombinedScore(dimensions: ExtendedCoherenceDimensions): number {
    // Base score from standard dimensions
    const baseScore = super['calculateWeightedScore'](dimensions);
    
    // Add custom dimension scores
    let customScore = 0;
    let customWeightSum = 0;
    
    if (dimensions.custom) {
      for (const [key, value] of Object.entries(dimensions.custom)) {
        const weight = this.customWeights[key] || this.getDefaultCustomWeight(key);
        customScore += value * weight;
        customWeightSum += weight;
      }
    }

    // Normalize weights
    const baseWeightSum = Object.values(this.config.weights).reduce((a, b) => a + b, 0);
    const totalWeightSum = baseWeightSum + customWeightSum;
    
    if (totalWeightSum === 0) return 0;
    
    return (baseScore * baseWeightSum + customScore) / totalWeightSum;
  }

  /**
   * Get default weight for custom dimension
   */
  private getDefaultCustomWeight(dimensionKey: string): number {
    if (this.pluginManager) {
      const plugin = this.pluginManager.getCustomDimensions().get(dimensionKey);
      if (plugin) {
        return plugin.getDefaultWeight();
      }
    }
    return 0.1; // Default 10% weight
  }

  /**
   * Generate extended relevance reasons including custom dimensions
   */
  private generateExtendedRelevanceReasons(dimensions: ExtendedCoherenceDimensions): string[] {
    const reasons = super['generateRelevanceReasons'](dimensions);
    
    // Add custom dimension reasons
    if (dimensions.custom && this.pluginManager) {
      const customDimensions = this.pluginManager.getCustomDimensions();
      
      for (const [key, value] of Object.entries(dimensions.custom)) {
        if (value > 0.7) {
          const plugin = customDimensions.get(key);
          if (plugin) {
            reasons.push(plugin.explainHighValue(value));
          }
        }
      }
    }
    
    return reasons;
  }

  /**
   * Update custom weights
   */
  updateCustomWeights(weights: Record<string, number>): void {
    this.customWeights = { ...this.customWeights, ...weights };
  }

  /**
   * Set plugin manager
   */
  setPluginManager(pluginManager: PluginManager): void {
    this.pluginManager = pluginManager;
  }

  /**
   * Get extended statistics
   */
  getExtendedStatistics(): any {
    const baseStats = super.getStatistics();
    
    return {
      ...baseStats,
      customDimensions: this.pluginManager 
        ? Array.from(this.pluginManager.getCustomDimensions().keys())
        : [],
      customWeights: this.customWeights
    };
  }
}