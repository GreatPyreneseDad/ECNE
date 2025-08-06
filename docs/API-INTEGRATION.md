# 🔌 API Integration Guide

## Overview

ECNE's flexible architecture allows integration with any RESTful API, GraphQL endpoint, or WebSocket stream. This guide covers adding custom data sources, configuring authentication, handling rate limits, and optimizing data flow.

## 🚀 Quick Start

### Adding a Simple API Source

```typescript
import { APISource } from '../src/types';

const customSource: APISource = {
  id: 'my-news-api',
  name: 'Custom News API',
  baseUrl: 'https://api.example.com',
  endpoints: [{
    path: '/articles',
    method: 'GET',
    refreshInterval: 300, // 5 minutes
    params: {
      category: 'technology',
      limit: 50
    }
  }],
  authentication: {
    type: 'api-key',
    apiKey: process.env.NEWS_API_KEY,
    headerName: 'X-API-Key'
  },
  rateLimits: {
    requestsPerMinute: 100,
    requestsPerHour: 1000
  }
};

// Add to ECNE collector
collector.addSource(customSource);
```

### Testing Your Integration

```bash
# Test API connectivity
npm run test:api -- --source my-news-api

# Validate data structure  
npm run validate:source -- --source my-news-api --samples 10

# Monitor integration
npm run monitor -- --source my-news-api --duration 60
```

## 🏗️ Data Source Types

### 1. REST APIs

Most common integration type with full CRUD support.

```typescript
interface RESTAPISource extends APISource {
  type: 'rest';
  endpoints: RESTEndpoint[];
  pagination?: PaginationConfig;
  transformation?: DataTransformation;
}

interface RESTEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  params?: Record<string, any>;
  body?: any;
  refreshInterval?: number; // seconds
  timeout?: number; // milliseconds
  retries?: number;
}

// Example: Financial data API
const financialAPI: RESTAPISource = {
  id: 'financial-data',
  name: 'Financial Market API',
  type: 'rest',
  baseUrl: 'https://api.financialdata.com',
  endpoints: [
    {
      path: '/market/stocks',
      method: 'GET',
      refreshInterval: 60, // 1 minute for real-time data
      params: {
        symbols: ['AAPL', 'GOOGL', 'MSFT'],
        fields: 'price,volume,change'
      }
    },
    {
      path: '/market/news',
      method: 'GET', 
      refreshInterval: 300, // 5 minutes for news
      params: {
        category: 'technology',
        limit: 20
      }
    }
  ],
  authentication: {
    type: 'bearer',
    token: process.env.FINANCIAL_API_TOKEN
  }
};
```

### 2. GraphQL APIs

Efficient data fetching with precise field selection.

```typescript
interface GraphQLSource extends APISource {
  type: 'graphql';
  endpoint: string;
  queries: GraphQLQuery[];
  subscriptions?: GraphQLSubscription[];
}

interface GraphQLQuery {
  name: string;
  query: string;
  variables?: Record<string, any>;
  refreshInterval?: number;
  transform?: (data: any) => DataPoint[];
}

// Example: GitHub GraphQL API
const githubGraphQL: GraphQLSource = {
  id: 'github-graphql',
  name: 'GitHub Repository Data',
  type: 'graphql',
  baseUrl: 'https://api.github.com/graphql',
  queries: [
    {
      name: 'trending-repos',
      query: `
        query TrendingRepos($first: Int!, $since: DateTime!) {
          search(query: "stars:>1000 created:>$since", type: REPOSITORY, first: $first) {
            nodes {
              ... on Repository {
                name
                description
                stargazerCount
                primaryLanguage { name }
                createdAt
                updatedAt
                url
              }
            }
          }
        }
      `,
      variables: {
        first: 50,
        since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      },
      refreshInterval: 1800, // 30 minutes
      transform: (data) => {
        return data.search.nodes.map(repo => ({
          id: `github-${repo.name}`,
          source: 'github-graphql',
          timestamp: new Date(),
          content: repo,
          metadata: {
            language: repo.primaryLanguage?.name,
            stars: repo.stargazerCount
          }
        }));
      }
    }
  ],
  authentication: {
    type: 'bearer',
    token: process.env.GITHUB_TOKEN
  }
};
```

### 3. WebSocket Streams

Real-time data streams for high-frequency updates.

