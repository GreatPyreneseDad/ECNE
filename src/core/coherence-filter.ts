/**
 * ECNE Coherence Filter
 * Implements GCT-based filtering for data streams
 */

export interface CoherenceDimensions {
  psi: number;    // Base clarity/precision (0-1)
  rho: number;    // Reflective depth/wisdom (0-1)
  q_raw: number;  // Raw emotional charge (0-1)
  q_opt: number;  // Optimized emotional charge (calculated)
  f: number;      // Social belonging signal (0-1)
}

export interface GCTParameters {
  km: number;              // Saturation constant for wisdom (default: 0.3)
  ki: number;              // Inhibition constant for wisdom (default: 0.1)
  coupling_strength: number; // Coupling between components (default: 0.15)
}

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
  gct_params: GCTParameters;     // GCT mathematical parameters
  contextWindow: number;         // Minutes to consider for context
  patternMemory: number;         // How many patterns to remember
}

export class CoherenceFilter {
  private config: FilterConfig;
  private contextBuffer: DataPoint[] = [];
  private patternHistory: Map<string, number> = new Map();
  private coherenceHistory: Array<{timestamp: Date, coherence: number}> = [];

  constructor(config: FilterConfig) {
    this.config = {
      sensitivity: config.sensitivity || 0.5,
      gct_params: config.gct_params || {
        km: 0.3,
        ki: 0.1,
        coupling_strength: 0.15
      },
      contextWindow: config.contextWindow || 60,
      patternMemory: config.patternMemory || 1000
    };
  }

