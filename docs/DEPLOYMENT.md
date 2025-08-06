# 🚀 Deployment Guide

## Overview

This guide covers deploying ECNE Data River Agent in various environments, from local development to production-scale cloud deployments. ECNE supports multiple deployment strategies including Docker containers, Kubernetes clusters, and serverless functions.

## 📋 Prerequisites

### System Requirements

**Minimum Requirements:**
- **CPU**: 2 cores, 2.4GHz
- **RAM**: 4GB (8GB recommended)
- **Storage**: 20GB SSD
- **Network**: Stable internet connection

**Recommended Production:**
- **CPU**: 4+ cores, 3.0GHz
- **RAM**: 16GB+
- **Storage**: 100GB+ SSD
- **Network**: High-bandwidth, low-latency

### Software Dependencies

```bash
# Node.js Runtime
node --version  # >= 18.0.0
npm --version   # >= 9.0.0

# Database (choose one)
postgresql --version  # >= 14.0
# OR use Docker for development

# Optional: Redis for caching
redis-server --version  # >= 6.0

# Optional: Docker for containerized deployment
docker --version    # >= 20.10
docker-compose --version  # >= 2.0
```

## 🏠 Local Development

### Quick Setup

```bash
# Clone repository
git clone https://github.com/GreatPyreneseDad/ECNE.git
cd ECNE-DataRiver

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit configuration (see Configuration section)
nano .env

# Run database migrations (if using PostgreSQL)
npx prisma migrate deploy

# Start in development mode
npm run dev
```

### Environment Configuration

```bash
# .env file for local development
NODE_ENV=development

# Database Configuration
DATABASE_URL="postgresql://user:password@localhost:5432/ecne"
# OR use mock storage for development
USE_MOCK_STORAGE=true

# API Keys (optional for testing)
NEWS_API_KEY="your-news-api-key"
REDDIT_API_KEY="your-reddit-api-key"

# Server Configuration
PORT=3000
HOST=localhost

# Coherence Filter Settings
COHERENCE_SENSITIVITY=0.5
DEFAULT_WEIGHTS_PSI=0.25
DEFAULT_WEIGHTS_RHO=0.25
DEFAULT_WEIGHTS_Q=0.25
DEFAULT_WEIGHTS_F=0.25

# Analytics Settings
ENABLE_ANOMALY_DETECTION=true
ENABLE_PREDICTION=true
ENABLE_WEIGHT_OPTIMIZATION=true

# Performance Settings
MAX_CONCURRENT_REQUESTS=10
BUFFER_SIZE=1000
MEMORY_THRESHOLD_MB=512

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

### Development Scripts

```bash
# Development with hot reload
npm run dev

# Run tests
npm run test
npm run test:watch
npm run test:coverage

# Linting and formatting
npm run lint
npm run lint:fix
npm run format

# Type checking
npm run type-check

# Build for production
npm run build

# Start production server
npm start
```

## 🐳 Docker Deployment

### Single Container

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build application
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S ecne -u 1001

# Change ownership
RUN chown -R ecne:nodejs /app
USER ecne

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["npm", "start"]
```

```bash
# Build and run Docker container
docker build -t ecne-datariver .

# Run with environment file
docker run --env-file .env -p 3000:3000 ecne-datariver

# Run with volume for persistent data
docker run \
  --env-file .env \
  -p 3000:3000 \
  -v ecne-data:/app/data \
  ecne-datariver
```

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  ecne:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://ecne:password@postgres:5432/ecne
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: ecne
      POSTGRES_USER: ecne
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ecne -d ecne"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped
    command: redis-server --appendonly yes

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/ssl/certs
    depends_on:
      - ecne
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:

networks:
  default:
    driver: bridge
```

```bash
# Deploy with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f ecne

# Scale ECNE instances
docker-compose up -d --scale ecne=3