```typescript
interface WebSocketSource extends APISource {
  type: 'websocket';
  url: string;
  protocols?: string[];
  subscriptions: WebSocketSubscription[];
  heartbeat?: HeartbeatConfig;
}

interface WebSocketSubscription {
  subscribe: any; // Subscription message
  unsubscribe?: any; // Unsubscription message  
  messageHandler: (message: any) => DataPoint | DataPoint[] | null;
}

// Example: Cryptocurrency price stream
const cryptoWebSocket: WebSocketSource = {
  id: 'crypto-stream',
  name: 'Real-time Crypto Prices',
  type: 'websocket',
  url: 'wss://stream.binance.com:9443/ws/btcusdt@ticker',
  subscriptions: [
    {
      subscribe: {
        method: 'SUBSCRIBE',
        params: ['btcusdt@ticker', 'ethusdt@ticker'],
        id: 1
      },
      messageHandler: (message) => {
        if (message.e === '24hrTicker') {
          return {
            id: `crypto-${message.s}-${Date.now()}`,
            source: 'crypto-stream',
            timestamp: new Date(message.E),
            content: {
              symbol: message.s,
              price: parseFloat(message.c),
              change: parseFloat(message.P),
              volume: parseFloat(message.v)
            },
            metadata: {
              exchange: 'binance',
              type: 'price-update'
            }
          };
        }
        return null;
      }
    }
  ],
  heartbeat: {
    interval: 30000, // 30 seconds
    message: { ping: Date.now() }
  }
};
```

## 🔐 Authentication Methods

### API Key Authentication

```typescript
// Header-based API key
const headerKeyAuth: Authentication = {
  type: 'api-key',
  apiKey: process.env.API_KEY,
  headerName: 'X-API-Key'
};

// Query parameter API key
const queryKeyAuth: Authentication = {
  type: 'api-key',
  apiKey: process.env.API_KEY,
  paramName: 'api_key'
};
```

### OAuth 2.0

```typescript
interface OAuth2Authentication {
  type: 'oauth2';
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  scopes?: string[];
  refreshToken?: string;
}

// OAuth 2.0 implementation
const oauthConfig: OAuth2Authentication = {
  type: 'oauth2',
  clientId: process.env.OAUTH_CLIENT_ID!,
  clientSecret: process.env.OAUTH_CLIENT_SECRET!,
  tokenUrl: 'https://api.example.com/oauth/token',
  scopes: ['read:data', 'read:analytics']
};

class OAuthManager {
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  async getAccessToken(config: OAuth2Authentication): Promise<string> {
    if (this.isTokenValid()) {
      return this.accessToken!;
    }

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: config.scopes?.join(' ') || ''
      })
    });

    const tokenData = await response.json();
    this.accessToken = tokenData.access_token;
    this.tokenExpiry = new Date(Date.now() + tokenData.expires_in * 1000);
    
    return this.accessToken;
  }

  private isTokenValid(): boolean {
    return this.accessToken !== null && 
           this.tokenExpiry !== null && 
           this.tokenExpiry > new Date();
  }
}
```

### JWT Authentication

```typescript
interface JWTAuthentication {
  type: 'jwt';
  secret: string;
  algorithm: 'HS256' | 'RS256';
  expiresIn: string;
  claims?: Record<string, any>;
}

// JWT token generation
const jwtAuth: JWTAuthentication = {
  type: 'jwt',
  secret: process.env.JWT_SECRET!,
  algorithm: 'HS256',
  expiresIn: '1h',
  claims: {
    sub: 'ecne-data-river',
    iss: 'ecne-system',
    aud: 'api-service'
  }
};
```

## 📊 Data Transformation

### Transform Pipeline

