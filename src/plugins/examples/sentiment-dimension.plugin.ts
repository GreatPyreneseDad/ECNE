/**
 * Sentiment Coherence Dimension Plugin
 * Adds sentiment analysis as a custom coherence dimension
 */

import { CoherenceDimensionPlugin, PluginContext } from '../plugin-interface';
import { DataPoint } from '../../core/coherence-filter';

class SentimentDimensionPlugin implements CoherenceDimensionPlugin {
  type: 'coherence-dimension' = 'coherence-dimension';
  name = 'sentiment-dimension';
  version = '1.0.0';
  description = 'Adds sentiment analysis as a coherence dimension';
  author = 'ECNE Team';
  enabled = true;
  dimensionKey = 'sentiment';
  dimensionName = 'Emotional Coherence';

  // Sentiment keywords with weights
  private positiveKeywords = new Map([
    ['excellent', 0.9], ['amazing', 0.9], ['wonderful', 0.8], ['great', 0.7],
    ['good', 0.6], ['positive', 0.7], ['happy', 0.8], ['love', 0.8],
    ['success', 0.7], ['win', 0.7], ['achieve', 0.6], ['improve', 0.6]
  ]);

  private negativeKeywords = new Map([
    ['terrible', -0.9], ['awful', -0.9], ['horrible', -0.8], ['bad', -0.7],
    ['poor', -0.6], ['negative', -0.7], ['sad', -0.8], ['hate', -0.8],
    ['fail', -0.7], ['lose', -0.7], ['worse', -0.6], ['problem', -0.5]
  ]);

  async calculate(dataPoint: DataPoint, context: PluginContext): Promise<number> {
    const content = JSON.stringify(dataPoint.content).toLowerCase();
    
    let sentimentScore = 0;
    let wordCount = 0;

    // Calculate positive sentiment
    for (const [word, weight] of this.positiveKeywords) {
      const matches = (content.match(new RegExp(`\\b${word}\\b`, 'gi')) || []).length;
      if (matches > 0) {
        sentimentScore += weight * matches;
        wordCount += matches;
      }
    }

    // Calculate negative sentiment
    for (const [word, weight] of this.negativeKeywords) {
      const matches = (content.match(new RegExp(`\\b${word}\\b`, 'gi')) || []).length;
      if (matches > 0) {
        sentimentScore += weight * matches;
        wordCount += matches;
      }
    }

    // Check recent context for sentiment consistency
    const recentPoints = context.getRecentDataPoints(5);
    let contextBonus = 0;
    
    if (recentPoints.length > 0) {
      const recentSentiments = recentPoints.map(dp => {
        const dpContent = JSON.stringify(dp.content).toLowerCase();
        let dpSentiment = 0;
        
        for (const [word, weight] of this.positiveKeywords) {
          if (dpContent.includes(word)) dpSentiment += weight;
        }
        for (const [word, weight] of this.negativeKeywords) {
          if (dpContent.includes(word)) dpSentiment += weight;
        }
        
        return dpSentiment;
      });
      
      const avgRecentSentiment = recentSentiments.reduce((a, b) => a + b, 0) / recentSentiments.length;
      
      // Bonus for sentiment consistency
      if (Math.sign(sentimentScore) === Math.sign(avgRecentSentiment)) {
        contextBonus = 0.2;
      }
    }

    // Normalize to 0-1 range
    const normalizedScore = wordCount > 0 
      ? (sentimentScore / wordCount + 1) / 2  // Convert from [-1, 1] to [0, 1]
      : 0.5;
    
    // Apply context bonus and ensure within bounds
    const finalScore = Math.max(0, Math.min(1, normalizedScore + contextBonus));
    
    context.log('debug', `Sentiment score for ${dataPoint.id}: ${finalScore}`);
    context.recordMetric('sentiment_score', finalScore, { source: dataPoint.source });
    
    return finalScore;
  }

  getDefaultWeight(): number {
    return 0.15; // 15% weight in overall coherence calculation
  }

  explainHighValue(value: number): string {
    if (value > 0.8) {
      return 'Very positive emotional content';
    } else if (value > 0.6) {
      return 'Moderately positive sentiment';
    } else if (value < 0.2) {
      return 'Strong negative sentiment detected';
    } else if (value < 0.4) {
      return 'Moderately negative sentiment';
    }
    return 'Neutral emotional content';
  }

  // Lifecycle hooks
  async onLoad(context: PluginContext): Promise<void> {
    context.log('info', 'Sentiment dimension plugin loaded');
  }

  async onEnable(context: PluginContext): Promise<void> {
    context.log('info', 'Sentiment dimension plugin enabled');
  }

  async onDisable(context: PluginContext): Promise<void> {
    context.log('info', 'Sentiment dimension plugin disabled');
  }
}

// Export plugin manifest
export default {
  plugins: [new SentimentDimensionPlugin()]
};