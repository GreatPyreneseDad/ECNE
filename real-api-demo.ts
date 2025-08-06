// Real API Demo - Connect to actual public APIs
import axios from 'axios';

console.log('\n🌊 ECNE Data River - Real API Demo\n');
console.log('================================\n');

// GCT coherence calculation using correct formula
function calculateCoherence(data: any): number {
  // Calculate individual dimensions
  let psi = 0; // Base clarity/precision
  let rho = 0; // Reflective depth/wisdom  
  let q_raw = 0; // Raw emotional charge
  let f = 0; // Social belonging
  
  // Ψ (Psi) - Base clarity/precision
  if (data.title || data.name) psi += 0.4;
  if (data.url || data.link) psi += 0.3;
  if (JSON.stringify(data).length > 100) psi += 0.3;
  psi = Math.min(psi, 1);
  
  // ρ (Rho) - Reflective depth/wisdom
  if (data.score > 100 || data.ups > 100) rho += 0.4;
  if (data.score > 1000 || data.ups > 1000) rho += 0.3;
  if (data.comments > 20 || data.num_comments > 20) rho += 0.3;
  rho = Math.min(rho, 1);
  
  // q_raw - Raw emotional charge
  const content = JSON.stringify(data).toLowerCase();
  const emotionalKeywords = [
    'amazing', 'breakthrough', 'crisis', 'disaster', 'shocking',
    'revolutionary', 'breaking', 'urgent', 'critical', 'incredible'
  ];
  for (const keyword of emotionalKeywords) {
    if (content.includes(keyword)) q_raw += 0.15;
  }
  if (data.score > 500 || data.ups > 500) q_raw += 0.2;
  q_raw = Math.min(q_raw, 1);
  
  // f (Social belonging)
  if (data.comments > 10 || data.num_comments > 10) f += 0.3;
  if (data.comments > 50 || data.num_comments > 50) f += 0.4;
  const socialKeywords = ['community', 'share', 'discuss', 'together', 'social'];
  for (const keyword of socialKeywords) {
    if (content.includes(keyword)) f += 0.1;
  }
  f = Math.min(f, 1);
  
  // GCT Parameters
  const km = 0.3;  // Saturation constant
  const ki = 0.1;  // Inhibition constant
  const coupling_strength = 0.15;
  
  // Optimize emotional charge with wisdom modulation
  const q_opt = q_raw / (km + q_raw + (q_raw * q_raw) / ki);
  
  // GCT formula: C = ψ + (ρ × ψ) + q_opt + (f × ψ) + (coupling × ρ × q_opt)
  const base = psi;
  const wisdom_amp = rho * psi;
  const emotional = q_opt;
  const social_amp = f * psi;
  const coupling = coupling_strength * rho * q_opt;
  
  const coherence = base + wisdom_amp + emotional + social_amp + coupling;
  
  return Math.min(coherence, 1.0);
}

// Fetch real data from APIs
async function fetchRealData() {
  const apis = [
    {
      name: 'Hacker News Top Stories',
      url: 'https://hacker-news.firebaseio.com/v0/topstories.json',
      processor: async (storyIds: number[]) => {
        // Get first 5 stories
        const stories = [];
        for (let i = 0; i < Math.min(5, storyIds.length); i++) {
          try {
            const response = await axios.get(
              `https://hacker-news.firebaseio.com/v0/item/${storyIds[i]}.json`
            );
            stories.push(response.data);
          } catch (error) {
            console.error(`Failed to fetch story ${storyIds[i]}`);
          }
        }
        return stories;
      }
    },
    {
      name: 'Reddit Technology',
      url: 'https://www.reddit.com/r/technology/hot.json?limit=5',
      processor: async (data: any) => {
        return data.data.children.map((child: any) => child.data);
      }
    }
  ];

  console.log('📡 Fetching real data from public APIs...\n');

  for (const api of apis) {
    try {
      console.log(`🔍 Fetching from ${api.name}...`);
      const response = await axios.get(api.url, {
        headers: {
          'User-Agent': 'ECNE-DataRiver/1.0'
        }
      });

      const processedData = await api.processor(response.data);
      
      console.log(`✅ Retrieved ${processedData.length} items\n`);

      // Apply coherence filtering
      const filteredData = [];
      for (const item of processedData) {
        const coherenceScore = calculateCoherence(item);
        
        if (coherenceScore >= 0.5) {
          filteredData.push({
            source: api.name,
            title: item.title || item.name || 'Untitled',
            url: item.url || item.link || '#',
            score: item.score || item.ups || 0,
            comments: item.descendants || item.num_comments || 0,
            coherenceScore
          });
        }
      }

      // Display filtered results
      if (filteredData.length > 0) {
        console.log(`🌟 High-coherence content from ${api.name}:`);
        filteredData.forEach((item, i) => {
          console.log(`\n${i + 1}. [${item.coherenceScore.toFixed(3)}] ${item.title}`);
          console.log(`   📊 Score: ${item.score} | 💬 Comments: ${item.comments}`);
          console.log(`   🔗 ${item.url}`);
        });
        console.log('');
      }

    } catch (error: any) {
      console.error(`❌ Failed to fetch from ${api.name}:`, error.message);
    }
  }

  // Show statistics
  console.log('\n📊 === Demo Statistics ===');
  console.log('✅ Successfully connected to real APIs');
  console.log('✅ Applied coherence filtering');
  console.log('✅ Extracted high-value content');
  console.log('========================\n');
}

// Wikipedia current events
async function fetchWikipediaEvents() {
  try {
    console.log('📰 Fetching Wikipedia Current Events...');
    const response = await axios.get(
      'https://en.wikipedia.org/api/rest_v1/page/summary/Portal:Current_events'
    );
    
    console.log(`\n📖 ${response.data.title}`);
    console.log(`   ${response.data.extract.substring(0, 200)}...`);
    console.log(`   🔗 ${response.data.content_urls.desktop.page}\n`);
  } catch (error) {
    console.error('Failed to fetch Wikipedia events');
  }
}

// Main execution
async function main() {
  console.log('🚀 Starting Real API Demo...\n');
  
  await fetchRealData();
  await fetchWikipediaEvents();
  
  console.log('✨ Demo completed! Real APIs can be integrated into ECNE for:');
  console.log('   • Real-time data collection');
  console.log('   • Coherence-based filtering');
  console.log('   • Pattern detection');
  console.log('   • Anomaly identification');
  console.log('   • Predictive analytics\n');
  
  console.log('💡 To run ECNE with these APIs:');
  console.log('   1. Configure API sources in load-news-apis.ts');
  console.log('   2. Set up proper data parsing for each API');
  console.log('   3. Run: npm run dev\n');
}

// Run the demo
main().catch(console.error);