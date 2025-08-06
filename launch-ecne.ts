import { ECNEDataRiver } from './src/ecne';
import { APISource } from './src/types';

async function main() {
  console.log('\n🚀 Launching ECNE Data River System...\n');

  // Initialize ECNE with production configuration
  const ecne = new ECNEDataRiver({
    filter: {
      sensitivity: 0.5,
      weights: { psi: 0.25, rho: 0.25, q: 0.25, f: 0.25 },
      enableAnomalyDetection: true,
      enablePrediction: true
    },
    storage: {
      type: 'mock',
      useMock: true,
      fallbackToMock: true
    },
    collector: {
      maxConcurrent: 10,
      retryAttempts: 3,
      batchSize: 50
    },
    dashboard: {
      enabled: true,
      port: 3000,
      host: 'localhost'
    },
    cache: {
      enabled: true,
      maxMemoryItems: 1000,
      defaultTTL: 300000 // 5 minutes
    },
    security: {
      rateLimiting: true,
      validation: true
    }
  });

  // Set up event handlers
  ecne.on('initialized', () => {
    console.log('✅ ECNE initialized successfully');
  });

  ecne.on('filtered-data', (data) => {
    console.log(`📊 Filtered data: ${data.source} - Score: ${data.coherenceScore.toFixed(3)}`);
  });

  ecne.on('anomaly-detected', (anomaly) => {
    console.log(`⚠️  Anomaly detected: ${anomaly.source} - Deviation: ${anomaly.deviation.toFixed(2)}`);
  });

  ecne.on('health-alert', (alert) => {
    console.log(`🚨 Health Alert: ${alert.level} - ${alert.message}`);
  });

  ecne.on('error', (error) => {
    console.error('❌ Error:', error.message);
  });

  try {
    // Initialize the system
    await ecne.initialize();

    // Define demo API sources
    const sources: APISource[] = [
      {
        id: 'demo-news',
        name: 'Demo News Feed',
        baseUrl: 'https://jsonplaceholder.typicode.com',
        endpoints: [{
          path: '/posts',
          method: 'GET',
          refreshInterval: 30 // 30 seconds
        }],
        rateLimits: {
          requestsPerMinute: 10,
          requestsPerHour: 100
        }
      },
      {
        id: 'demo-users',
        name: 'Demo User API',
        baseUrl: 'https://jsonplaceholder.typicode.com',
        endpoints: [{
          path: '/users',
          method: 'GET',
          refreshInterval: 60 // 1 minute
        }],
        rateLimits: {
          requestsPerMinute: 10,
          requestsPerHour: 100
        }
      }
    ];

    // Start data collection
    await ecne.start(sources);

    console.log('\n🌊 ECNE Data River is running!');
    console.log('📊 Dashboard: http://localhost:3000');
    console.log('📈 WebSocket: ws://localhost:3000/ws\n');

    // Log statistics every 30 seconds
    setInterval(async () => {
      const stats = ecne.getStatistics();
      const health = await ecne.getHealthStatus();
      
      console.log('\n--- System Statistics ---');
      console.log(`Processed: ${stats.processed}`);
      console.log(`Filtered: ${stats.filtered} (${stats.filterRate.toFixed(1)}%)`);
      console.log(`Average Coherence: ${stats.averageCoherence.toFixed(3)}`);
      console.log(`Processing Rate: ${stats.processingRate.toFixed(1)} points/sec`);
      console.log(`Active Sources: ${stats.sources.active}/${stats.sources.total}`);
      console.log(`Health Status: ${health.status}`);
      console.log(`Memory Usage: ${health.metrics.memoryMB.toFixed(0)}MB`);
      console.log('------------------------\n');
    }, 30000);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 Shutting down ECNE...');
      await ecne.stop();
      console.log('✅ ECNE stopped gracefully');
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to start ECNE:', error);
    process.exit(1);
  }
}

// Run the launcher
main().catch(console.error);