/**
 * Example: News Coherence Monitoring
 * Track coherent news patterns across multiple sources
 */

import ECNEDataRiver from '../src/index';
import { APISource } from '../src/collectors/data-river';

async function monitorNewsCoherence() {
  // Configure ECNE for news analysis
  const config = {
    filter: {
      sensitivity: 0.6, // Moderate threshold
      weights: {
        psi: 0.2,  // Lower weight on consistency
        rho: 0.4,  // Higher weight on historical patterns
        q: 0.2,    // Moderate moral relevance
        f: 0.2     // Moderate social relevance
      },
      contextWindow: 120, // 2 hours
      patternMemory: 5000
    },
    collector: {
      maxConcurrent: 5,
      retryAttempts: 3,
      retryDelay: 2000
    },
    storage: {
      connectionString: process.env.DATABASE_URL!,
      retention: 7 // Keep news for a week
    },
    dashboard: {
      port: 3000
    }
  };

  const ecne = new ECNEDataRiver(config);
  await ecne.initialize();

  // Define news sources (these would need real API endpoints)
  const newsSources: APISource[] = [
    {
      id: 'hackernews',
      name: 'Hacker News',
      baseUrl: 'https://hacker-news.firebaseio.com/v0',
      endpoints: [{
        path: '/topstories.json',
        method: 'GET',
        refreshInterval: 300, // 5 minutes
        dataExtractor: async (storyIds: number[]) => {
          // Fetch top 10 stories
          const stories = [];
          for (const id of storyIds.slice(0, 10)) {
            const response = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
            const story = await response.json();
            stories.push(story);
          }
          return stories;
        }
      }],
      auth: { type: 'none' }
    },
    {
      id: 'reddit-tech',
      name: 'Reddit Technology',
      baseUrl: 'https://www.reddit.com',
      endpoints: [{
        path: '/r/technology/hot.json',
        method: 'GET',
        refreshInterval: 300,
        dataExtractor: (response) => {
          return response.data.children.map((child: any) => child.data);
        }
      }],
      auth: { type: 'none' }
    }
  ];

  // Start monitoring
  await ecne.start(newsSources);

  // Log high-coherence patterns
  setInterval(async () => {
    const stats = ecne.getStatistics();
    console.log('\n📊 News Coherence Stats:');
    console.log(`Filter Rate: ${stats.filterRate}`);
    console.log(`Patterns Detected: ${stats.filter.patternCount}`);
    console.log(`Active Sources: ${stats.collector.sources}`);
  }, 60000);

  // Example: Adjust filter for breaking news
  // Increase sensitivity and reduce historical weight
  setTimeout(() => {
    console.log('\n🔄 Switching to breaking news mode...');
    ecne.updateFilterConfig({
      sensitivity: 0.4, // Lower threshold
      weights: {
        psi: 0.4,  // Higher consistency weight
        rho: 0.1,  // Lower historical weight
        q: 0.3,    // Maintain moral relevance
        f: 0.2     // Maintain social relevance
      }
    });
  }, 300000); // After 5 minutes
}

// Run the example
if (require.main === module) {
  monitorNewsCoherence().catch(console.error);
}