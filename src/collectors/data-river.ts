/**
 * Data River Collector
 * Manages continuous data streams from multiple API sources
 */

import { EventEmitter } from 'events';
import axios, { AxiosInstance } from 'axios';
import PQueue from 'p-queue';
import { DataPoint } from '../core/coherence-filter';

export interface APISource {
  id: string;
  name: string;
  baseUrl: string;
  endpoints: APIEndpoint[];
  rateLimit?: {
    requests: number;
    window: number; // in seconds
  };
  auth?: {
    type: 'apiKey' | 'bearer' | 'basic' | 'none';
    config?: any;
  };
}

export interface APIEndpoint {
  path: string;
  method: 'GET' | 'POST';
  params?: Record<string, any>;
  headers?: Record<string, string>;
  refreshInterval: number; // in seconds
  dataExtractor?: (response: any) => any[];
}

export interface CollectorConfig {
  sources: APISource[];
  maxConcurrent: number;
  retryAttempts: number;
  retryDelay: number;
}

export class DataRiverCollector extends EventEmitter {
  private sources: Map<string, APISource> = new Map();
  private clients: Map<string, AxiosInstance> = new Map();
  private queue: PQueue;
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private active: boolean = false;

  constructor(private config: CollectorConfig) {
    super();
    
    this.queue = new PQueue({ 
      concurrency: config.maxConcurrent || 10,
      interval: 1000,
      intervalCap: config.maxConcurrent || 10
    });

    // Initialize sources if provided
    if (config.sources) {
      config.sources.forEach(source => {
        this.addSource(source);
      });
    }
  }

  /**
   * Add an API source to the river
   */
  addSource(source: APISource): void {
    this.sources.set(source.id, source);
    
    // Create axios client for source
    const client = axios.create({
      baseURL: source.baseUrl,
      timeout: 30000,
      headers: this.getAuthHeaders(source)
    });

    // Add response interceptor for error handling
    client.interceptors.response.use(
      response => response,
      async error => {
        if (error.response?.status === 429) {
          // Rate limited, emit event
          this.emit('rate-limited', { source: source.id, error });
        }
        throw error;
      }
    );

    this.clients.set(source.id, client);
  }

  /**
   * Start collecting from all sources
   */
  start(): void {
    if (this.active) return;
    
    this.active = true;
    this.emit('started');

    // Start collection for each source
    this.sources.forEach((source, sourceId) => {
      source.endpoints.forEach((endpoint, index) => {
        this.scheduleCollection(sourceId, index);
      });
    });
  }

  /**
   * Stop all collection
   */
  stop(): void {
    this.active = false;
    
    // Clear all intervals
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals.clear();
    
    // Clear queue
    this.queue.clear();
    
    this.emit('stopped');
  }

  /**
   * Schedule collection for an endpoint
   */
  private scheduleCollection(sourceId: string, endpointIndex: number): void {
    const source = this.sources.get(sourceId);
    if (!source) return;

    const endpoint = source.endpoints[endpointIndex];
    const intervalKey = `${sourceId}:${endpointIndex}`;

    // Initial collection
    this.collectFromEndpoint(sourceId, endpoint);

    // Schedule periodic collection
    const interval = setInterval(() => {
      if (this.active) {
        this.collectFromEndpoint(sourceId, endpoint);
      }
    }, endpoint.refreshInterval * 1000);

    this.intervals.set(intervalKey, interval);
  }

  /**
   * Collect data from a specific endpoint
   */
  private async collectFromEndpoint(sourceId: string, endpoint: APIEndpoint): Promise<void> {
    const source = this.sources.get(sourceId);
    const client = this.clients.get(sourceId);
    
    if (!source || !client || !this.active) return;

    try {
      await this.queue.add(async () => {
        const response = await this.fetchWithRetry(client, endpoint);
        
        if (response.data) {
          const dataPoints = this.extractDataPoints(
            source,
            endpoint,
            response.data
          );

          // Emit each data point to the river
          dataPoints.forEach(point => {
            this.emit('data', point);
          });

          this.emit('collection-success', {
            source: sourceId,
            endpoint: endpoint.path,
            count: dataPoints.length
          });
        }
      });
    } catch (error) {
      this.emit('collection-error', {
        source: sourceId,
        endpoint: endpoint.path,
        error
      });
    }
  }

