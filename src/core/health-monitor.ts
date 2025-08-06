import * as os from 'os';
import { EventEmitter } from 'events';

export interface SystemMetrics {
  uptime: number;
  memoryUsage: number;
  memoryPercentage: number;
  cpuUsage: number;
  activeConnections: number;
  errorRate: number;
  responseTime: number[];
  processedCount: number;
  failedCount: number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'critical';
  metrics: SystemMetrics;
  alerts: Alert[];
  timestamp: Date;
}

export interface Alert {
  level: 'warning' | 'error' | 'critical';
  message: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: Date;
}

export interface HealthThresholds {
  memoryPercentage: { warning: number; critical: number };
  cpuPercentage: { warning: number; critical: number };
  errorRate: { warning: number; critical: number };
  responseTime: { warning: number; critical: number };
}

export class HealthMonitor extends EventEmitter {
  private metrics: SystemMetrics = {
    uptime: 0,
    memoryUsage: 0,
    memoryPercentage: 0,
    cpuUsage: 0,
    activeConnections: 0,
    errorRate: 0,
    responseTime: [],
    processedCount: 0,
    failedCount: 0
  };
  
  private alerts: Alert[] = [];
  private cpuUsageHistory: number[] = [];
  private metricsInterval?: NodeJS.Timeout;
  private thresholdInterval?: NodeJS.Timeout;
  
  private thresholds: HealthThresholds = {
    memoryPercentage: { warning: 70, critical: 90 },
    cpuPercentage: { warning: 80, critical: 95 },
    errorRate: { warning: 5, critical: 10 },
    responseTime: { warning: 1000, critical: 3000 }
  };
  
  private connectionCounter = 0;
  private startTime = Date.now();
  
  startMonitoring(): void {
    this.metricsInterval = setInterval(() => this.collectMetrics(), 5000);
    this.thresholdInterval = setInterval(() => this.checkThresholds(), 10000);
    
    // Initial collection
    this.collectMetrics();
  }
  
  stopMonitoring(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    if (this.thresholdInterval) {
      clearInterval(this.thresholdInterval);
    }
  }
  
  private async collectMetrics(): Promise<void> {
    // Memory metrics
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    this.metrics.memoryUsage = memUsage.heapUsed;
    this.metrics.memoryPercentage = (usedMem / totalMem) * 100;
    
    // CPU metrics
    const cpuUsage = await this.getCPUUsage();
    this.metrics.cpuUsage = cpuUsage;
    this.cpuUsageHistory.push(cpuUsage);
    if (this.cpuUsageHistory.length > 12) { // Keep 1 minute of history
      this.cpuUsageHistory.shift();
    }
    
    // Uptime
    this.metrics.uptime = Date.now() - this.startTime;
    
    // Error rate calculation
    const total = this.metrics.processedCount + this.metrics.failedCount;
    this.metrics.errorRate = total > 0 ? (this.metrics.failedCount / total) * 100 : 0;
    
    // Clean old response times (keep last 100)
    if (this.metrics.responseTime.length > 100) {
      this.metrics.responseTime = this.metrics.responseTime.slice(-100);
    }
    
    this.emit('metrics-collected', this.metrics);
  }
  