# Update and restart
docker-compose pull
docker-compose up -d --force-recreate
```

## ☸️ Kubernetes Deployment

### Basic Deployment

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: ecne
---
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ecne-config
  namespace: ecne
data:
  NODE_ENV: "production"
  PORT: "3000"
  COHERENCE_SENSITIVITY: "0.5"
  ENABLE_ANOMALY_DETECTION: "true"
  LOG_LEVEL: "info"
---
# k8s/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: ecne-secrets
  namespace: ecne
type: Opaque
stringData:
  DATABASE_URL: "postgresql://user:password@postgres:5432/ecne"
  NEWS_API_KEY: "your-api-key"
  REDDIT_API_KEY: "your-reddit-key"
---
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ecne-app
  namespace: ecne
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ecne
  template:
    metadata:
      labels:
        app: ecne
    spec:
      containers:
      - name: ecne
        image: ecne-datariver:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: ecne-secrets
              key: DATABASE_URL
        - name: NEWS_API_KEY
          valueFrom:
            secretKeyRef:
              name: ecne-secrets
              key: NEWS_API_KEY
        envFrom:
        - configMapRef:
            name: ecne-config
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        volumeMounts:
        - name: logs
          mountPath: /app/logs
      volumes:
      - name: logs
        emptyDir: {}
---
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: ecne-service
  namespace: ecne
spec:
  selector:
    app: ecne
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
  type: ClusterIP
---
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ecne-ingress
  namespace: ecne
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - ecne.yourdomain.com
    secretName: ecne-tls
  rules:
  - host: ecne.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: ecne-service
            port:
              number: 80
```

### Database Deployment

```yaml
# k8s/postgres.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: ecne
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:15
        env:
        - name: POSTGRES_DB
          value: ecne
        - name: POSTGRES_USER
          value: ecne
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: password
        ports:
        - containerPort: 5432
        volumeMounts:
        - name: postgres-data
          mountPath: /var/lib/postgresql/data
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
  volumeClaimTemplates:
  - metadata:
      name: postgres-data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 20Gi
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: ecne
spec:
  selector:
    app: postgres
  ports:
  - port: 5432
    targetPort: 5432
  type: ClusterIP
```

### Deployment Commands

```bash
# Deploy to Kubernetes
kubectl apply -f k8s/

# Check deployment status
kubectl get pods -n ecne
kubectl get services -n ecne

# View logs
kubectl logs -f deployment/ecne-app -n ecne

# Scale deployment
kubectl scale deployment ecne-app --replicas=5 -n ecne

# Update deployment
kubectl set image deployment/ecne-app ecne=ecne-datariver:v2.0.0 -n ecne

# Access dashboard (port forwarding)
kubectl port-forward service/ecne-service 3000:80 -n ecne
```

## ☁️ Cloud Platform Deployments

### AWS ECS Deployment

```json
// ecs-task-definition.json
{
  "family": "ecne-task",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::account:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::account:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "ecne",
      "image": "your-account.dkr.ecr.region.amazonaws.com/ecne-datariver:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "PORT", "value": "3000" }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:region:account:secret:ecne/database-url"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/ecne",
          "awslogs-region": "us-west-2",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3
      }
    }
  ]
}
```

```bash
# Deploy to AWS ECS
aws ecs register-task-definition --cli-input-json file://ecs-task-definition.json

aws ecs create-service \
  --cluster ecne-cluster \
  --service-name ecne-service \
  --task-definition ecne-task \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-12345],securityGroups=[sg-12345],assignPublicIp=ENABLED}"
```

### Google Cloud Run

```yaml
# cloudrun-service.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: ecne-datariver
  annotations:
    run.googleapis.com/ingress: all
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/maxScale: "10"
        run.googleapis.com/cpu-throttling: "false"
    spec:
      containerConcurrency: 1000
      containers:
      - image: gcr.io/project-id/ecne-datariver:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: production
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: ecne-secrets
              key: database-url
        resources:
          limits:
            memory: 2Gi
            cpu: 2
        startupProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
```

```bash
# Deploy to Google Cloud Run
gcloud run deploy ecne-datariver \
  --image gcr.io/project-id/ecne-datariver:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --set-env-vars NODE_ENV=production
```

### Azure Container Instances

```yaml
# azure-container-group.yaml
apiVersion: '2021-09-01'
location: East US
name: ecne-container-group
properties:
  containers:
  - name: ecne
    properties:
      image: your-registry.azurecr.io/ecne-datariver:latest
      ports:
      - port: 3000
        protocol: TCP
      resources:
        requests:
          cpu: 1.0
          memoryInGb: 2.0
      environmentVariables:
      - name: NODE_ENV
        value: production
      - name: DATABASE_URL
        secureValue: postgresql://user:pass@server:5432/ecne
  osType: Linux
  restartPolicy: Always
  ipAddress:
    type: Public
    ports:
    - protocol: TCP
      port: 3000
    dnsNameLabel: ecne-datariver
type: Microsoft.ContainerInstance/containerGroups
```

