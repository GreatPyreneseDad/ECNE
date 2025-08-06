/**
 * Enhanced ECNE Demo
 * Demonstrates all features including ML analytics and enhanced UX
 */

import { EnhancedCoherenceFilter, FilterABTester } from '../src/core/enhanced-filter';
import { DataRiverCollector, APISource } from '../src/collectors/data-river';
import { DatabaseService } from '../src/storage/database';
import { DashboardServer } from '../src/dashboard/server';
import { parsePublicAPIs } from '../src/utils/api-parser';
import winston from 'winston';

// Enhanced configuration
const config = {
  filter: {
    sensitivity: 0.5,
    weights: {
      psi: 0.25,
      rho: 0.25,
      q: 0.25,
      f: 0.25
    },
    contextWindow: 60,
    patternMemory: 1000,
    enableAnomalyDetection: true,
    enablePrediction: true,
    enableAutoTuning: true,
    anomalyThreshold: 2.5
  },
  collector: {
    maxConcurrent: 10,
    retryAttempts: 3,
    retryDelay: 1000
  },
  storage: {
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost/ecne',
    retention: 30
  },
  dashboard: {
    port: 3000
  }
};

async function runEnhancedDemo() {
  const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.colorize(),
      winston.format.simple()
    ),
    transports: [new winston.transports.Console()]
  });

  logger.info('🚀 Starting Enhanced ECNE Data River Demo');

  // Initialize enhanced components
  const enhancedFilter = new EnhancedCoherenceFilter(config.filter);
  const database = new DatabaseService(config.storage);
  const dashboard = new DashboardServer(config.dashboard, database);
  const collector = new DataRiverCollector({
    sources: [],
    ...config.collector
  });

  // Connect to services
  await database.connect();
  await dashboard.start();

  // Load API sources
  const sources = await parsePublicAPIs('/Users/chris/public-api-lists/README.md', {
    categories: ['News', 'Weather', 'Finance'],
    requiresCors: true,
    requiresAuth: false,
    limit: 5
  });

  // Add sources to collector
  sources.forEach(source => {
    collector.addSource(source);
    logger.info(`Added source: ${source.name}`);
  });

  // Setup data flow with enhanced filtering
  collector.on('data', async (dataPoint) => {
    const filtered = await enhancedFilter.filter(dataPoint);
    
    if (filtered) {
      // Log enhanced features
      if (filtered.isAnomaly) {
        logger.warn(`🚨 Anomaly detected: ${filtered.source} (score: ${filtered.anomalyScore?.toFixed(2)})`);
      }

      if (filtered.predictedFutureScore) {
        logger.info(`📈 Prediction for ${filtered.source}: ${filtered.predictedFutureScore.toFixed(3)}`);
      }

      // Store in database
      await database.storeDataPoint(filtered);
      
      // Emit to dashboard
      dashboard.emitDataPoint(filtered);
    }
  });

  // Start collection
  collector.start();

  // Simulate user feedback for auto-tuning
  setInterval(() => {
    const recentPoints = enhancedFilter['recentPoints']; // Access for demo
    if (recentPoints.length > 0) {
      const randomPoint = recentPoints[Math.floor(Math.random() * recentPoints.length)];
      const wasRelevant = Math.random() > 0.3; // 70% relevant
      
      enhancedFilter.provideFeedback(randomPoint.id, wasRelevant);
      logger.info(`📝 User feedback: ${randomPoint.source} was ${wasRelevant ? 'relevant' : 'not relevant'}`);
    }
  }, 30000); // Every 30 seconds

  // Periodic analytics report
  setInterval(() => {
    const analytics = enhancedFilter.getAnalytics();
    logger.info('\n📊 Analytics Report:');
    logger.info(`Anomaly Rate: ${(analytics.anomalyRate * 100).toFixed(1)}%`);
    logger.info(`Trend: ${analytics.trendDirection}`);
    logger.info(`Top Patterns: ${analytics.topPatterns.length}`);
    logger.info(`Performance - F1 Score: ${analytics.performanceMetrics.f1Score.toFixed(3)}`);
    
    if (analytics.weightSuggestions.length > 0) {
      logger.info('Weight Suggestions:');
      analytics.weightSuggestions.forEach(s => {
        logger.info(`  ${s.dimension}: ${s.currentWeight.toFixed(3)} → ${s.suggestedWeight.toFixed(3)} (${s.reason})`);
      });
    }
  }, 60000); // Every minute

  // A/B Testing example
  logger.info('\n🧪 Starting A/B Test...');
  
  const configA = { ...config.filter, sensitivity: 0.5 };
  const configB = { ...config.filter, sensitivity: 0.3 };
  const abTester = new FilterABTester(configA, configB);

  // Process some data through both variants
  collector.on('data', async (dataPoint) => {
    await abTester.process(dataPoint);
  });

  // Check A/B test results periodically
  setInterval(() => {
    const results = abTester.getResults();
    if (results.variantA.filtered > 50 && results.variantB.filtered > 50) {
      logger.info('\n🔬 A/B Test Results:');
      logger.info(`Duration: ${results.duration.toFixed(1)} minutes`);
      logger.info(`Variant A: ${results.variantA.filtered} filtered, avg coherence: ${results.variantA.avgCoherence.toFixed(3)}`);
      logger.info(`Variant B: ${results.variantB.filtered} filtered, avg coherence: ${results.variantB.avgCoherence.toFixed(3)}`);
      logger.info(`Recommendation: ${results.recommendation}`);
    }
  }, 120000); // Every 2 minutes

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('\n👋 Shutting down Enhanced ECNE...');
    
    collector.stop();
    await dashboard.stop();
    await database.disconnect();
    
    // Export final analytics
    const finalAnalytics = enhancedFilter.exportAnalytics();
    logger.info('Final analytics exported:', {
      patterns: finalAnalytics.patterns.length,
      performance: finalAnalytics.performance
    });
    
    process.exit(0);
  });

  logger.info('\n✨ Enhanced ECNE is running!');
  logger.info('Dashboard: http://localhost:3000');
  logger.info('Press Ctrl+C to stop\n');
}

// Run the demo
if (require.main === module) {
  runEnhancedDemo().catch(console.error);
}