  /**
   * Process a data point through GCT coherence filtering
   */
  async filter(dataPoint: DataPoint): Promise<FilteredDataPoint | null> {
    const dimensions = await this.calculateCoherence(dataPoint);
    const score = this.calculateGCTCoherence(dimensions);
    
    // Store coherence history for temporal analysis
    this.coherenceHistory.push({
      timestamp: dataPoint.timestamp,
      coherence: score
    });
    
    // Keep only recent history (last 100 points)
    if (this.coherenceHistory.length > 100) {
      this.coherenceHistory.shift();
    }

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
      psi: await this.calculateClarity(dataPoint),
      rho: await this.calculateWisdom(dataPoint),
      q_raw: await this.calculateEmotionalCharge(dataPoint),
      q_opt: 0, // Will be calculated in calculateGCTCoherence
      f: await this.calculateSocialBelonging(dataPoint)
    };
  }

  /**
   * Ψ (Psi) - Base Clarity/Precision
   * Measures the fundamental clarity and precision of information
   */
  private async calculateClarity(dataPoint: DataPoint): Promise<number> {
    let clarityScore = 0;
    const content = dataPoint.content || {};
    
    // Structural completeness
    if (content.title || content.name) clarityScore += 0.3;
    if (content.description || content.text || content.body) clarityScore += 0.3;
    if (content.url || content.link) clarityScore += 0.2;
    
    // Data quality indicators
    const contentStr = JSON.stringify(content).toLowerCase();
    if (contentStr.length > 100) clarityScore += 0.1; // Sufficient detail
    if (!/undefined|null|error/.test(contentStr)) clarityScore += 0.1; // Clean data
    
    return Math.min(clarityScore, 1);
  }

  /**
   * ρ (Rho) - Reflective Depth/Wisdom
   * Measures depth, nuance, and historical pattern alignment
   */
  private async calculateWisdom(dataPoint: DataPoint): Promise<number> {
    let wisdomScore = 0;
    
    // Historical pattern recognition
    const pattern = this.extractPattern(dataPoint);
    const historicalFrequency = this.patternHistory.get(pattern) || 0;
    const normalizedFrequency = historicalFrequency / Math.max(this.patternHistory.size, 1);
    const patternWisdom = 1 / (1 + Math.exp(-5 * (normalizedFrequency - 0.1)));
    wisdomScore += patternWisdom * 0.4;
    
    // Content depth indicators
    const content = JSON.stringify(dataPoint.content).toLowerCase();
    const depthKeywords = [
      'analysis', 'insight', 'perspective', 'understanding', 'context',
      'implications', 'consequences', 'research', 'study', 'evidence'
    ];
    
    for (const keyword of depthKeywords) {
      if (content.includes(keyword)) {
        wisdomScore += 0.05;
      }
    }
    
    // Source authority (if available)
    if (dataPoint.metadata?.source_authority) {
      wisdomScore += dataPoint.metadata.source_authority * 0.3;
    }
    
    return Math.min(wisdomScore, 1);
  }

  /**
   * q_raw - Raw Emotional Charge
   * Measures the emotional intensity and engagement potential
   */
  private async calculateEmotionalCharge(dataPoint: DataPoint): Promise<number> {
    let emotionalScore = 0;
    const content = JSON.stringify(dataPoint.content).toLowerCase();
    
    // High-arousal positive emotions
    const positiveKeywords = [
      'amazing', 'breakthrough', 'revolutionary', 'incredible', 'fantastic',
      'exciting', 'inspiring', 'remarkable', 'outstanding', 'brilliant'
    ];
    
    // High-arousal negative emotions
    const negativeKeywords = [
      'outrageous', 'shocking', 'devastating', 'crisis', 'disaster',
      'failure', 'scandal', 'controversy', 'alarming', 'urgent'
    ];
    
    // Neutral but engaging
    const engagingKeywords = [
      'breaking', 'revealed', 'discovered', 'announced', 'launched',
      'released', 'confirmed', 'update', 'report', 'study'
    ];
    
    // Count emotional indicators
    for (const keyword of positiveKeywords) {
      if (content.includes(keyword)) emotionalScore += 0.15;
    }
    for (const keyword of negativeKeywords) {
      if (content.includes(keyword)) emotionalScore += 0.15;
    }
    for (const keyword of engagingKeywords) {
      if (content.includes(keyword)) emotionalScore += 0.08;
    }
    
    // Engagement metrics (if available)
    const metadata = dataPoint.metadata || {};
    if (metadata.score && metadata.score > 100) emotionalScore += 0.2;
    if (metadata.comments && metadata.comments > 50) emotionalScore += 0.15;
    if (metadata.shares && metadata.shares > 10) emotionalScore += 0.1;
    
    return Math.min(emotionalScore, 1);
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
   * Calculate GCT coherence score using proper multiplicative formula
   */
  private calculateGCTCoherence(dimensions: CoherenceDimensions): number {
    const { gct_params } = this.config;
    
    // Optimize emotional charge with wisdom modulation
    const q_opt = dimensions.q_raw / (
      gct_params.km + dimensions.q_raw + 
      (dimensions.q_raw * dimensions.q_raw) / gct_params.ki
    );
    
    // Update q_opt in dimensions
    dimensions.q_opt = q_opt;
    
    // GCT formula: C = ψ + (ρ × ψ) + q_opt + (f × ψ) + (coupling × ρ × q_opt)
    const base = dimensions.psi;
    const wisdom_amp = dimensions.rho * dimensions.psi;
    const emotional = q_opt;
    const social_amp = dimensions.f * dimensions.psi;
    const coupling = gct_params.coupling_strength * dimensions.rho * q_opt;
    
    return base + wisdom_amp + emotional + social_amp + coupling;
  }

  /**
   * Calculate coherence derivatives for temporal analysis
   */
  private calculateCoherenceDerivatives(currentCoherence: number, timestamp: Date): {dc_dt: number, d2c_dt2: number} {
    // Need at least 3 points for derivatives
    if (this.coherenceHistory.length < 3) {
      return { dc_dt: 0, d2c_dt2: 0 };
    }

    // Get recent points for derivative calculation
    const recentPoints = this.coherenceHistory.slice(-3);
    const times = recentPoints.map(p => p.timestamp.getTime());
    const values = recentPoints.map(p => p.coherence);

    // Calculate first derivative (rate of change)
    const dt1 = (times[1] - times[0]) / 1000; // Convert to seconds
    const dt2 = (times[2] - times[1]) / 1000;
    const dc1 = values[1] - values[0];
    const dc2 = values[2] - values[1];

    const dc_dt = dt2 > 0 ? dc2 / dt2 : 0;

    // Calculate second derivative (acceleration)
    const d2c_dt2 = dt1 > 0 && dt2 > 0 ? (dc2/dt2 - dc1/dt1) / ((dt1 + dt2) / 2) : 0;

    return { dc_dt, d2c_dt2 };
  }

  /**
   * Classify trend based on coherence derivative
   */
  private classifyTrend(dc_dt: number): 'rising' | 'falling' | 'stable' {
    const threshold = 0.01; // Adjust based on your needs
    
    if (dc_dt > threshold) return 'rising';
    if (dc_dt < -threshold) return 'falling';
    return 'stable';
  }

  /**
   * Detect coherence spikes (rapid changes)
   */
  private detectSpike(d2c_dt2: number): boolean {
    const spike_threshold = 0.05; // Adjust based on your needs
    return Math.abs(d2c_dt2) > spike_threshold;
  }

  /**
   * Get temporal analysis of current coherence state
   */
  getTemporalAnalysis(): {trend: string, spike_detected: boolean, dc_dt: number, d2c_dt2: number} | null {
    if (this.coherenceHistory.length < 3) return null;

    const latest = this.coherenceHistory[this.coherenceHistory.length - 1];
    const { dc_dt, d2c_dt2 } = this.calculateCoherenceDerivatives(latest.coherence, latest.timestamp);

    return {
      trend: this.classifyTrend(dc_dt),
      spike_detected: this.detectSpike(d2c_dt2),
      dc_dt,
      d2c_dt2
    };
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