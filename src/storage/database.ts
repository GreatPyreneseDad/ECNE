/**
 * Database Service for ECNE
 * Handles storage of filtered data points with coherence metrics
 */

import { PrismaClient } from '@prisma/client';
import { FilteredDataPoint } from '../core/coherence-filter';

export interface StorageConfig {
  connectionString: string;
  retention: number; // days
}

export class DatabaseService {
  private prisma: PrismaClient;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(private config: StorageConfig) {
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: config.connectionString
        }
      }
    });
  }

  /**
   * Connect to database and setup
   */
  async connect(): Promise<void> {
    await this.prisma.$connect();
    
    // Start cleanup job
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldData();
    }, 24 * 60 * 60 * 1000); // Daily
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    await this.prisma.$disconnect();
  }

  /**
   * Store a filtered data point
   */
  async storeDataPoint(dataPoint: FilteredDataPoint): Promise<void> {
    await this.prisma.dataPoint.create({
      data: {
        externalId: dataPoint.id,
        source: dataPoint.source,
        timestamp: dataPoint.timestamp,
        content: dataPoint.content,
        metadata: dataPoint.metadata || {},
        coherenceScore: dataPoint.coherenceScore,
        coherencePsi: dataPoint.coherenceDimensions.psi,
        coherenceRho: dataPoint.coherenceDimensions.rho,
        coherenceQ: dataPoint.coherenceDimensions.q,
        coherenceF: dataPoint.coherenceDimensions.f,
        relevanceReasons: dataPoint.relevanceReason
      }
    });
  }

  /**
   * Query data points with filters
   */
  async queryDataPoints(params: {
    startTime?: Date;
    endTime?: Date;
    sources?: string[];
    minCoherence?: number;
    limit?: number;
    offset?: number;
  }): Promise<FilteredDataPoint[]> {
    const where: any = {};
    
    if (params.startTime || params.endTime) {
      where.timestamp = {};
      if (params.startTime) where.timestamp.gte = params.startTime;
      if (params.endTime) where.timestamp.lte = params.endTime;
    }
    
    if (params.sources && params.sources.length > 0) {
      where.source = { in: params.sources };
    }
    
    if (params.minCoherence !== undefined) {
      where.coherenceScore = { gte: params.minCoherence };
    }
    
    const results = await this.prisma.dataPoint.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: params.limit || 100,
      skip: params.offset || 0
    });
    
    return results.map(this.mapToFilteredDataPoint);
  }

  /**
   * Get coherence statistics over time
   */
  async getCoherenceStatistics(params: {
    startTime: Date;
    endTime: Date;
    interval: 'hour' | 'day' | 'week';
    sources?: string[];
  }): Promise<any[]> {
    // This would use raw SQL for time-series aggregation
    // Simplified version for now
    const results = await this.prisma.dataPoint.groupBy({
      by: ['source'],
      where: {
        timestamp: {
          gte: params.startTime,
          lte: params.endTime
        },
        ...(params.sources ? { source: { in: params.sources } } : {})
      },
      _avg: {
        coherenceScore: true,
        coherencePsi: true,
        coherenceRho: true,
        coherenceQ: true,
        coherenceF: true
      },
      _count: true
    });
    
    return results;
  }

  /**
   * Get top patterns by coherence
   */
  async getTopPatterns(params: {
    limit?: number;
    minOccurrences?: number;
    timeRange?: number; // hours
  }): Promise<any[]> {
    const since = new Date(Date.now() - (params.timeRange || 24) * 60 * 60 * 1000);
    
    // Group by content patterns (simplified)
    // In production, this would use more sophisticated pattern extraction
    const patterns = await this.prisma.dataPoint.findMany({
      where: {
        timestamp: { gte: since }
      },
      select: {
        source: true,
        coherenceScore: true,
        relevanceReasons: true
      },
      orderBy: {
        coherenceScore: 'desc'
      },
      take: params.limit || 10
    });
    
    return patterns;
  }

  /**
   * Get data sources summary
   */
  async getSourcesSummary(): Promise<any[]> {
    return await this.prisma.dataPoint.groupBy({
      by: ['source'],
      _count: true,
      _avg: {
        coherenceScore: true
      },
      orderBy: {
        _count: {
          source: 'desc'
        }
      }
    });
  }

  /**
   * Clean up old data based on retention policy
   */
  private async cleanupOldData(): Promise<void> {
    const cutoff = new Date(Date.now() - this.config.retention * 24 * 60 * 60 * 1000);
    
    const deleted = await this.prisma.dataPoint.deleteMany({
      where: {
        timestamp: { lt: cutoff }
      }
    });
    
    console.log(`Cleaned up ${deleted.count} old data points`);
  }

  /**
   * Map database record to FilteredDataPoint
   */
  private mapToFilteredDataPoint(record: any): FilteredDataPoint {
    return {
      id: record.externalId,
      source: record.source,
      timestamp: record.timestamp,
      content: record.content,
      metadata: record.metadata,
      coherenceScore: record.coherenceScore,
      coherenceDimensions: {
        psi: record.coherencePsi,
        rho: record.coherenceRho,
        q: record.coherenceQ,
        f: record.coherenceF
      },
      relevanceReason: record.relevanceReasons
    };
  }
}