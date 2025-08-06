/**
 * Dashboard Server for ECNE
 * Provides real-time visualization and control interface
 */

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { DatabaseService } from '../storage/database';
import { FilteredDataPoint } from '../core/coherence-filter';

export interface DashboardConfig {
  port: number;
}

export class DashboardServer {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;
  private connections: Set<string> = new Set();

  constructor(
    private config: DashboardConfig,
    private database: DatabaseService
  ) {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketHandlers();
  }

  /**
   * Start the dashboard server
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.config.port, () => {
        console.log(`Dashboard server listening on port ${this.config.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the dashboard server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.io.close();
      this.server.close(() => {
        resolve();
      });
    });
  }

  /**
   * Emit a data point to all connected clients
   */
  emitDataPoint(dataPoint: FilteredDataPoint): void {
    this.io.emit('data-point', {
      id: dataPoint.id,
      source: dataPoint.source,
      timestamp: dataPoint.timestamp,
      coherenceScore: dataPoint.coherenceScore,
      dimensions: dataPoint.coherenceDimensions,
      reasons: dataPoint.relevanceReason
    });
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.static('public'));
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', connections: this.connections.size });
    });

    // Query data points
    this.app.get('/api/data', async (req, res) => {
      try {
        const { 
          startTime, 
          endTime, 
          sources, 
          minCoherence,
          limit = '100',
          offset = '0'
        } = req.query;

        const data = await this.database.queryDataPoints({
          startTime: startTime ? new Date(startTime as string) : undefined,
          endTime: endTime ? new Date(endTime as string) : undefined,
          sources: sources ? (sources as string).split(',') : undefined,
          minCoherence: minCoherence ? parseFloat(minCoherence as string) : undefined,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string)
        });

        res.json(data);
      } catch (error) {
        res.status(500).json({ error: 'Failed to query data' });
      }
    });

    // Get coherence statistics
    this.app.get('/api/statistics/coherence', async (req, res) => {
      try {
        const { startTime, endTime, interval = 'hour', sources } = req.query;

        if (!startTime || !endTime) {
          return res.status(400).json({ error: 'startTime and endTime required' });
        }

        const stats = await this.database.getCoherenceStatistics({
          startTime: new Date(startTime as string),
          endTime: new Date(endTime as string),
          interval: interval as 'hour' | 'day' | 'week',
          sources: sources ? (sources as string).split(',') : undefined
        });

        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get statistics' });
      }
    });

    // Get top patterns
    this.app.get('/api/patterns', async (req, res) => {
      try {
        const { limit = '10', timeRange = '24' } = req.query;

        const patterns = await this.database.getTopPatterns({
          limit: parseInt(limit as string),
          timeRange: parseInt(timeRange as string)
        });

        res.json(patterns);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get patterns' });
      }
    });

    // Get sources summary
    this.app.get('/api/sources', async (req, res) => {
      try {
        const sources = await this.database.getSourcesSummary();
        res.json(sources);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get sources' });
      }
    });
  }

  /**
   * Setup Socket.IO handlers
   */
  private setupSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);
      this.connections.add(socket.id);

      // Send initial data
      this.sendInitialData(socket);

      // Handle filter updates
      socket.on('update-filter', (filterConfig) => {
        // This would be connected to the main ECNE instance
        console.log('Filter update requested:', filterConfig);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        this.connections.delete(socket.id);
      });
    });
  }

  /**
   * Send initial data to newly connected client
   */
  private async sendInitialData(socket: any): Promise<void> {
    try {
      // Send recent data points
      const recentData = await this.database.queryDataPoints({
        limit: 50
      });
      socket.emit('initial-data', recentData);

      // Send sources summary
      const sources = await this.database.getSourcesSummary();
      socket.emit('sources-update', sources);
    } catch (error) {
      console.error('Failed to send initial data:', error);
    }
  }
}