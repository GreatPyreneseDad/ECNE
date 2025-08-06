import { PublicAPIParser } from '../src/utils/parse-public-apis';
import { ECNEDataRiver } from '../src/ecne';
import * as path from 'path';

async function loadPublicAPIs() {
  console.log('🔍 Loading Public APIs from repository...\n');

  // Parse the public APIs
  const parser = new PublicAPIParser();
  const apiListPath = path.join('/Users/chris/public-api-lists/README.md');
  
  try {
    const allAPIs = await parser.parseMarkdown(apiListPath);
    console.log(`✅ Found ${allAPIs.length} total APIs\n`);

    // Show categories
    const categories = parser.getCategories();
    console.log('📚 API Categories:');
    categories.forEach((count, category) => {
      console.log(`   - ${category}: ${count} APIs`);
    });
    console.log('');

    // Get free APIs (no auth required)
    const freeAPIs = parser.getFreeAPIs();
    console.log(`🆓 Free APIs (no auth): ${freeAPIs.length}`);

    // Get CORS-enabled APIs
    const corsAPIs = parser.getCORSEnabledAPIs();
    console.log(`🌐 CORS-enabled APIs: ${corsAPIs.length}\n`);

    // Convert to ECNE format with filters
    const apiSources = parser.convertToAPISources(allAPIs, {
      filterByAuth: true,     // Only free APIs
      filterByHttps: true,    // Only HTTPS
      filterByCors: true,     // Only CORS-enabled
      categories: [           // Select specific categories
        'News',
        'Weather', 
        'Finance',
        'Science & Math',
        'Open Data',
        'Government'
      ],
      limit: 20               // Start with 20 APIs
    });

    console.log(`🎯 Selected ${apiSources.length} APIs for ECNE:\n`);
    apiSources.forEach(source => {
      console.log(`   • ${source.name} (${source.metadata?.category})`);
      console.log(`     ${source.metadata?.description}`);
    });

    // Initialize ECNE with real APIs
    console.log('\n🚀 Starting ECNE with real public APIs...\n');

    const ecne = new ECNEDataRiver({
      filter: {
        sensitivity: 0.3,  // Lower threshold for diverse data
        weights: { 
          psi: 0.3,   // Internal consistency
          rho: 0.3,   // Wisdom/experience
          q: 0.2,     // Moral activation
          f: 0.2      // Social belonging
        },
        enableAnomalyDetection: true,
        enablePrediction: true
      },
      storage: {
        type: 'postgres',
        fallbackToMock: true
      },
      collector: {
        maxConcurrent: 5,  // Limit concurrent requests
        retryAttempts: 2,
        batchSize: 10
      },
      dashboard: {
        enabled: true,
        port: 3000,
        host: 'localhost'
      },
      security: {
        rateLimiting: true,
        validation: true
      }
    });

    // Event handlers
    ecne.on('filtered-data', (data) => {
      console.log(`✨ [${data.source}] Score: ${data.coherenceScore.toFixed(3)} - ${data.data.title || data.data.name || 'Data point'}`);
    });

    ecne.on('anomaly-detected', (anomaly) => {
      console.log(`🚨 Anomaly in ${anomaly.source}: ${anomaly.deviation.toFixed(2)}σ deviation`);
    });

    ecne.on('error', (error) => {
      console.error(`❌ Error: ${error.message}`);
    });

    // Initialize and start
    await ecne.initialize();
    await ecne.start(apiSources);

    console.log('\n✅ ECNE is now running with real public APIs!');
    console.log('📊 Dashboard: http://localhost:3000');
    console.log('📈 Collecting and filtering real-time data...\n');

    // Show statistics every minute
    setInterval(async () => {
      const stats = ecne.getStatistics();
      console.log('\n📊 === Real-Time Statistics ===');
      console.log(`   Data Points: ${stats.processed}`);
      console.log(`   Filtered: ${stats.filtered} (${stats.filterRate.toFixed(1)}%)`);
      console.log(`   Coherence Avg: ${stats.averageCoherence.toFixed(3)}`);
      console.log(`   Active Sources: ${stats.sources.active}/${stats.sources.total}`);
      console.log('==============================\n');
    }, 60000);

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 Stopping ECNE...');
      await ecne.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to load public APIs:', error);
    process.exit(1);
  }
}

// Run the loader
loadPublicAPIs().catch(console.error);