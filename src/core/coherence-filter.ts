/**
 * ECNE Coherence Filter
 * Implements GCT-based filtering for data streams
 */

export interface CoherenceDimensions {
  psi: number;    // Internal Consistency (0-1)
  rho: number;    // Accumulated Wisdom (0-1)
  q: number;      // Moral Activation (0-1)
  f: number;      // Social Belonging (0-1)
}

export interface CoherenceWeights extends CoherenceDimensions {}

export interface DataPoint {
  id: string;
  source: string;
  timestamp: Date;
  content: any;
  metadata?: Record<string, any>;
}

export interface FilteredDataPoint extends DataPoint {
  coherenceScore: number;
  coherenceDimensions: CoherenceDimensions;
  relevanceReason: string[];
}

export interface FilterConfig {
  sensitivity: number;           // 0-1, threshold for inclusion
  weights: CoherenceWeights;     // Dimension weights
  contextWindow: number;         // Minutes to consider for context
  patternMemory: number;         // How many patterns to remember
}

export class CoherenceFilter {
  private config: FilterConfig;
  private contextBuffer: DataPoint[] = [];
  private patternHistory: Map<string, number> = new Map();
  private wisdomBase: Map<string, any> = new Map();

  constructor(config: FilterConfig) {
    this.config = {
      sensitivity: config.sensitivity || 0.5,
      weights: config.weights || {
        psi: 0.25,
        rho: 0.25,
        q: 0.25,
        f: 0.25
      },
      contextWindow: config.contextWindow || 60,
      patternMemory: config.patternMemory || 1000
    };
  }

  /**
   * Process a data point through coherence filtering
   */
  async filter(dataPoint: DataPoint): Promise<FilteredDataPoint | null> {
    const dimensions = await this.calculateCoherence(dataPoint);
    const score = this.calculateWeightedScore(dimensions);

    if (score >= this.config.sensitivity) {
      this.updateContext(dataPoint);
      this.updatePatterns(dataPoint);

      return {
        ...dataPoint,
        coherenceScore: score,
        coherenceDimensions: dimensions,
        relevanceReason: this.generateRelevanceReasons(dimensions)
      };
    }

    return null;
  }

  /**
   * Calculate coherence dimensions for a data point
   */
  private async calculateCoherence(dataPoint: DataPoint): Promise<CoherenceDimensions> {
    return {
      psi: await this.calculateInternalConsistency(dataPoint),
      rho: await this.calculateAccumulatedWisdom(dataPoint),
      q: await this.calculateMoralActivation(dataPoint),
      f: await this.calculateSocialBelonging(dataPoint)
    };
  }

  /**
   * Ψ (Psi) - Internal Consistency
   * Measures how well the data aligns with recent context
   */
  private async calculateInternalConsistency(dataPoint: DataPoint): Promise<number> {
    if (this.contextBuffer.length === 0) return 0.5;

    // Check consistency with recent data points
    const recentContext = this.getRecentContext();
    let consistencyScore = 0;

    // Compare with recent patterns
    for (const contextPoint of recentContext) {
      const similarity = this.calculateSimilarity(dataPoint, contextPoint);
      consistencyScore += similarity;
    }

    return Math.min(consistencyScore / recentContext.length, 1);
  }

  /**
   * ρ (Rho) - Accumulated Wisdom
   * Measures alignment with historical patterns
   */
  private async calculateAccumulatedWisdom(dataPoint: DataPoint): Promise<number> {
    const pattern = this.extractPattern(dataPoint);
    const historicalFrequency = this.patternHistory.get(pattern) || 0;
    
    // Normalize based on pattern memory size
    const normalizedFrequency = historicalFrequency / Math.max(this.patternHistory.size, 1);
    
    // Apply sigmoid to create smooth 0-1 range
    return 1 / (1 + Math.exp(-5 * (normalizedFrequency - 0.1)));
  }

  /**
   * q (Q) - Moral Activation
   * Measures value alignment and ethical relevance
   */
  private async calculateMoralActivation(dataPoint: DataPoint): Promise<number> {
    // Keywords indicating moral/ethical content
    const moralKeywords = [
      'ethics', 'moral', 'right', 'wrong', 'justice', 'fairness',
      'help', 'harm', 'care', 'protect', 'value', 'principle',
      'responsibility', 'duty', 'integrity', 'honest'
    ];

    const content = JSON.stringify(dataPoint.content).toLowerCase();
    let activationScore = 0;

    for (const keyword of moralKeywords) {
      if (content.includes(keyword)) {
        activationScore += 0.1;
      }
    }

    return Math.min(activationScore, 1);
  }

