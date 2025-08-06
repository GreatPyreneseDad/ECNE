import React from 'react';

export interface HealthMetrics {
  status: 'healthy' | 'degraded' | 'critical';
  cpu: number;
  memory: number;
  memoryMB: number;
  errorRate: number;
  uptime: number;
  activeConnections: number;
  processedCount: number;
  failedCount: number;
  responseTime: number;
}

export interface HealthProps {
  metrics: HealthMetrics;
  onRefresh?: () => void;
  className?: string;
}

interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  status?: 'normal' | 'warning' | 'critical';
  trend?: 'up' | 'down' | 'stable';
  className?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ 
  title, 
  value, 
  unit = '',
  status = 'normal',
  trend,
  className = ''
}) => {
  const statusColors = {
    normal: 'text-green-600 bg-green-50 border-green-200',
    warning: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    critical: 'text-red-600 bg-red-50 border-red-200'
  };
  
  const trendIcons = {
    up: '↑',
    down: '↓',
    stable: '→'
  };
  
  return (
    <div className={`metric-card p-4 rounded-lg border ${statusColors[status]} ${className}`}>
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-medium text-gray-600">{title}</h4>
        {trend && (
          <span className={`text-sm ${trend === 'up' ? 'text-red-500' : trend === 'down' ? 'text-green-500' : 'text-gray-500'}`}>
            {trendIcons[trend]}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold">
        {value}
        {unit && <span className="text-lg font-normal ml-1">{unit}</span>}
      </div>
    </div>
  );
};

export const SystemHealthIndicator: React.FC<HealthProps> = ({ 
  metrics,
  onRefresh,
  className = '' 
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return '#10b981';
      case 'degraded': return '#f59e0b';
      case 'critical': return '#ef4444';
      default: return '#6b7280';
    }
  };
  
  const getStatusText = (status: string) => {
    switch (status) {
      case 'healthy': return 'All Systems Operational';
      case 'degraded': return 'Degraded Performance';
      case 'critical': return 'Critical Issues Detected';
      default: return 'Unknown Status';
    }
  };
  
  const formatUptime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else {
      return `${minutes}m ${seconds % 60}s`;
    }
  };
  
  const getMetricStatus = (metric: string, value: number): 'normal' | 'warning' | 'critical' => {
    switch (metric) {
      case 'cpu':
        if (value > 90) return 'critical';
        if (value > 70) return 'warning';
        return 'normal';
      case 'memory':
        if (value > 90) return 'critical';
        if (value > 70) return 'warning';
        return 'normal';
      case 'errorRate':
        if (value > 10) return 'critical';
        if (value > 5) return 'warning';
        return 'normal';
      case 'responseTime':
        if (value > 3000) return 'critical';
        if (value > 1000) return 'warning';
        return 'normal';
      default:
        return 'normal';
    }
  };
  
  return (
    <div className={`health-indicator ${className}`}>
      {/* Status Header */}
      <div className="status-header mb-6 p-4 bg-white rounded-lg shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div 
              className="status-light w-4 h-4 rounded-full mr-3 animate-pulse"
              style={{ backgroundColor: getStatusColor(metrics.status) }}
            />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                System Health
              </h3>
              <p className="text-sm text-gray-600">
                {getStatusText(metrics.status)}
              </p>
            </div>
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
            >
              Refresh
            </button>
          )}
        </div>
      </div>
      
      {/* Metrics Grid */}
      <div className="metrics-grid grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          title="CPU Usage" 
          value={metrics.cpu.toFixed(1)} 
          unit="%"
          status={getMetricStatus('cpu', metrics.cpu)}
          trend={metrics.cpu > 80 ? 'up' : metrics.cpu < 20 ? 'down' : 'stable'}
        />
        
        <MetricCard 
          title="Memory" 
          value={metrics.memoryMB.toFixed(0)} 
          unit="MB"
          status={getMetricStatus('memory', metrics.memory)}
          trend={metrics.memory > 80 ? 'up' : 'stable'}
        />
        
        <MetricCard 
          title="Error Rate" 
          value={metrics.errorRate.toFixed(1)} 
          unit="%"
          status={getMetricStatus('errorRate', metrics.errorRate)}
          trend={metrics.errorRate > 0 ? 'up' : 'stable'}
        />
        
        <MetricCard 
          title="Uptime" 
          value={formatUptime(metrics.uptime)}
          status="normal"
        />
      </div>
      
      {/* Additional Metrics */}
      <div className="additional-metrics mt-4 grid grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          title="Active Connections"
          value={metrics.activeConnections}
          status="normal"
        />
        
        <MetricCard
          title="Processed"
          value={metrics.processedCount.toLocaleString()}
          status="normal"
          trend="up"
        />
        
        <MetricCard
          title="Response Time"
          value={metrics.responseTime.toFixed(0)}
          unit="ms"
          status={getMetricStatus('responseTime', metrics.responseTime)}
        />
      </div>
      
      {/* Progress Bar for Overall Health */}
      <div className="overall-health mt-6 p-4 bg-white rounded-lg shadow-sm">
        <div className="flex justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Overall System Health</span>
          <span className="text-sm text-gray-600">
            {metrics.status === 'healthy' ? '100%' : metrics.status === 'degraded' ? '75%' : '50%'}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="h-2 rounded-full transition-all duration-500"
            style={{
              width: metrics.status === 'healthy' ? '100%' : metrics.status === 'degraded' ? '75%' : '50%',
              backgroundColor: getStatusColor(metrics.status)
            }}
          />
        </div>
      </div>
    </div>
  );
};