```typescript
interface DataTransformation {
  steps: TransformationStep[];
  validation?: ValidationSchema;
  errorHandling?: ErrorHandlingStrategy;
}

interface TransformationStep {
  type: 'map' | 'filter' | 'flatten' | 'group' | 'sort' | 'custom';
  config: any;
}

// Example transformation pipeline
const newsApiTransform: DataTransformation = {
  steps: [
    {
      type: 'map',
      config: {
        mapping: {
          'id': 'article.id',
          'title': 'article.title', 
          'content': 'article.description',
          'publishedAt': 'article.publishedAt',
          'source': 'article.source.name',
          'url': 'article.url'
        }
      }
    },
    {
      type: 'filter',
      config: {
        conditions: [
          { field: 'title', operator: 'exists' },
          { field: 'publishedAt', operator: 'not-null' },
          { field: 'content', operator: 'min-length', value: 50 }
        ]
      }
    },
    {
      type: 'custom',
      config: {
        function: (data: any[]) => {
          return data.map(item => ({
            ...item,
            coherenceHint: extractCoherenceHints(item.title, item.content),
            sentiment: analyzeSentiment(item.content),
            timestamp: new Date(item.publishedAt)
          }));
        }
      }
    }
  ],
  validation: {
    schema: {
      id: { type: 'string', required: true },
      title: { type: 'string', required: true, minLength: 10 },
      content: { type: 'string', required: true, minLength: 50 },
      timestamp: { type: 'date', required: true }
    }
  },
  errorHandling: {
    strategy: 'skip-invalid',
    logErrors: true,
    maxErrors: 10
  }
};
```

### Advanced Transformations

```typescript
// Content extraction for different data types
const contentExtractors = {
  'application/json': (response: any) => {
    return Array.isArray(response.data) ? response.data : [response.data];
  },
  
  'application/xml': (response: string) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(response, 'application/xml');
    return Array.from(doc.querySelectorAll('item')).map(item => ({
      title: item.querySelector('title')?.textContent,
      description: item.querySelector('description')?.textContent,
      pubDate: item.querySelector('pubDate')?.textContent
    }));
  },
  
  'text/csv': (response: string) => {
    const lines = response.split('\n');
    const headers = lines[0].split(',');
    return lines.slice(1).map(line => {
      const values = line.split(',');
      const obj: any = {};
      headers.forEach((header, index) => {
        obj[header.trim()] = values[index]?.trim();
      });
      return obj;
    });
  }
};

// Data enrichment
const enrichData = async (dataPoint: DataPoint): Promise<DataPoint> => {
  const enriched = { ...dataPoint };
  
  // Add geographical information
  if (dataPoint.metadata?.location) {
    enriched.metadata.geo = await getGeoData(dataPoint.metadata.location);
  }
  
  // Extract entities (people, organizations, locations)
  if (dataPoint.content && typeof dataPoint.content === 'string') {
    enriched.metadata.entities = extractEntities(dataPoint.content);
  }
  
  // Add temporal features
  enriched.metadata.temporal = {
    dayOfWeek: dataPoint.timestamp.getDay(),
    hourOfDay: dataPoint.timestamp.getHours(),
    isWeekend: [0, 6].includes(dataPoint.timestamp.getDay())
  };
  
  return enriched;
};
```

## ⚡ Rate Limiting & Performance

### Rate Limiting Implementation

```typescript
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  
  constructor(
    private requestsPerMinute: number,
    private requestsPerHour: number
  ) {}
  
  async checkLimit(sourceId: string): Promise<boolean> {
    const now = Date.now();
    const requests = this.requests.get(sourceId) || [];
    
    // Remove requests older than 1 hour
    const validRequests = requests.filter(time => now - time < 60 * 60 * 1000);
    
    // Check hourly limit
    if (validRequests.length >= this.requestsPerHour) {
      return false;
    }
    
    // Check per-minute limit
    const recentRequests = validRequests.filter(time => now - time < 60 * 1000);
    if (recentRequests.length >= this.requestsPerMinute) {
      return false;
    }
    
    // Record this request
    validRequests.push(now);
    this.requests.set(sourceId, validRequests);
    
    return true;
  }
  
  getTimeToNextRequest(sourceId: string): number {
    const requests = this.requests.get(sourceId) || [];
    const now = Date.now();
    
    const recentRequests = requests.filter(time => now - time < 60 * 1000);
    
    if (recentRequests.length < this.requestsPerMinute) {
      return 0;
    }
    
    const oldestRecent = Math.min(...recentRequests);
    return 60 * 1000 - (now - oldestRecent);
  }
}

// Usage in data collector
const rateLimiter = new RateLimiter(60, 1000); // 60/min, 1000/hour

const fetchWithRateLimit = async (source: APISource): Promise<any> => {
  if (!await rateLimiter.checkLimit(source.id)) {
    const waitTime = rateLimiter.getTimeToNextRequest(source.id);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  return fetch(source.baseUrl);
};
```

### Connection Pooling