  /**
   * f (F) - Social Belonging
   * Measures community relevance and social patterns
   */
  private async calculateSocialBelonging(dataPoint: DataPoint): Promise<number> {
    // Keywords indicating social content
    const socialKeywords = [
      'community', 'together', 'social', 'group', 'team', 'collaborate',
      'share', 'connect', 'relationship', 'network', 'friend', 'support',
      'belong', 'include', 'participate'
    ];

    const content = JSON.stringify(dataPoint.content).toLowerCase();
    let socialScore = 0;

    for (const keyword of socialKeywords) {
      if (content.includes(keyword)) {
        socialScore += 0.1;
      }
    }

    // Check for social patterns in metadata
    if (dataPoint.metadata?.social_engagement) {
      socialScore += 0.3;
    }

    return Math.min(socialScore, 1);
  }

  /**
   * Calculate weighted coherence score
   */
  private calculateWeightedScore(dimensions: CoherenceDimensions): number {
    const { weights } = this.config;
    return (
      dimensions.psi * weights.psi +
      dimensions.rho * weights.rho +
      dimensions.q * weights.q +
      dimensions.f * weights.f
    );
  }

  /**
   * Calculate similarity between two data points
   */
  private calculateSimilarity(a: DataPoint, b: DataPoint): number {
    // Simple similarity based on source and content structure
    let similarity = 0;
    
    if (a.source === b.source) similarity += 0.3;
    
    // Content similarity (simplified)
    const aKeys = Object.keys(a.content || {});
    const bKeys = Object.keys(b.content || {});
    const commonKeys = aKeys.filter(k => bKeys.includes(k));
    
    similarity += (commonKeys.length / Math.max(aKeys.length, bKeys.length)) * 0.7;
    
    return similarity;
  }

  /**
   * Extract pattern signature from data point
   */
  private extractPattern(dataPoint: DataPoint): string {
    return `${dataPoint.source}:${Object.keys(dataPoint.content || {}).sort().join(',')}`;
  }

  /**
   * Get recent context within time window
   */
  private getRecentContext(): DataPoint[] {
    const cutoff = new Date(Date.now() - this.config.contextWindow * 60 * 1000);
    return this.contextBuffer.filter(dp => dp.timestamp > cutoff);
  }

  /**
   * Update context buffer
   */
  private updateContext(dataPoint: DataPoint): void {
    this.contextBuffer.push(dataPoint);
    
    // Clean old context
    const cutoff = new Date(Date.now() - this.config.contextWindow * 60 * 1000);
    this.contextBuffer = this.contextBuffer.filter(dp => dp.timestamp > cutoff);
  }

  /**
   * Update pattern history
   */
  private updatePatterns(dataPoint: DataPoint): void {
    const pattern = this.extractPattern(dataPoint);
    const count = this.patternHistory.get(pattern) || 0;
    this.patternHistory.set(pattern, count + 1);
    
    // Limit pattern memory
    if (this.patternHistory.size > this.config.patternMemory) {
      // Remove oldest patterns
      const entries = Array.from(this.patternHistory.entries());
      entries.sort((a, b) => a[1] - b[1]);
      this.patternHistory.delete(entries[0][0]);
    }
  }

  /**
   * Generate human-readable relevance reasons
   */
  private generateRelevanceReasons(dimensions: CoherenceDimensions): string[] {
    const reasons: string[] = [];
    
    if (dimensions.psi > 0.7) reasons.push('High consistency with recent data');
    if (dimensions.rho > 0.7) reasons.push('Matches historical patterns');
    if (dimensions.q > 0.7) reasons.push('Contains value-relevant content');
    if (dimensions.f > 0.7) reasons.push('Strong social relevance');
    
    return reasons;
  }

  /**
   * Update filter configuration
   */
  updateConfig(config: Partial<FilterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current filter statistics
   */
  getStatistics(): {
    contextSize: number;
    patternCount: number;
    config: FilterConfig;
  } {
    return {
      contextSize: this.contextBuffer.length,
      patternCount: this.patternHistory.size,
      config: this.config
    };
  }
}