/**
 * Data Source Recommendation Engine
 * Recommends new data sources based on coherence patterns and user interests
 */

import { FilteredDataPoint } from '../core/coherence-filter';
import { APISource } from '../collectors/data-river';
import { EventEmitter } from 'events';

export interface SourceProfile {
  sourceId: string;
  name: string;
  category: string;
  avgCoherence: number;
  totalDataPoints: number;
  topPatterns: string[];
  peakHours: number[];
  coherenceDimensionProfile: {
    psi: number;
    rho: number;
    q: number;
    f: number;
    [key: string]: number;
  };
  keywords: Map<string, number>;
}

export interface Recommendation {
  source: APISource;
  score: number;
  reasons: string[];
  similarTo: string[];
  expectedCoherence: number;
}

export interface RecommenderConfig {
  minDataPointsForProfile: number;
  topKeywordsCount: number;
  similarityThreshold: number;
  maxRecommendations: number;
}

export class SourceRecommender extends EventEmitter {
  private sourceProfiles: Map<string, SourceProfile> = new Map();
  private dataPointsBySource: Map<string, FilteredDataPoint[]> = new Map();
  private availableSources: APISource[] = [];
  private userPreferences: {
    preferredCategories: Set<string>;
    preferredKeywords: Set<string>;
    minCoherenceThreshold: number;
  } = {
    preferredCategories: new Set(),
    preferredKeywords: new Set(),
    minCoherenceThreshold: 0.5
  };

  constructor(private config: RecommenderConfig) {
    super();
  }

  /**
   * Process a filtered data point to update source profiles
   */
  processDataPoint(dataPoint: FilteredDataPoint): void {
    // Group by source
    if (!this.dataPointsBySource.has(dataPoint.source)) {
      this.dataPointsBySource.set(dataPoint.source, []);
    }
    this.dataPointsBySource.get(dataPoint.source)!.push(dataPoint);
    
    // Update source profile if enough data
    const sourceData = this.dataPointsBySource.get(dataPoint.source)!;
    if (sourceData.length >= this.config.minDataPointsForProfile) {
      this.updateSourceProfile(dataPoint.source, sourceData);
    }
    
    // Extract keywords and patterns for learning
    this.extractUserPreferences(dataPoint);
  }

  /**
   * Update source profile based on accumulated data
   */
  private updateSourceProfile(sourceId: string, dataPoints: FilteredDataPoint[]): void {
    const profile: SourceProfile = {
      sourceId,
      name: sourceId,
      category: this.inferCategory(dataPoints),
      avgCoherence: this.calculateAvgCoherence(dataPoints),
      totalDataPoints: dataPoints.length,
      topPatterns: this.extractTopPatterns(dataPoints),
      peakHours: this.findPeakHours(dataPoints),
      coherenceDimensionProfile: this.calculateDimensionProfile(dataPoints),
      keywords: this.extractKeywords(dataPoints)
    };
    
    this.sourceProfiles.set(sourceId, profile);
    this.emit('profile-updated', profile);
  }

  /**
   * Infer category from data patterns
   */
  private inferCategory(dataPoints: FilteredDataPoint[]): string {
    const categoryKeywords: Record<string, string[]> = {
      'News': ['article', 'news', 'headline', 'report', 'journalist', 'press'],
      'Social': ['post', 'comment', 'share', 'like', 'user', 'community'],
      'Finance': ['price', 'market', 'stock', 'trading', 'investment', 'currency'],
      'Technology': ['api', 'code', 'software', 'tech', 'digital', 'data'],
      'Science': ['research', 'study', 'experiment', 'discovery', 'scientific'],
      'Entertainment': ['movie', 'music', 'game', 'show', 'entertainment', 'media']
    };
    
    const categoryCounts: Record<string, number> = {};
    
    for (const dp of dataPoints) {
      const content = JSON.stringify(dp.content).toLowerCase();
      
      for (const [category, keywords] of Object.entries(categoryKeywords)) {
        categoryCounts[category] = categoryCounts[category] || 0;
        
        for (const keyword of keywords) {
          if (content.includes(keyword)) {
            categoryCounts[category]++;
          }
        }
      }
    }
    
    // Find category with highest count
    let maxCount = 0;
    let inferredCategory = 'General';
    
    for (const [category, count] of Object.entries(categoryCounts)) {
      if (count > maxCount) {
        maxCount = count;
        inferredCategory = category;
      }
    }
    
    return inferredCategory;
  }

