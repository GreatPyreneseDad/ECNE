# ECNE Data River Setup Guide

## Prerequisites

- Node.js 18+ 
- PostgreSQL 14+
- npm or yarn

## Quick Start

### 1. Clone and Install

```bash
cd /Users/chris/ECNE-DataRiver
npm install
```

### 2. Database Setup

Create a PostgreSQL database:

```sql
CREATE DATABASE ecne_datariver;
```

### 3. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Update `.env` with your database connection:

```
DATABASE_URL=postgresql://username:password@localhost:5432/ecne_datariver
```

### 4. Database Migration

Generate Prisma client and run migrations:

```bash
npm run db:generate
npm run db:migrate
```

### 5. Start ECNE

```bash
npm run dev
```

The dashboard will be available at http://localhost:3000

## Configuration

### Coherence Filter Parameters

Adjust in `.env` or via the dashboard:

- **Sensitivity** (0-1): Threshold for data inclusion
- **Weights**: Balance between coherence dimensions
  - Ψ (Psi): Internal consistency weight
  - ρ (Rho): Historical pattern weight  
  - q (Q): Value alignment weight
  - f (F): Social relevance weight

### API Sources

By default, ECNE starts with News, Social, and Finance APIs from the public list.

To add custom sources:

```typescript
ecne.addSource({
  id: 'custom-api',
  name: 'My Custom API',
  baseUrl: 'https://api.example.com',
  endpoints: [{
    path: '/data',
    method: 'GET',
    refreshInterval: 300, // 5 minutes
    dataExtractor: (response) => response.items
  }],
  auth: { type: 'none' }
});
```

## Usage

### Dashboard Features

1. **Real-time Monitoring**: Watch data flow through coherence filters
2. **Filter Controls**: Adjust sensitivity and dimension weights
3. **Coherence Visualization**: Track coherence scores over time
4. **Pattern Recognition**: Identify emerging themes

### API Endpoints

- `GET /api/data` - Query filtered data points
- `GET /api/statistics/coherence` - Coherence metrics over time
- `GET /api/patterns` - Top patterns by coherence
- `GET /api/sources` - Active data sources summary

### WebSocket Events

Connect to receive real-time updates:

```javascript
const socket = io('http://localhost:3000');

socket.on('data-point', (data) => {
  console.log('New coherent data:', data);
});
```

## Understanding Coherence Scores

### Dimensions

1. **Ψ (Internal Consistency)**: How well data aligns with recent context
2. **ρ (Accumulated Wisdom)**: Match with historical patterns
3. **q (Moral Activation)**: Ethical and value relevance
4. **f (Social Belonging)**: Community and social patterns

### Interpretation

- **0.8-1.0**: Highly coherent, strong relevance
- **0.6-0.8**: Moderately coherent, good relevance
- **0.4-0.6**: Low coherence, marginal relevance
- **0.0-0.4**: Minimal coherence, likely noise

## Troubleshooting

### Database Connection Issues

```bash
# Test connection
psql -h localhost -U username -d ecne_datariver
```

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000
# Kill process
kill -9 <PID>
```

### High Memory Usage

Adjust data retention in `.env`:
```
DATA_RETENTION_DAYS=7  # Reduce from 30
```

## Advanced Configuration

### Custom Data Extractors

Create specialized extractors for complex APIs:

```typescript
const customExtractor = (response: any) => {
  // Transform response to standard format
  return response.nested.data.map(item => ({
    id: item.uuid,
    content: item.payload,
    timestamp: new Date(item.created_at)
  }));
};
```

### Pattern Recognition

ECNE automatically detects patterns. To query:

```bash
curl http://localhost:3000/api/patterns?timeRange=24&limit=10
```

### Coherence Tuning

For specific use cases, adjust the coherence calculation:

1. **News Focus**: Increase ρ (historical) weight
2. **Social Media**: Increase f (social) weight
3. **Ethics/Values**: Increase q (moral) weight
4. **Real-time**: Increase Ψ (consistency) weight

## Production Deployment

### Docker Setup

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm ci --only=production
RUN npm run build
CMD ["npm", "start"]
```

### Environment Variables

Required for production:
- `NODE_ENV=production`
- `DATABASE_URL` (with SSL)
- `DASHBOARD_PORT`

### Scaling Considerations

- Use Redis for distributed caching
- Implement horizontal scaling for collectors
- Use TimescaleDB for better time-series performance

## Contributing

See main README.md for contribution guidelines.

## Support

For issues and questions, check the logs:
```bash
tail -f ecne.log
```