## 🔧 Production Configuration

### Performance Tuning

```bash
# .env.production
NODE_ENV=production

# Optimize for production
MAX_CONCURRENT_REQUESTS=50
BUFFER_SIZE=5000
MEMORY_THRESHOLD_MB=1024

# Database connection pooling
DB_POOL_MIN=5
DB_POOL_MAX=25
DB_POOL_IDLE_TIMEOUT=30000

# Redis configuration
REDIS_URL=redis://redis-cluster:6379
REDIS_POOL_SIZE=10

# Logging optimization
LOG_LEVEL=warn
LOG_FORMAT=json
LOG_ROTATION=daily
LOG_MAX_SIZE=100MB
LOG_MAX_FILES=7

# Security
HELMET_ENABLED=true
CORS_ORIGIN=https://yourdomain.com
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=1000
RATE_LIMIT_WINDOW=900000

# Monitoring
METRICS_ENABLED=true
HEALTH_CHECK_ENABLED=true
PROMETHEUS_PORT=9090

# Cache settings
CACHE_TTL=3600
CACHE_MAX_SIZE=1000
```

### Load Balancer Configuration

```nginx
# nginx.conf
upstream ecne_backend {
    least_conn;
    server ecne-1:3000;
    server ecne-2:3000;
    server ecne-3:3000;
    keepalive 32;
}

server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    ssl_certificate /etc/ssl/certs/fullchain.pem;
    ssl_certificate_key /etc/ssl/private/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    
    # Gzip compression
    gzip on;
    gzip_types text/css application/javascript application/json;
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    
    location / {
        proxy_pass http://ecne_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Rate limiting
        limit_req zone=api burst=20 nodelay;
        
        # Timeouts
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }
    
    location /ws {
        proxy_pass http://ecne_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    location /health {
        proxy_pass http://ecne_backend/health;
        access_log off;
    }
}
```

## 📊 Monitoring & Observability

### Application Monitoring

```typescript
// monitoring/metrics.ts
import prometheus from 'prom-client';

// Custom metrics
export const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status']
});

export const coherenceScoreHistogram = new prometheus.Histogram({
  name: 'coherence_score_distribution',
  help: 'Distribution of coherence scores',
  buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
});

export const dataPointsProcessed = new prometheus.Counter({
  name: 'data_points_processed_total',
  help: 'Total number of data points processed',
  labelNames: ['source', 'status']
});

export const activeConnections = new prometheus.Gauge({
  name: 'active_websocket_connections',
  help: 'Number of active WebSocket connections'
});

// Metrics middleware
export const metricsMiddleware = (req: any, res: any, next: any) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode)
      .observe(duration);
  });
  
  next();
};
```

### Health Checks

```typescript
// health/health-check.ts
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    database: CheckResult;
    redis: CheckResult;
    apis: CheckResult;
    memory: CheckResult;
    disk: CheckResult;
  };
}

class HealthChecker {
  async getHealthStatus(): Promise<HealthStatus> {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkExternalAPIs(),
      this.checkMemoryUsage(),
      this.checkDiskSpace()
    ]);

    const status = this.determineOverallStatus(checks);

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      checks: {
        database: checks[0].status === 'fulfilled' ? checks[0].value : { status: 'fail', error: checks[0].reason },
        redis: checks[1].status === 'fulfilled' ? checks[1].value : { status: 'fail', error: checks[1].reason },
        apis: checks[2].status === 'fulfilled' ? checks[2].value : { status: 'fail', error: checks[2].reason },
        memory: checks[3].status === 'fulfilled' ? checks[3].value : { status: 'fail', error: checks[3].reason },
        disk: checks[4].status === 'fulfilled' ? checks[4].value : { status: 'fail', error: checks[4].reason }
      }
    };
  }

  private async checkDatabase(): Promise<CheckResult> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'pass', timestamp: new Date().toISOString() };
    } catch (error) {
      return { status: 'fail', timestamp: new Date().toISOString(), error: (error as Error).message };
    }
  }

  private async checkMemoryUsage(): Promise<CheckResult> {
    const memUsage = process.memoryUsage();
    const maxMemory = 2 * 1024 * 1024 * 1024; // 2GB
    const usage = memUsage.rss / maxMemory;

    if (usage > 0.9) {
      return { status: 'fail', timestamp: new Date().toISOString(), error: 'Memory usage too high' };
    } else if (usage > 0.7) {
      return { status: 'warn', timestamp: new Date().toISOString(), message: 'Memory usage elevated' };
    }

    return { status: 'pass', timestamp: new Date().toISOString() };
  }
}
```

