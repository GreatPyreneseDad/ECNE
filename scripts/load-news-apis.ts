import { ECNEDataRiver } from '../src/ecne';
import { APISource } from '../src/types';

// Real news APIs that don't require authentication
const NEWS_APIS: APISource[] = [
  {
    id: 'hackernews',
    name: 'Hacker News',
    baseUrl: 'https://hacker-news.firebaseio.com',
    endpoints: [
      {
        path: '/v0/topstories.json',
        method: 'GET',
        refreshInterval: 300 // 5 minutes
      },
      {
        path: '/v0/newstories.json', 
        method: 'GET',
        refreshInterval: 600 // 10 minutes
      }
    ],
    rateLimits: {
      requestsPerMinute: 30,
      requestsPerHour: 500
    }
  },
  {
    id: 'reddit-worldnews',
    name: 'Reddit World News',
    baseUrl: 'https://www.reddit.com',
    endpoints: [{
      path: '/r/worldnews/hot.json?limit=25',
      method: 'GET',
      refreshInterval: 300
    }],
    rateLimits: {
      requestsPerMinute: 30,
      requestsPerHour: 300
    }
  },
  {
    id: 'reddit-technology',
    name: 'Reddit Technology',
    baseUrl: 'https://www.reddit.com',
    endpoints: [{
      path: '/r/technology/hot.json?limit=25',
      method: 'GET',
      refreshInterval: 300
    }],
    rateLimits: {
      requestsPerMinute: 30,
      requestsPerHour: 300
    }
  },
  {
    id: 'arxiv-cs',
    name: 'ArXiv Computer Science',
    baseUrl: 'http://export.arxiv.org',
    endpoints: [{
      path: '/api/query?search_query=cat:cs.*&start=0&max_results=20&sortBy=submittedDate&sortOrder=descending',
      method: 'GET',
      refreshInterval: 3600 // 1 hour
    }],
    rateLimits: {
      requestsPerMinute: 5,
      requestsPerHour: 100
    }
  },
  {
    id: 'wikipedia-current-events',
    name: 'Wikipedia Current Events',
    baseUrl: 'https://en.wikipedia.org',
    endpoints: [{
      path: '/api/rest_v1/page/summary/Portal:Current_events',
      method: 'GET',
      refreshInterval: 3600
    }],
    rateLimits: {
      requestsPerMinute: 100,
      requestsPerHour: 1000
    }
  }
];

async function runNewsAPIs() {
  console.log('🗞️  Starting ECNE with Real News APIs\n');

  const ecne = new ECNEDataRiver({
    filter: {
      sensitivity: 0.4, // Medium sensitivity for news
      weights: {
        psi: 0.3,  // Internal consistency 
        rho: 0.3,  // Accumulated wisdom
        q: 0.2,    // Moral activation
        f: 0.2     // Social belonging
      },
      enableAnomalyDetection: true,
      enablePrediction: true
    },
    storage: {
      type: 'postgres',
      fallbackToMock: true
    },
    collector: {
      maxConcurrent: 5,
      retryAttempts: 3,
      batchSize: 25
    },
    dashboard: {
      enabled: true,
      port: 3000,
      host: 'localhost'
    },
    cache: {
      enabled: true,
      maxMemoryItems: 5000,
      defaultTTL: 300000 // 5 minutes
    },
    security: {
      rateLimiting: true,
      validation: true
    }
  });

  // Enhanced event handlers for news
  ecne.on('filtered-data', (data) => {
    const preview = data.data.title || data.data.name || JSON.stringify(data.data).substring(0, 100);
    console.log(`📰 [${data.source}] Score: ${data.coherenceScore.toFixed(3)}`);
    console.log(`   ${preview}\n`);
  });

  ecne.on('anomaly-detected', (anomaly) => {
    console.log(`🚨 Breaking News Pattern Detected!`);
    console.log(`   Source: ${anomaly.source}`);
    console.log(`   Deviation: ${anomaly.deviation.toFixed(2)}σ from baseline\n`);
  });

  ecne.on('prediction', (prediction) => {
    console.log(`🔮 Trend Prediction: ${prediction.trend}`);
    console.log(`   Confidence: ${(prediction.confidence * 100).toFixed(1)}%\n`);
  });

  try {
    await ecne.initialize();
    await ecne.start(NEWS_APIS);

    console.log('✅ ECNE is now monitoring real news sources!');
    console.log('📊 Dashboard: http://localhost:3000');
    console.log('🔍 Filtering news for high-coherence stories...\n');

    // Show top stories every 2 minutes
    setInterval(async () => {
      const stats = ecne.getStatistics();
      const topStories = await ecne.getTopFilteredData(5);
      
      console.log('\n📈 === Top Coherent Stories ===');
      topStories.forEach((story, i) => {
        console.log(`${i + 1}. [${story.coherenceScore.toFixed(3)}] ${story.data.title || 'Untitled'}`);
      });
      
      console.log(`\n📊 Total Processed: ${stats.processed} | Filter Rate: ${stats.filterRate.toFixed(1)}%`);
      console.log('=============================\n');
    }, 120000);

    process.on('SIGINT', async () => {
      console.log('\n🛑 Stopping news monitoring...');
      await ecne.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to start news monitoring:', error);
    process.exit(1);
  }
}

runNewsAPIs().catch(console.error);