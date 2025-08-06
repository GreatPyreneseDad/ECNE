import { Pool, PoolClient } from 'pg';
import { StorageAdapter, QueryParams, StorageHealthStatus, StorageConfig } from './storage-adapter';
import { FilteredDataPoint } from '../types';

export class DatabaseConnectionError extends Error {
  constructor(message: string, public originalError?: any) {
    super(message);
    this.name = 'DatabaseConnectionError';
  }
}

export class PostgreSQLAdapter extends StorageAdapter {
  private pool: Pool | null = null;
  private connected: boolean = false;
  private storedCount: number = 0;
  private lastActivity?: Date;
  private lastError?: string;
  
  async connect(): Promise<void> {
    if (this.connected && this.pool) {
      return;
    }
    
    try {
      this.pool = new Pool({
        connectionString: this.config.connectionString || process.env.DATABASE_URL,
        max: this.config.poolConfig?.max || 20,
        min: this.config.poolConfig?.min || 5,
        idleTimeoutMillis: this.config.poolConfig?.idleTimeoutMillis || 30000,
        connectionTimeoutMillis: this.config.poolConfig?.connectionTimeoutMillis || 2000,
      });
      
      // Test connection
      await this.pool.query('SELECT 1');
      this.connected = true;
      
      // Create table if not exists
      await this.ensureTable();
      
    } catch (error) {
      this.lastError = (error as Error).message;
      throw new DatabaseConnectionError('PostgreSQL connection failed', error);
    }
  }
  
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.connected = false;
    }
  }
  
  async store(data: FilteredDataPoint): Promise<void> {
    if (!this.pool || !this.connected) {
      throw new Error('Not connected to database');
    }
    
    const query = `
      INSERT INTO filtered_data 
      (id, source, timestamp, content, coherence_score, dimensions, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE
      SET coherence_score = $5, 
          dimensions = $6,
          updated_at = CURRENT_TIMESTAMP
    `;
    
    try {
      await this.executeWithRetry(query, [
        data.id,
        data.source,
        data.timestamp,
        JSON.stringify(data.content),
        data.coherenceScore,
        JSON.stringify(data.coherenceDimensions),
        data.metadata ? JSON.stringify(data.metadata) : null
      ]);
      
      this.storedCount++;
      this.lastActivity = new Date();
    } catch (error) {
      this.lastError = (error as Error).message;
      throw error;
    }
  }
  
  async storeBatch(data: FilteredDataPoint[]): Promise<void> {
    if (!this.pool || !this.connected || data.length === 0) {
      return;
    }
    
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const query = `
        INSERT INTO filtered_data 
        (id, source, timestamp, content, coherence_score, dimensions, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE
        SET coherence_score = $5,
            dimensions = $6,
            updated_at = CURRENT_TIMESTAMP
      `;
      
      for (const item of data) {
        await client.query(query, [
          item.id,
          item.source,
          item.timestamp,
          JSON.stringify(item.content),
          item.coherenceScore,
          JSON.stringify(item.coherenceDimensions),
          item.metadata ? JSON.stringify(item.metadata) : null
        ]);
      }
      
      await client.query('COMMIT');
      this.storedCount += data.length;
      this.lastActivity = new Date();
      
    } catch (error) {
      await client.query('ROLLBACK');
      this.lastError = (error as Error).message;
      throw error;
    } finally {
      client.release();
    }
  }
  
  async query(params: QueryParams): Promise<FilteredDataPoint[]> {
    if (!this.pool || !this.connected) {
      throw new Error('Not connected to database');
    }
    
    let query = 'SELECT * FROM filtered_data WHERE 1=1';
    const values: any[] = [];
    let paramIndex = 1;
    
    if (params.source) {
      query += ` AND source = $${paramIndex++}`;
      values.push(params.source);
    }
    
    if (params.startDate) {
      query += ` AND timestamp >= $${paramIndex++}`;
      values.push(params.startDate);
    }
    
    if (params.endDate) {
      query += ` AND timestamp <= $${paramIndex++}`;
      values.push(params.endDate);
    }
    
    if (params.minCoherence !== undefined) {
      query += ` AND coherence_score >= $${paramIndex++}`;
      values.push(params.minCoherence);
    }
    
    if (params.maxCoherence !== undefined) {
      query += ` AND coherence_score <= $${paramIndex++}`;
      values.push(params.maxCoherence);
    }
    
    if (params.orderBy) {
      const column = params.orderBy === 'coherenceScore' ? 'coherence_score' : 'timestamp';
      query += ` ORDER BY ${column} ${params.order || 'DESC'}`;
    } else {
      query += ' ORDER BY timestamp DESC';
    }
    
    if (params.limit) {
      query += ` LIMIT $${paramIndex++}`;
      values.push(params.limit);
    }
    
    if (params.offset) {
      query += ` OFFSET $${paramIndex++}`;
      values.push(params.offset);
    }
    
    try {
      const result = await this.pool.query(query, values);
      
      return result.rows.map(row => ({
        id: row.id,
        source: row.source,
        timestamp: row.timestamp,
        content: JSON.parse(row.content),
        coherenceScore: parseFloat(row.coherence_score),
        coherenceDimensions: JSON.parse(row.dimensions),
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined
      }));
    } catch (error) {
      this.lastError = (error as Error).message;
      throw error;
    }
  }
  
  async count(params?: QueryParams): Promise<number> {
    if (!this.pool || !this.connected) {
      throw new Error('Not connected to database');
    }
    
    let query = 'SELECT COUNT(*) FROM filtered_data WHERE 1=1';
    const values: any[] = [];
    let paramIndex = 1;
    
    if (params?.source) {
      query += ` AND source = $${paramIndex++}`;
      values.push(params.source);
    }
    
    if (params?.startDate) {
      query += ` AND timestamp >= $${paramIndex++}`;
      values.push(params.startDate);
    }
    
    if (params?.endDate) {
      query += ` AND timestamp <= $${paramIndex++}`;
      values.push(params.endDate);
    }
    
    const result = await this.pool.query(query, values);
    return parseInt(result.rows[0].count, 10);
  }
  
  async delete(id: string): Promise<boolean> {
    if (!this.pool || !this.connected) {
      throw new Error('Not connected to database');
    }
    
    const result = await this.pool.query(
      'DELETE FROM filtered_data WHERE id = $1',
      [id]
    );
    
    return result.rowCount > 0;
  }
  
  async deleteMany(ids: string[]): Promise<number> {
    if (!this.pool || !this.connected || ids.length === 0) {
      return 0;
    }
    
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const result = await this.pool.query(
      `DELETE FROM filtered_data WHERE id IN (${placeholders})`,
      ids
    );
    
    return result.rowCount;
  }
  
  async clear(): Promise<void> {
    if (!this.pool || !this.connected) {
      throw new Error('Not connected to database');
    }
    
    await this.pool.query('TRUNCATE TABLE filtered_data');
    this.storedCount = 0;
  }
  
  async getHealth(): Promise<StorageHealthStatus> {
    const startTime = Date.now();
    let latency = 0;
    
    try {
      if (this.pool && this.connected) {
        await this.pool.query('SELECT 1');
        latency = Date.now() - startTime;
      }
      
      return {
        connected: this.connected,
        latency,
        storedCount: this.storedCount,
        lastError: this.lastError,
        lastActivity: this.lastActivity
      };
    } catch (error) {
      this.lastError = (error as Error).message;
      
      return {
        connected: false,
        latency: Date.now() - startTime,
        storedCount: this.storedCount,
        lastError: this.lastError,
        lastActivity: this.lastActivity
      };
    }
  }
  
  private async ensureTable(): Promise<void> {
    if (!this.pool) return;
    
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS filtered_data (
        id VARCHAR(255) PRIMARY KEY,
        source VARCHAR(100) NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        content JSONB NOT NULL,
        coherence_score DECIMAL(3,2) NOT NULL,
        dimensions JSONB NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_source ON filtered_data(source);
      CREATE INDEX IF NOT EXISTS idx_timestamp ON filtered_data(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_coherence_score ON filtered_data(coherence_score DESC);
      CREATE INDEX IF NOT EXISTS idx_source_timestamp ON filtered_data(source, timestamp DESC);
    `;
    
    await this.pool.query(createTableQuery);
  }
  
  private async executeWithRetry(query: string, values: any[], retries = 3): Promise<any> {
    let lastError: Error;
    
    for (let i = 0; i < retries; i++) {
      try {
        return await this.pool!.query(query, values);
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on certain errors
        if (lastError.message.includes('duplicate key') || 
            lastError.message.includes('syntax error')) {
          throw lastError;
        }
        
        // Wait before retry with exponential backoff
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
      }
    }
    
    throw lastError!;
  }
}