  private async getCPUUsage(): Promise<number> {
    const cpus = os.cpus();
    
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      const startTime = Date.now();
      
      setTimeout(() => {
        const endUsage = process.cpuUsage(startUsage);
        const endTime = Date.now();
        
        const userTime = endUsage.user;
        const systemTime = endUsage.system;
        const totalTime = userTime + systemTime;
        const elapsedTime = (endTime - startTime) * 1000; // Convert to microseconds
        
        const cpuPercent = (totalTime / elapsedTime) * 100;
        resolve(Math.min(cpuPercent, 100));
      }, 100);
    });
  }
  
  private checkThresholds(): void {
    this.alerts = [];
    
    // Check memory
    if (this.metrics.memoryPercentage > this.thresholds.memoryPercentage.critical) {
      this.addAlert('critical', 'Memory usage critical', 'memoryPercentage', 
        this.metrics.memoryPercentage, this.thresholds.memoryPercentage.critical);
    } else if (this.metrics.memoryPercentage > this.thresholds.memoryPercentage.warning) {
      this.addAlert('warning', 'Memory usage high', 'memoryPercentage',
        this.metrics.memoryPercentage, this.thresholds.memoryPercentage.warning);
    }
    
    // Check CPU
    const avgCPU = this.cpuUsageHistory.reduce((a, b) => a + b, 0) / this.cpuUsageHistory.length;
    if (avgCPU > this.thresholds.cpuPercentage.critical) {
      this.addAlert('critical', 'CPU usage critical', 'cpuUsage',
        avgCPU, this.thresholds.cpuPercentage.critical);
    } else if (avgCPU > this.thresholds.cpuPercentage.warning) {
      this.addAlert('warning', 'CPU usage high', 'cpuUsage',
        avgCPU, this.thresholds.cpuPercentage.warning);
    }
    
    // Check error rate
    if (this.metrics.errorRate > this.thresholds.errorRate.critical) {
      this.addAlert('critical', 'Error rate critical', 'errorRate',
        this.metrics.errorRate, this.thresholds.errorRate.critical);
    } else if (this.metrics.errorRate > this.thresholds.errorRate.warning) {
      this.addAlert('warning', 'Error rate elevated', 'errorRate',
        this.metrics.errorRate, this.thresholds.errorRate.warning);
    }
    
    // Check response time
    if (this.metrics.responseTime.length > 0) {
      const avgResponseTime = this.metrics.responseTime.reduce((a, b) => a + b, 0) / 
        this.metrics.responseTime.length;
        
      if (avgResponseTime > this.thresholds.responseTime.critical) {
        this.addAlert('critical', 'Response time critical', 'responseTime',
          avgResponseTime, this.thresholds.responseTime.critical);
      } else if (avgResponseTime > this.thresholds.responseTime.warning) {
        this.addAlert('warning', 'Response time slow', 'responseTime',
          avgResponseTime, this.thresholds.responseTime.warning);
      }
    }
    
    this.emit('thresholds-checked', this.alerts);
  }
  
  private addAlert(level: Alert['level'], message: string, metric: string, 
    value: number, threshold: number): void {
    const alert: Alert = {
      level,
      message,
      metric,
      value,
      threshold,
      timestamp: new Date()
    };
    
    this.alerts.push(alert);
    this.emit('alert', alert);
  }
  
  private determineStatus(): HealthStatus['status'] {
    if (this.alerts.some(a => a.level === 'critical')) {
      return 'critical';
    }
    
    if (this.alerts.some(a => a.level === 'warning') || this.alerts.length > 2) {
      return 'degraded';
    }
    
    return 'healthy';
  }
  
  incrementConnection(): void {
    this.connectionCounter++;
    this.metrics.activeConnections = this.connectionCounter;
  }
  
  decrementConnection(): void {
    this.connectionCounter = Math.max(0, this.connectionCounter - 1);
    this.metrics.activeConnections = this.connectionCounter;
  }
  
  recordProcessed(): void {
    this.metrics.processedCount++;
  }
  
  recordFailed(): void {
    this.metrics.failedCount++;
  }
  
  recordResponseTime(duration: number): void {
    this.metrics.responseTime.push(duration);
  }
  
  getHealthStatus(): HealthStatus {
    return {
      status: this.determineStatus(),
      metrics: { ...this.metrics },
      alerts: [...this.alerts],
      timestamp: new Date()
    };
  }
  
  getActiveAlerts(): Alert[] {
    // Return alerts from last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return this.alerts.filter(alert => alert.timestamp > fiveMinutesAgo);
  }
  
  updateThresholds(newThresholds: Partial<HealthThresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds };
  }
  
  reset(): void {
    this.metrics = {
      uptime: Date.now() - this.startTime,
      memoryUsage: 0,
      memoryPercentage: 0,
      cpuUsage: 0,
      activeConnections: this.connectionCounter,
      errorRate: 0,
      responseTime: [],
      processedCount: 0,
      failedCount: 0
    };
    
    this.alerts = [];
    this.cpuUsageHistory = [];
  }
}