  /**
   * Calculate average coherence
   */
  private calculateAvgCoherence(dataPoints: FilteredDataPoint[]): number {
    const sum = dataPoints.reduce((acc, dp) => acc + dp.coherenceScore, 0);
    return sum / dataPoints.length;
  }

  /**
   * Extract top patterns
   */
  private extractTopPatterns(dataPoints: FilteredDataPoint[]): string[] {
    const patternCounts: Map<string, number> = new Map();
    
    for (const dp of dataPoints) {
      const pattern = this.extractPattern(dp);
      patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
    }
    
    // Sort by frequency and return top patterns
    return Array.from(patternCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pattern]) => pattern);
  }

  /**
   * Extract pattern from data point
   */
  private extractPattern(dataPoint: FilteredDataPoint): string {
    const contentKeys = Object.keys(dataPoint.content || {}).sort().join(',');
    const dimensionProfile = [
      dataPoint.coherenceDimensions.psi > 0.7 ? 'H' : 'L',
      dataPoint.coherenceDimensions.rho > 0.7 ? 'H' : 'L',
      dataPoint.coherenceDimensions.q > 0.7 ? 'H' : 'L',
      dataPoint.coherenceDimensions.f > 0.7 ? 'H' : 'L'
    ].join('');
    
    return `${contentKeys}:${dimensionProfile}`;
  }

  /**
   * Find peak activity hours
   */
  private findPeakHours(dataPoints: FilteredDataPoint[]): number[] {
    const hourCounts: number[] = new Array(24).fill(0);
    
    for (const dp of dataPoints) {
      const hour = new Date(dp.timestamp).getHours();
      hourCounts[hour]++;
    }
    
    // Find hours with above-average activity
    const avgCount = hourCounts.reduce((a, b) => a + b) / 24;
    const peakHours: number[] = [];
    
    hourCounts.forEach((count, hour) => {
      if (count > avgCount * 1.5) {
        peakHours.push(hour);
      }
    });
    
    return peakHours;
  }

  /**
   * Calculate average dimension profile
   */
  private calculateDimensionProfile(dataPoints: FilteredDataPoint[]): any {
    const profile: any = {
      psi: 0,
      rho: 0,
      q: 0,
      f: 0
    };
    
    // Calculate averages
    for (const dp of dataPoints) {
      profile.psi += dp.coherenceDimensions.psi;
      profile.rho += dp.coherenceDimensions.rho;
      profile.q += dp.coherenceDimensions.q;
      profile.f += dp.coherenceDimensions.f;
      
      // Handle custom dimensions
      if ('custom' in dp.coherenceDimensions && dp.coherenceDimensions.custom) {
        for (const [key, value] of Object.entries(dp.coherenceDimensions.custom)) {
          profile[key] = (profile[key] || 0) + value;
        }
      }
    }
    
    // Normalize
    for (const key of Object.keys(profile)) {
      profile[key] /= dataPoints.length;
    }
    
    return profile;
  }

  /**
   * Extract keywords from content
   */
  private extractKeywords(dataPoints: FilteredDataPoint[]): Map<string, number> {
    const keywords: Map<string, number> = new Map();
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for']);
    
    for (const dp of dataPoints) {
      const content = JSON.stringify(dp.content).toLowerCase();
      const words = content.match(/\b\w{4,}\b/g) || []; // Words with 4+ characters
      
      for (const word of words) {
        if (!stopWords.has(word) && isNaN(Number(word))) {
          keywords.set(word, (keywords.get(word) || 0) + 1);
        }
      }
    }
    
    // Sort and keep top keywords
    const sorted = Array.from(keywords.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.config.topKeywordsCount);
    
    return new Map(sorted);
  }

  /**
   * Extract user preferences from high-coherence data
   */
  private extractUserPreferences(dataPoint: FilteredDataPoint): void {
    if (dataPoint.coherenceScore > 0.7) {
      // Update preferred categories
      const profile = this.sourceProfiles.get(dataPoint.source);
      if (profile) {
        this.userPreferences.preferredCategories.add(profile.category);
      }
      
      // Extract keywords from high-coherence content
      const content = JSON.stringify(dataPoint.content).toLowerCase();
      const words = content.match(/\b\w{4,}\b/g) || [];
      
      for (const word of words) {
        if (dataPoint.coherenceScore > 0.8) {
          this.userPreferences.preferredKeywords.add(word);
        }
      }
    }
  }

  /**
   * Set available sources for recommendation
   */
  setAvailableSources(sources: APISource[]): void {
    this.availableSources = sources;
  }

  /**
   * Generate recommendations based on profiles and preferences
   */
  generateRecommendations(): Recommendation[] {
    const recommendations: Recommendation[] = [];
    const activeSources = new Set(Array.from(this.sourceProfiles.keys()));
    
    for (const source of this.availableSources) {
      // Skip already active sources
      if (activeSources.has(source.name)) {
        continue;
      }
      
      const recommendation = this.evaluateSource(source);
      if (recommendation.score > this.config.similarityThreshold) {
        recommendations.push(recommendation);
      }
    }
    
    // Sort by score and limit
    return recommendations
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.maxRecommendations);
  }

  /**
   * Evaluate a source for recommendation
   */
  private evaluateSource(source: APISource): Recommendation {
    let score = 0;
    const reasons: string[] = [];
    const similarTo: string[] = [];
    
    // Category matching
    const sourceCategory = this.inferCategoryFromSource(source);
    if (this.userPreferences.preferredCategories.has(sourceCategory)) {
      score += 0.3;
      reasons.push(`Matches preferred category: ${sourceCategory}`);
    }
    
    // Find similar active sources
    let maxSimilarity = 0;
    let totalSimilarity = 0;
    let similarCount = 0;
    
    for (const [sourceId, profile] of this.sourceProfiles) {
      const similarity = this.calculateSourceSimilarity(source, profile);
      
      if (similarity > 0.7) {
        similarTo.push(sourceId);
        score += similarity * 0.2;
        reasons.push(`Similar to high-performing source: ${sourceId}`);
      }
      
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
      }
      
      totalSimilarity += similarity;
      similarCount++;
    }
    
    // Keyword matching
    const keywordMatches = this.countKeywordMatches(source);
    if (keywordMatches > 0) {
      score += Math.min(0.3, keywordMatches * 0.05);
      reasons.push(`Contains ${keywordMatches} preferred keywords`);
    }
    
    // Estimate expected coherence based on similar sources
    const expectedCoherence = this.estimateExpectedCoherence(source, maxSimilarity);
    
    // Penalize if expected coherence is too low
    if (expectedCoherence < this.userPreferences.minCoherenceThreshold) {
      score *= 0.5;
    }
    
    // Diversity bonus - reward sources that are somewhat different
    const avgSimilarity = similarCount > 0 ? totalSimilarity / similarCount : 0;
    if (avgSimilarity < 0.5 && avgSimilarity > 0.2) {
      score += 0.1;
      reasons.push('Adds diversity to source portfolio');
    }
    
    return {
      source,
      score: Math.min(1, score),
      reasons,
      similarTo,
      expectedCoherence
    };
  }

  /**
   * Infer category from source metadata
   */
  private inferCategoryFromSource(source: APISource): string {
    const name = source.name.toLowerCase();
    const description = (source.description || '').toLowerCase();
    const combined = `${name} ${description}`;
    
    const categories: Record<string, string[]> = {
      'News': ['news', 'article', 'headline', 'journal'],
      'Social': ['social', 'community', 'forum', 'discussion'],
      'Finance': ['finance', 'market', 'trading', 'economic'],
      'Technology': ['tech', 'api', 'developer', 'programming'],
      'Science': ['science', 'research', 'academic', 'journal'],
      'Entertainment': ['entertainment', 'media', 'video', 'music']
    };
    
    for (const [category, keywords] of Object.entries(categories)) {
      for (const keyword of keywords) {
        if (combined.includes(keyword)) {
          return category;
        }
      }
    }
    
    return 'General';
  }

  /**
   * Calculate similarity between a new source and an existing profile
   */
  private calculateSourceSimilarity(source: APISource, profile: SourceProfile): number {
    let similarity = 0;
    let factors = 0;
    
    // Category similarity
    const sourceCategory = this.inferCategoryFromSource(source);
    if (sourceCategory === profile.category) {
      similarity += 0.4;
    }
    factors++;
    
    // Keyword overlap
    const sourceKeywords = this.extractSourceKeywords(source);
    let keywordOverlap = 0;
    
    for (const keyword of sourceKeywords) {
      if (profile.keywords.has(keyword)) {
        keywordOverlap++;
      }
    }
    
    if (sourceKeywords.size > 0) {
      similarity += 0.3 * (keywordOverlap / sourceKeywords.size);
    }
    factors++;
    
    // API structure similarity (if endpoints are similar)
    if (source.endpoints && source.endpoints.length > 0) {
      const endpointPatterns = source.endpoints.map(e => this.getEndpointPattern(e));
      const structureSimilarity = this.compareEndpointPatterns(endpointPatterns, profile.topPatterns);
      similarity += 0.3 * structureSimilarity;
      factors++;
    }
    
    return similarity / factors;
  }

  /**
   * Extract keywords from source metadata
   */
  private extractSourceKeywords(source: APISource): Set<string> {
    const keywords = new Set<string>();
    const text = `${source.name} ${source.description || ''}`.toLowerCase();
    const words = text.match(/\b\w{4,}\b/g) || [];
    
    for (const word of words) {
      keywords.add(word);
    }
    
    return keywords;
  }

  /**
   * Get pattern from endpoint
   */
  private getEndpointPattern(endpoint: any): string {
    if (typeof endpoint === 'string') {
      return endpoint.replace(/\{[^}]+\}/g, '{}');
    }
    return endpoint.path ? endpoint.path.replace(/\{[^}]+\}/g, '{}') : '';
  }

  /**
   * Compare endpoint patterns
   */
  private compareEndpointPatterns(patterns1: string[], patterns2: string[]): number {
    if (patterns1.length === 0 || patterns2.length === 0) {
      return 0;
    }
    
    let matches = 0;
    for (const p1 of patterns1) {
      for (const p2 of patterns2) {
        if (this.patternsAreSimilar(p1, p2)) {
          matches++;
        }
      }
    }
    
    return matches / Math.max(patterns1.length, patterns2.length);
  }

  /**
   * Check if two patterns are similar
   */
  private patternsAreSimilar(p1: string, p2: string): boolean {
    // Simple similarity check
    const parts1 = p1.split('/').filter(p => p);
    const parts2 = p2.split('/').filter(p => p);
    
    if (Math.abs(parts1.length - parts2.length) > 2) {
      return false;
    }
    
    let commonParts = 0;
    for (const part of parts1) {
      if (parts2.includes(part)) {
        commonParts++;
      }
    }
    
    return commonParts / Math.max(parts1.length, parts2.length) > 0.5;
  }

  /**
   * Count keyword matches with user preferences
   */
  private countKeywordMatches(source: APISource): number {
    const sourceKeywords = this.extractSourceKeywords(source);
    let matches = 0;
    
    for (const keyword of sourceKeywords) {
      if (this.userPreferences.preferredKeywords.has(keyword)) {
        matches++;
      }
    }
    
    return matches;
  }

  /**
   * Estimate expected coherence for a source
   */
  private estimateExpectedCoherence(source: APISource, maxSimilarity: number): number {
    if (this.sourceProfiles.size === 0) {
      return 0.5; // Default estimate
    }
    
    // Find most similar sources and average their coherence
    const similarities: Array<{ similarity: number; coherence: number }> = [];
    
    for (const profile of this.sourceProfiles.values()) {
      const similarity = this.calculateSourceSimilarity(source, profile);
      similarities.push({ similarity, coherence: profile.avgCoherence });
    }
    
    // Weight by similarity
    let weightedSum = 0;
    let weightSum = 0;
    
    similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3)
      .forEach(({ similarity, coherence }) => {
        weightedSum += coherence * similarity;
        weightSum += similarity;
      });
    
    if (weightSum === 0) {
      return 0.5;
    }
    
    // Apply confidence factor based on similarity
    const estimate = weightedSum / weightSum;
    const confidence = maxSimilarity;
    
    // Blend with default based on confidence
    return estimate * confidence + 0.5 * (1 - confidence);
  }

  /**
   * Get source profiles
   */
  getSourceProfiles(): SourceProfile[] {
    return Array.from(this.sourceProfiles.values());
  }

  /**
   * Get user preferences
   */
  getUserPreferences(): any {
    return {
      preferredCategories: Array.from(this.userPreferences.preferredCategories),
      preferredKeywords: Array.from(this.userPreferences.preferredKeywords),
      minCoherenceThreshold: this.userPreferences.minCoherenceThreshold
    };
  }

  /**
   * Update user preferences
   */
  updateUserPreferences(preferences: Partial<typeof this.userPreferences>): void {
    if (preferences.preferredCategories) {
      this.userPreferences.preferredCategories = new Set(preferences.preferredCategories);
    }
    if (preferences.preferredKeywords) {
      this.userPreferences.preferredKeywords = new Set(preferences.preferredKeywords);
    }
    if (preferences.minCoherenceThreshold !== undefined) {
      this.userPreferences.minCoherenceThreshold = preferences.minCoherenceThreshold;
    }
  }
}