```typescript
class ConnectionPool {
  private pools: Map<string, http.Agent> = new Map();
  
  getAgent(baseUrl: string): http.Agent {
    if (!this.pools.has(baseUrl)) {
      const agent = new https.Agent({
        keepAlive: true,
        maxSockets: 10,
        maxFreeSockets: 5,
        timeout: 30000,
        freeSocketTimeout: 15000
      });
      this.pools.set(baseUrl, agent);
    }
    
    return this.pools.get(baseUrl)!;
  }
  
  destroy(): void {
    for (const agent of this.pools.values()) {
      agent.destroy();
    }
    this.pools.clear();
  }
}

// HTTP client with connection pooling
const httpClient = axios.create({
  timeout: 30000,
  httpAgent: connectionPool.getAgent('http://api.example.com'),
  httpsAgent: connectionPool.getAgent('https://api.example.com'),
  headers: {
    'User-Agent': 'ECNE-DataRiver/1.0',
    'Accept-Encoding': 'gzip, deflate'
  }
});
```

## 🛡️ Error Handling

### Retry Logic

```typescript
interface RetryConfig {
  attempts: number;
  backoffFactor: number;
  maxDelay: number;
  retryableErrors: string[];
}

class RetryHandler {
  constructor(private config: RetryConfig) {}
  
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.config.attempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry non-retryable errors
        if (!this.isRetryableError(error)) {
          throw error;
        }
        
        // Don't wait after last attempt
        if (attempt === this.config.attempts) {
          break;
        }
        
        const delay = this.calculateDelay(attempt);
        console.warn(
          `${context} failed (attempt ${attempt}/${this.config.attempts}). ` +
          `Retrying in ${delay}ms. Error: ${(error as Error).message}`
        );
        
        await this.sleep(delay);
      }
    }
    
    throw new Error(
      `${context} failed after ${this.config.attempts} attempts. ` +
      `Last error: ${lastError.message}`
    );
  }
  
  private isRetryableError(error: any): boolean {
    if (error.code && this.config.retryableErrors.includes(error.code)) {
      return true;
    }
    
    // HTTP status codes that are retryable
    const retryableStatusCodes = [429, 502, 503, 504];
    if (error.response && retryableStatusCodes.includes(error.response.status)) {
      return true;
    }
    
    return false;
  }
  
  private calculateDelay(attempt: number): number {
    const baseDelay = 1000; // 1 second
    const delay = baseDelay * Math.pow(this.config.backoffFactor, attempt - 1);
    return Math.min(delay, this.config.maxDelay);
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Usage
const retryHandler = new RetryHandler({
  attempts: 3,
  backoffFactor: 2,
  maxDelay: 10000,
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND']
});

const fetchData = async (url: string) => {
  return retryHandler.executeWithRetry(
    () => fetch(url),
    `Fetching data from ${url}`
  );
};
```

### Circuit Breaker

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  constructor(
    private failureThreshold: number,
    private recoveryTimeout: number
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailTime > this.recoveryTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }
  
  private onFailure(): void {
    this.failures++;
    this.lastFailTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
  
  getState(): { state: string; failures: number } {
    return { state: this.state, failures: this.failures };
  }
}
```

## 📈 Monitoring & Analytics

### API Health Monitoring

```typescript
interface APIHealthMetrics {
  sourceId: string;
  status: 'healthy' | 'degraded' | 'down';
  responseTime: number;
  errorRate: number;
  lastSuccessfulRequest: Date;
  consecutiveFailures: number;
}

class APIHealthMonitor {
  private metrics: Map<string, APIHealthMetrics> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  
  startMonitoring(sources: APISource[]): void {
    this.healthCheckInterval = setInterval(() => {
      sources.forEach(source => this.checkSourceHealth(source));
    }, 60000); // Check every minute
  }
  
  stopMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }
  
  private async checkSourceHealth(source: APISource): Promise<void> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(`${source.baseUrl}/health`, {
        method: 'HEAD',
        timeout: 5000
      });
      
      const responseTime = Date.now() - startTime;
      const isHealthy = response.ok;
      
      this.updateMetrics(source.id, {
        status: isHealthy ? 'healthy' : 'degraded',
        responseTime,
        errorRate: this.calculateErrorRate(source.id, false),
        lastSuccessfulRequest: isHealthy ? new Date() : this.getLastSuccessful(source.id),
        consecutiveFailures: isHealthy ? 0 : this.incrementFailures(source.id)
      });
      
    } catch (error) {
      this.updateMetrics(source.id, {
        status: 'down',
        responseTime: -1,
        errorRate: this.calculateErrorRate(source.id, true),
        lastSuccessfulRequest: this.getLastSuccessful(source.id),
        consecutiveFailures: this.incrementFailures(source.id)
      });
    }
  }
  
  getHealthStatus(sourceId: string): APIHealthMetrics | null {
    return this.metrics.get(sourceId) || null;
  }
  
  getAllHealthStatus(): APIHealthMetrics[] {
    return Array.from(this.metrics.values());
  }
}
```

## 🔧 Development Tools

### API Source Validator

```typescript
class APISourceValidator {
  async validateSource(source: APISource): Promise<ValidationResult> {
    const results: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: []
    };
    
    // Validate basic configuration
    this.validateBasicConfig(source, results);
    
    // Test connectivity
    await this.testConnectivity(source, results);
    
    // Validate authentication
    await this.validateAuthentication(source, results);
    
    // Test data structure
    await this.validateDataStructure(source, results);
    
    // Performance recommendations
    this.generatePerformanceRecommendations(source, results);
    
    return results;
  }
  
  private validateBasicConfig(source: APISource, results: ValidationResult): void {
    if (!source.id) {
      results.errors.push('Source ID is required');
      results.isValid = false;
    }
    
    if (!source.baseUrl) {
      results.errors.push('Base URL is required');
      results.isValid = false;
    }
    
    if (!source.endpoints || source.endpoints.length === 0) {
      results.errors.push('At least one endpoint is required');
      results.isValid = false;
    }
    
    // Validate URL format
    try {
      new URL(source.baseUrl);
    } catch {
      results.errors.push('Invalid base URL format');
      results.isValid = false;
    }
  }
  
  private async testConnectivity(source: APISource, results: ValidationResult): Promise<void> {
    try {
      const response = await fetch(source.baseUrl, {
        method: 'HEAD',
        timeout: 5000
      });
      
      if (!response.ok) {
        results.warnings.push(`Base URL returned status ${response.status}`);
      }
    } catch (error) {
      results.errors.push(`Connection failed: ${(error as Error).message}`);
      results.isValid = false;
    }
  }
}
```

### API Testing Framework

```typescript
class APITester {
  async runTests(source: APISource): Promise<TestResults> {
    const tests: TestResult[] = [];
    
    // Test each endpoint
    for (const endpoint of source.endpoints) {
      const testResult = await this.testEndpoint(source, endpoint);
      tests.push(testResult);
    }
    
    return {
      sourceId: source.id,
      timestamp: new Date(),
      tests,
      summary: this.generateSummary(tests)
    };
  }
  
  private async testEndpoint(
    source: APISource, 
    endpoint: RESTEndpoint
  ): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const url = `${source.baseUrl}${endpoint.path}`;
      const response = await fetch(url, {
        method: endpoint.method,
        headers: endpoint.headers,
        body: endpoint.body ? JSON.stringify(endpoint.body) : undefined
      });
      
      const data = await response.json();
      const responseTime = Date.now() - startTime;
      
      return {
        endpoint: endpoint.path,
        success: response.ok,
        responseTime,
        statusCode: response.status,
        dataCount: Array.isArray(data) ? data.length : 1,
        sampleData: Array.isArray(data) ? data.slice(0, 2) : [data],
        errors: response.ok ? [] : [`HTTP ${response.status}: ${response.statusText}`]
      };
      
    } catch (error) {
      return {
        endpoint: endpoint.path,
        success: false,
        responseTime: Date.now() - startTime,
        statusCode: 0,
        dataCount: 0,
        sampleData: [],
        errors: [(error as Error).message]
      };
    }
  }
}
```

## 📚 Integration Examples

### Complete Integration Example

```typescript
// complete-integration-example.ts
import { ECNEDataRiver } from '../src/ecne';

