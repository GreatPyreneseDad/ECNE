#!/usr/bin/env tsx

/**
 * Development startup script with dependency checking
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

console.log('🚀 Starting ECNE Data River in development mode...\n');

// Check for required dependencies
function checkDependencies() {
  console.log('📋 Checking dependencies...');
  
  const checks = [
    {
      name: 'Node.js',
      check: () => process.version,
      required: true
    },
    {
      name: 'PostgreSQL',
      check: async () => {
        try {
          const { execSync } = require('child_process');
          execSync('psql --version', { stdio: 'ignore' });
          return 'Available';
        } catch {
          return 'Not found';
        }
      },
      required: false
    },
    {
      name: 'Redis',
      check: async () => {
        try {
          const { execSync } = require('child_process');
          execSync('redis-cli --version', { stdio: 'ignore' });
          return 'Available';
        } catch {
          return 'Not found';
        }
      },
      required: false
    }
  ];

  const results: any[] = [];
  
  for (const dep of checks) {
    const result = dep.check();
    const status = result instanceof Promise ? await result : result;
    results.push({ ...dep, status });
    
    console.log(`  ${dep.name}: ${status} ${dep.required && status.includes('Not found') ? '❌' : '✅'}`);
  }
  
  const missingRequired = results.filter(r => r.required && r.status.includes('Not found'));
  if (missingRequired.length > 0) {
    console.error('\n❌ Missing required dependencies!');
    process.exit(1);
  }
  
  console.log('\n✅ All required dependencies are available');
  return results;
}

// Create default .env if not exists
function setupEnvironment() {
  console.log('\n🔧 Setting up environment...');
  
  const envPath = path.join(__dirname, '../.env');
  const envExamplePath = path.join(__dirname, '../.env.example');
  
  if (!fs.existsSync(envPath)) {
    console.log('  Creating .env file with defaults...');
    
    const defaultEnv = `# ECNE Data River Configuration

# Database (uses mock if not available)
DATABASE_URL=mock://localhost/ecne
USE_MOCK_DB=true

# Dashboard
DASHBOARD_PORT=3000
DASHBOARD_ENABLED=true

# Coherence Filter
COHERENCE_SENSITIVITY=0.5
CONTEXT_WINDOW=60
PATTERN_MEMORY=1000

# Data Collector
MAX_CONCURRENT=10
RETRY_ATTEMPTS=3
RETRY_DELAY=1000

# Data Retention
DATA_RETENTION_DAYS=30

# API Configuration
API_CATEGORIES=News,Social,Finance
API_LIMIT=10

# Logging
LOG_LEVEL=info
`;
    
    fs.writeFileSync(envPath, defaultEnv);
    console.log('  ✅ Created .env with default configuration');
  } else {
    console.log('  ✅ Using existing .env file');
  }
}

// Create necessary directories
function setupDirectories() {
  console.log('\n📁 Setting up directories...');
  
  const dirs = [
    'logs',
    'data',
    'dist'
  ];
  
  for (const dir of dirs) {
    const dirPath = path.join(__dirname, '..', dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`  Created ${dir}/`);
    }
  }
  
  console.log('  ✅ Directories ready');
}

// Start the application
async function startApplication(useSafeMode: boolean = true) {
  console.log('\n🚀 Starting application...\n');
  
  const script = useSafeMode ? 'src/index-safe.ts' : 'src/index.ts';
  
  const child = spawn('tsx', ['watch', script], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      USE_MOCK_DB: 'true' // Always use mock DB in dev by default
    }
  });
  
  child.on('error', (error) => {
    console.error('Failed to start application:', error);
    process.exit(1);
  });
  
  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`Application exited with code ${code}`);
      process.exit(code);
    }
  });
}

// Main startup sequence
async function main() {
  try {
    // Run checks
    await checkDependencies();
    setupEnvironment();
    setupDirectories();
    
    // Check for safe mode flag
    const useSafeMode = process.argv.includes('--safe') || !process.argv.includes('--unsafe');
    
    if (useSafeMode) {
      console.log('\n🛡️  Starting in SAFE MODE (with error handling and mocks)');
      console.log('   Use --unsafe flag to run original version\n');
    } else {
      console.log('\n⚠️  Starting in UNSAFE MODE (original version)');
      console.log('   This may fail if external dependencies are not configured\n');
    }
    
    // Start the application
    await startApplication(useSafeMode);
    
  } catch (error) {
    console.error('\n❌ Startup failed:', error);
    process.exit(1);
  }
}

// Handle signals
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down...');
  process.exit(0);
});

// Run
main();