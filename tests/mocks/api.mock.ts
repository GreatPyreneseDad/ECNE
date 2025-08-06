/**
 * Mock API Server
 * Simulates external API responses for testing
 */

import express from 'express';
import { Server } from 'http';

export interface MockAPIConfig {
  port: number;
  delay?: number;
  errorRate?: number;
}

export class MockAPIServer {
  private app: express.Application;
  private server?: Server;
  private requestCount: Map<string, number> = new Map();
  
  constructor(private config: MockAPIConfig) {
    this.app = express();
    this.setupRoutes();
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.config.port, () => {
        console.log(`[MockAPI] Server started on port ${this.config.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('[MockAPI] Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private setupRoutes(): void {
    // Middleware to simulate delay
    this.app.use((req, res, next) => {
      const delay = this.config.delay || 0;
      if (delay > 0) {
        setTimeout(next, delay);
      } else {
        next();
      }
    });

    // Middleware to simulate errors
    this.app.use((req, res, next) => {
      const errorRate = this.config.errorRate || 0;
      if (Math.random() < errorRate) {
        res.status(500).json({ error: 'Simulated server error' });
        return;
      }
      next();
    });

    // Rate limiting simulation
    this.app.use((req, res, next) => {
      const key = `${req.method}:${req.path}`;
      const count = this.requestCount.get(key) || 0;
      this.requestCount.set(key, count + 1);
      
      // Simulate rate limiting after 10 requests
      if (count > 10) {
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }
      next();
    });

    // Mock News API
    this.app.get('/headlines', (req, res) => {
      res.json({
        articles: [
          {
            id: `news-${Date.now()}-1`,
            title: 'Breaking News: AI System Shows High Coherence',
            content: 'A new AI system demonstrates remarkable coherence in data processing...',
            author: 'Tech Reporter',
            publishedAt: new Date().toISOString(),
            source: 'Tech News',
            category: 'Technology'
          },
          {
            id: `news-${Date.now()}-2`,
            title: 'Community Collaboration Reaches New Heights',
            content: 'Local communities are working together to solve complex problems...',
            author: 'Social Reporter',
            publishedAt: new Date().toISOString(),
            source: 'Community News',
            category: 'Social'
          },
          {
            id: `news-${Date.now()}-3`,
            title: 'Ethical AI Development Takes Center Stage',
            content: 'Researchers emphasize the importance of moral principles in AI...',
            author: 'Ethics Reporter',
            publishedAt: new Date().toISOString(),
            source: 'Ethics Weekly',
            category: 'Ethics'
          }
        ],
        status: 'ok',
        totalResults: 3
      });
    });

    // Mock Social API
    this.app.get('/posts/recent', (req, res) => {
      res.json({
        posts: [
          {
            id: `social-${Date.now()}-1`,
            content: 'Just joined an amazing community project! #together #collaboration',
            author: 'user123',
            likes: 45,
            shares: 12,
            timestamp: new Date().toISOString()
          },
          {
            id: `social-${Date.now()}-2`,
            content: 'Reflecting on the importance of ethical decision-making in our daily lives',
            author: 'philosopher99',
            likes: 78,
            shares: 23,
            timestamp: new Date().toISOString()
          }
        ],
        meta: {
          total: 2,
          page: 1
        }
      });
    });

    // Mock Finance API
    this.app.get('/market/summary', (req, res) => {
      res.json({
        markets: [
          {
            symbol: 'INDEX1',
            value: 4500 + Math.random() * 100,
            change: (Math.random() - 0.5) * 5,
            volume: Math.floor(Math.random() * 1000000)
          },
          {
            symbol: 'INDEX2',
            value: 15000 + Math.random() * 200,
            change: (Math.random() - 0.5) * 10,
            volume: Math.floor(Math.random() * 2000000)
          }
        ],
        timestamp: new Date().toISOString(),
        status: 'open'
      });
    });

    // Generic endpoint for testing
    this.app.get('/', (req, res) => {
      res.json({
        data: [
          {
            id: `generic-${Date.now()}`,
            type: 'test',
            value: Math.random(),
            timestamp: new Date().toISOString()
          }
        ],
        status: 'ok'
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });
  }

  // Reset rate limiting counters
  resetRateLimits(): void {
    this.requestCount.clear();
  }

  // Get request statistics
  getRequestStats(): Map<string, number> {
    return new Map(this.requestCount);
  }
}

// Helper function to create multiple mock API servers
export function createMockAPISources(basePort: number = 4000): {
  news: MockAPIServer;
  social: MockAPIServer;
  finance: MockAPIServer;
} {
  return {
    news: new MockAPIServer({ port: basePort }),
    social: new MockAPIServer({ port: basePort + 1 }),
    finance: new MockAPIServer({ port: basePort + 2 })
  };
}