### Logging Configuration

```typescript
// logging/logger.ts
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    process.env.NODE_ENV === 'production'
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 100 * 1024 * 1024, // 100MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 100 * 1024 * 1024, // 100MB
      maxFiles: 10
    })
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: 'logs/exceptions.log' })
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: 'logs/rejections.log' })
  ]
});

export default logger;
```

## 🔒 Security Hardening

### Container Security

```dockerfile
# Multi-stage build for security
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

FROM node:18-alpine AS runtime
# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S ecne -u 1001

# Install security updates
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*

WORKDIR /app

# Copy dependencies and app
COPY --from=builder /app/node_modules ./node_modules
COPY --chown=ecne:nodejs . .

# Remove unnecessary packages
RUN npm prune --production

USER ecne

# Use dumb-init for signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]
```

### Environment Security

```bash
# Security-focused environment variables
HELMET_ENABLED=true
CORS_ENABLED=true
RATE_LIMIT_ENABLED=true

# SSL/TLS Configuration
SSL_CERT_PATH=/etc/ssl/certs/server.crt
SSL_KEY_PATH=/etc/ssl/private/server.key
SSL_PROTOCOLS=TLSv1.2,TLSv1.3

# API Security
API_KEY_ROTATION_ENABLED=true
JWT_SECRET_ROTATION_DAYS=30
SESSION_TIMEOUT_MINUTES=60

# Database Security
DB_SSL_MODE=require
DB_SSL_CERT=/etc/ssl/certs/postgres.crt
DB_CONNECTION_TIMEOUT=30000

# Input Validation
MAX_REQUEST_SIZE=10MB
MAX_JSON_SIZE=1MB
MAX_URL_ENCODED_SIZE=1MB
```

## 📈 Scaling Strategies

### Horizontal Scaling

```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ecne-hpa
  namespace: ecne
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ecne-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
```

### Vertical Scaling

```yaml
# k8s/vpa.yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: ecne-vpa
  namespace: ecne
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ecne-app
  updatePolicy:
    updateMode: "Auto"
  resourcePolicy:
    containerPolicies:
    - containerName: ecne
      maxAllowed:
        cpu: 2
        memory: 4Gi
      minAllowed:
        cpu: 100m
        memory: 512Mi
```

## 🔄 Backup & Recovery

### Database Backup

```bash
#!/bin/bash
# scripts/backup-database.sh

DB_NAME="ecne"
DB_USER="ecne"
DB_HOST="postgres"
BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create backup
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME \
  --format=custom \
  --no-owner \
  --no-privileges \
  --compress=9 \
  --file="$BACKUP_DIR/ecne_backup_$TIMESTAMP.sql"

# Compress and encrypt
gpg --symmetric --cipher-algo AES256 \
  "$BACKUP_DIR/ecne_backup_$TIMESTAMP.sql"

# Clean up old backups (keep 30 days)
find $BACKUP_DIR -name "*.sql.gpg" -mtime +30 -delete

# Upload to S3 (optional)
aws s3 cp "$BACKUP_DIR/ecne_backup_$TIMESTAMP.sql.gpg" \
  s3://ecne-backups/database/
```

### Restore Procedure

```bash
#!/bin/bash
# scripts/restore-database.sh

BACKUP_FILE=$1
DB_NAME="ecne"
DB_USER="ecne"
DB_HOST="postgres"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file.sql.gpg>"
  exit 1
fi

# Decrypt backup
gpg --decrypt "$BACKUP_FILE" > /tmp/restore.sql

# Drop and recreate database
dropdb -h $DB_HOST -U $DB_USER $DB_NAME
createdb -h $DB_HOST -U $DB_USER $DB_NAME

# Restore from backup
pg_restore -h $DB_HOST -U $DB_USER -d $DB_NAME \
  --clean \
  --if-exists \
  /tmp/restore.sql

# Clean up
rm /tmp/restore.sql

echo "Database restore completed"
```

---

This deployment guide provides comprehensive coverage of ECNE deployment scenarios from development to enterprise-scale production environments, with emphasis on security, monitoring, and operational best practices.