async function main() {
  // Initialize ECNE
  const ecne = new ECNEDataRiver({
    filter: {
      sensitivity: 0.6,
      weights: { psi: 0.3, rho: 0.3, q: 0.2, f: 0.2 }
    },
    storage: {
      type: 'postgresql',
      connectionString: process.env.DATABASE_URL
    }
  });
  
  // Add Reddit API for social data
  const redditAPI = {
    id: 'reddit-api',
    name: 'Reddit Hot Posts',
    baseUrl: 'https://www.reddit.com',
    endpoints: [{
      path: '/r/technology/hot.json',
      method: 'GET' as const,
      refreshInterval: 600,
      params: { limit: 25 }
    }],
    transformation: {
      steps: [{
        type: 'custom' as const,
        config: {
          function: (response: any) => {
            return response.data.data.children.map((post: any) => ({
              id: `reddit-${post.data.id}`,
              source: 'reddit-api',
              timestamp: new Date(post.data.created_utc * 1000),
              content: {
                title: post.data.title,
                text: post.data.selftext,
                url: post.data.url,
                score: post.data.score,
                comments: post.data.num_comments
              },
              metadata: {
                subreddit: post.data.subreddit,
                author: post.data.author,
                upvoteRatio: post.data.upvote_ratio
              }
            }));
          }
        }
      }]
    }
  };
  
  // Add NewsAPI for news data
  const newsAPI = {
    id: 'news-api',
    name: 'Technology News',
    baseUrl: 'https://newsapi.org/v2',
    endpoints: [{
      path: '/everything',
      method: 'GET' as const,
      refreshInterval: 1800,
      params: {
        q: 'technology AND (AI OR "artificial intelligence" OR "machine learning")',
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: 50
      }
    }],
    authentication: {
      type: 'api-key' as const,
      apiKey: process.env.NEWS_API_KEY!,
      headerName: 'X-API-Key'
    },
    transformation: {
      steps: [{
        type: 'map' as const,
        config: {
          mapping: {
            'id': 'url',
            'title': 'title',
            'content': 'description',
            'publishedAt': 'publishedAt',
            'source': 'source.name',
            'url': 'url'
          }
        }
      }]
    }
  };
  
  // Add sources to ECNE
  ecne.addSource(redditAPI);
  ecne.addSource(newsAPI);
  
  // Set up event handlers
  ecne.on('filtered-data', (dataPoint) => {
    console.log(`High coherence data: ${dataPoint.coherenceScore.toFixed(3)} - ${dataPoint.content.title}`);
  });
  
  ecne.on('anomaly-detected', (anomaly) => {
    console.log(`Anomaly detected in ${anomaly.source}: ${anomaly.reason}`);
  });
  
  // Start data collection
  await ecne.start();
  
  // Run for 1 hour then stop
  setTimeout(async () => {
    await ecne.stop();
    console.log('Data collection stopped');
  }, 60 * 60 * 1000);
}

main().catch(console.error);
```

### Custom Coherence Enhancer

```typescript
// Add domain-specific coherence hints
class DomainCoherenceEnhancer {
  private domainRules: Map<string, CoherenceRule[]> = new Map();
  
  constructor() {
    this.setupDomainRules();
  }
  
  private setupDomainRules(): void {
    // Technology domain rules
    this.domainRules.set('technology', [
      {
        condition: (content: any) => /\b(AI|ML|blockchain|quantum)\b/i.test(content.title),
        enhancement: { rho: +0.2, q: +0.1 }
      },
      {
        condition: (content: any) => content.score > 1000,
        enhancement: { f: +0.3 }
      }
    ]);
    
    // News domain rules
    this.domainRules.set('news', [
      {
        condition: (content: any) => /\b(breaking|urgent|alert)\b/i.test(content.title),
        enhancement: { psi: +0.4, rho: +0.2 }
      },
      {
        condition: (content: any) => content.source === 'Reuters' || content.source === 'AP',
        enhancement: { rho: +0.2, q: +0.1 }
      }
    ]);
  }
  
  enhance(dataPoint: DataPoint, domain: string): CoherenceDimensions {
    const rules = this.domainRules.get(domain) || [];
    let enhancement = { psi: 0, rho: 0, q: 0, f: 0 };
    
    for (const rule of rules) {
      if (rule.condition(dataPoint.content)) {
        Object.keys(rule.enhancement).forEach(key => {
          enhancement[key as keyof CoherenceDimensions] += rule.enhancement[key as keyof CoherenceDimensions];
        });
      }
    }
    
    return enhancement;
  }
}
```

---

This guide provides comprehensive coverage of ECNE's API integration capabilities, from simple REST APIs to complex real-time streams, with proper authentication, error handling, and monitoring.