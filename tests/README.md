# ECNE Data River Testing Guide

## Overview

This testing framework provides comprehensive testing capabilities for the ECNE Data River system with full mock implementations of external dependencies.

## Quick Start

### 1. Run the Quick Start Example
```bash
# Demonstrates the system with mock data
tsx examples/quick-start.ts
```

### 2. Run Development Mode (Safe)
```bash
# Start with all safety features and mocks enabled
tsx scripts/start-dev.ts

# Or run the original version (requires external dependencies)
tsx scripts/start-dev.ts --unsafe
```

### 3. Run Tests
```bash
# Run basic test scenario
tsx scripts/run-tests.ts basic

# Run all test scenarios
tsx scripts/run-tests.ts all

# Available scenarios:
# - basic: Basic functionality test (30s)
# - stress: High load stress test (60s)
# - error: Error handling test (30s)
# - filter: Filter sensitivity test (60s)
```

## Mock Implementations

### MockDatabaseService
- In-memory storage for data points
- Simulates all database operations
- No external PostgreSQL required
- Data persists only during runtime

### MockAPIServer
- Simulates external API endpoints
- Configurable delay and error rates
- Rate limiting simulation
- Provides test data for News, Social, and Finance categories

### Safe Mode Features
- Automatic fallback to mock database if PostgreSQL unavailable
- Graceful degradation when services fail
- Comprehensive error handling and recovery
- Health monitoring and reporting

## Environment Variables

Create a `.env` file (automatic on first run):

```env
# Use mock database (recommended for development)
USE_MOCK_DB=true

# Dashboard configuration
DASHBOARD_PORT=3000
DASHBOARD_ENABLED=true

# Coherence filter settings
COHERENCE_SENSITIVITY=0.5
CONTEXT_WINDOW=60
PATTERN_MEMORY=1000

# Collector settings
MAX_CONCURRENT=10
RETRY_ATTEMPTS=3
RETRY_DELAY=1000

# Logging
LOG_LEVEL=info
```

## Test Scenarios

### Basic Scenario
- Tests core functionality
- Verifies data collection and filtering
- Checks dashboard connectivity
- Duration: 30 seconds

### Stress Scenario
- High concurrent API calls
- Tests system under load
- Monitors performance metrics
- Duration: 60 seconds

### Error Scenario
- 30% API error rate
- Tests retry mechanisms
- Verifies error handling
- Duration: 30 seconds

### Filter Scenario
- Tests multiple sensitivity levels
- Verifies coherence calculations
- Checks filtering accuracy
- Duration: 60 seconds

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Mock APIs     │────▶│  Data Collector │────▶│ Coherence Filter│
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                │                         │
                                ▼                         ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │  Mock Database  │     │   Dashboard     │
                        └─────────────────┘     └─────────────────┘
```

## Debugging

### Enable Debug Logging
```bash
LOG_LEVEL=debug tsx scripts/start-dev.ts
```

### View Logs
- Console output: Real-time logs with color coding
- `ecne.log`: All application logs
- `ecne-error.log`: Error logs only
- `test-run.log`: Test execution logs

### Health Check Endpoint
When dashboard is running:
```bash
curl http://localhost:3000/api/health
```

## Common Issues

### "Database connection failed"
- This is expected in mock mode
- System continues with in-memory storage
- No action required

### "Rate limited" warnings
- Mock APIs simulate rate limiting
- System automatically retries
- Normal behavior during testing

### High memory usage
- Mock database stores all data in memory
- Restart to clear data
- Use shorter retention periods in tests

## Production Deployment

For production use:
1. Set `USE_MOCK_DB=false`
2. Configure `DATABASE_URL` with real PostgreSQL
3. Add real API endpoints and authentication
4. Adjust rate limits and retry settings
5. Enable monitoring and alerting

## Contributing

When adding new features:
1. Update mock implementations if needed
2. Add test scenarios for new functionality
3. Ensure safe mode compatibility
4. Document any new environment variables