/**
 * Storage Factory for Testing
 * Provides either mock or real database based on environment
 */

import { DatabaseService } from '../../src/storage/database';
import { MockDatabaseService } from './database.mock';

export interface StorageFactory {
  createDatabase(config: any): DatabaseService | MockDatabaseService;
}

export class TestStorageFactory implements StorageFactory {
  private useMock: boolean;

  constructor(useMock: boolean = true) {
    this.useMock = useMock;
  }

  createDatabase(config: any): DatabaseService | MockDatabaseService {
    if (this.useMock || !config.connectionString || config.connectionString.includes('mock')) {
      console.log('[StorageFactory] Creating mock database service');
      return new MockDatabaseService() as any;
    }
    
    console.log('[StorageFactory] Creating real database service');
    return new DatabaseService(config);
  }
}

// Modified DatabaseService that can work with mocks
export function createDatabaseService(config: any, useMock: boolean = true): any {
  const factory = new TestStorageFactory(useMock);
  return factory.createDatabase(config);
}