  /**
   * Fetch with retry logic
   */
  private async fetchWithRetry(
    client: AxiosInstance,
    endpoint: APIEndpoint,
    attempt: number = 1
  ): Promise<any> {
    try {
      return await client({
        method: endpoint.method,
        url: endpoint.path,
        params: endpoint.params,
        headers: endpoint.headers
      });
    } catch (error) {
      if (attempt < this.config.retryAttempts) {
        await new Promise(resolve => 
          setTimeout(resolve, this.config.retryDelay * attempt)
        );
        return this.fetchWithRetry(client, endpoint, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Extract data points from API response
   */
  private extractDataPoints(
    source: APISource,
    endpoint: APIEndpoint,
    responseData: any
  ): DataPoint[] {
    let items: any[] = [];

    // Use custom extractor if provided
    if (endpoint.dataExtractor) {
      items = endpoint.dataExtractor(responseData);
    } else if (Array.isArray(responseData)) {
      items = responseData;
    } else if (responseData.data && Array.isArray(responseData.data)) {
      items = responseData.data;
    } else if (responseData.results && Array.isArray(responseData.results)) {
      items = responseData.results;
    } else {
      items = [responseData];
    }

    return items.map((item, index) => ({
      id: `${source.id}:${Date.now()}:${index}`,
      source: source.name,
      timestamp: new Date(),
      content: item,
      metadata: {
        sourceId: source.id,
        endpoint: endpoint.path,
        apiUrl: source.baseUrl
      }
    }));
  }

  /**
   * Get auth headers for a source
   */
  private getAuthHeaders(source: APISource): Record<string, string> {
    if (!source.auth || source.auth.type === 'none') {
      return {};
    }

    switch (source.auth.type) {
      case 'apiKey':
        return {
          'X-API-Key': source.auth.config.key
        };
      case 'bearer':
        return {
          'Authorization': `Bearer ${source.auth.config.token}`
        };
      case 'basic':
        const encoded = Buffer.from(
          `${source.auth.config.username}:${source.auth.config.password}`
        ).toString('base64');
        return {
          'Authorization': `Basic ${encoded}`
        };
      default:
        return {};
    }
  }

  /**
   * Get collector statistics
   */
  getStatistics(): {
    sources: number;
    endpoints: number;
    queueSize: number;
    active: boolean;
  } {
    let totalEndpoints = 0;
    this.sources.forEach(source => {
      totalEndpoints += source.endpoints.length;
    });

    return {
      sources: this.sources.size,
      endpoints: totalEndpoints,
      queueSize: this.queue.size,
      active: this.active
    };
  }

  /**
   * Update source configuration
   */
  updateSource(sourceId: string, updates: Partial<APISource>): void {
    const source = this.sources.get(sourceId);
    if (!source) return;

    // Update source
    const updatedSource = { ...source, ...updates };
    this.sources.set(sourceId, updatedSource);

    // Restart collection for this source if active
    if (this.active) {
      // Clear existing intervals for this source
      this.intervals.forEach((interval, key) => {
        if (key.startsWith(sourceId)) {
          clearInterval(interval);
          this.intervals.delete(key);
        }
      });

      // Restart collection
      updatedSource.endpoints.forEach((endpoint, index) => {
        this.scheduleCollection(sourceId, index);
      });
    }
  }

  /**
   * Remove a source
   */
  removeSource(sourceId: string): void {
    // Clear intervals
    this.intervals.forEach((interval, key) => {
      if (key.startsWith(sourceId)) {
        clearInterval(interval);
        this.intervals.delete(key);
      }
    });

    // Remove source and client
    this.sources.delete(sourceId);
    this.clients.delete(sourceId);

    this.emit('source-removed', sourceId);
  }
}