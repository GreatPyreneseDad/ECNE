/**
 * Quick Start Example
 * Demonstrates ECNE Data River with mock data
 */

import { ECNEDataRiverSafe, ECNEConfig } from '../src/index-safe';
import { APISource } from '../src/collectors/data-river';

async function quickStart() {
  console.log('🚀 ECNE Data River Quick Start\n');
  
  // Configuration with mock database
  const config: ECNEConfig = {
    filter: {
      sensitivity: 0.3, // Low threshold to see more results
      weights: {
        psi: 0.25,
        rho: 0.25,
        q: 0.25,
        f: 0.25
      },
      contextWindow: 5,
      patternMemory: 100
    },
    collector: {
      maxConcurrent: 5,
      retryAttempts: 2,
      retryDelay: 1000
    },
    storage: {
      connectionString: 'mock://localhost/demo',
      retention: 7,
      useMock: true
    },
    dashboard: {
      port: 3001,
      enabled: true
    }
  };

  // Create ECNE instance
  const ecne = new ECNEDataRiverSafe(config);
  
  try {
    // Initialize
    console.log('📦 Initializing ECNE...');
    await ecne.initialize();
    
    // Create mock API sources
    const mockSources: APISource[] = [
      {
        id: 'demo-news',
        name: 'Demo News Feed',
        baseUrl: 'https://jsonplaceholder.typicode.com',
        endpoints: [{
          path: '/posts',
          method: 'GET',
          refreshInterval: 10,
          dataExtractor: (response) => {
            // Transform posts to look like news articles
            return response.slice(0, 5).map((post: any) => ({
              ...post,
              title: `Breaking: ${post.title}`,
              content: post.body,
              keywords: ['community', 'together', 'ethics', 'value']
            }));
          }
        }],
        auth: { type: 'none' }
      },
      {
        id: 'demo-users',
        name: 'Demo Social Feed',
        baseUrl: 'https://jsonplaceholder.typicode.com',
        endpoints: [{
          path: '/comments',
          method: 'GET',
          refreshInterval: 15,
          dataExtractor: (response) => {
            // Transform comments to look like social posts
            return response.slice(0, 10).map((comment: any) => ({
              ...comment,
              content: comment.body,
              author: comment.email,
              social_engagement: true
            }));
          }
        }],
        auth: { type: 'none' }
      }
    ];
    
    // Start data collection
    console.log('\n🌊 Starting data river...');
    await ecne.start(mockSources);
    
    console.log('\n✅ ECNE is running!');
    console.log(`📊 Dashboard: http://localhost:${config.dashboard.port}`);
    console.log('\n📈 Statistics will be logged every minute');
    console.log('Press Ctrl+C to stop\n');
    
    // Show real-time statistics
    setInterval(() => {
      const stats = ecne.getStatistics();
      console.log('\n📊 Current Statistics:');
      console.log(`  Processed: ${stats.processed} data points`);
      console.log(`  Filtered: ${stats.filtered} (${stats.filterRate})`);
      console.log(`  Active sources: ${stats.collector.sources}`);
      console.log(`  Health: ${stats.health}`);
    }, 30000); // Every 30 seconds
    
    // Handle shutdown
    process.on('SIGINT', async () => {
      console.log('\n\n👋 Shutting down...');
      await ecne.stop();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    await ecne.stop();
    process.exit(1);
  }
}

// Run the example
if (require.main === module) {
  quickStart();
}