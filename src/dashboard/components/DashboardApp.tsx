import React, { useState, useEffect, useCallback } from 'react';
import { RealTimeChart } from './RealTimeChart';
import { SystemHealthIndicator, HealthMetrics } from './SystemHealthIndicator';
import { WebSocketHandler } from '../api/websocket-handler';
import { FilteredDataPoint } from '../../types';

interface DashboardState {
  coherenceData: Array<{
    timestamp: Date;
    value: number;
    label?: string;
  }>;
  healthMetrics: HealthMetrics;
  recentDataPoints: FilteredDataPoint[];
  activeSource: string | 'all';
  sources: string[];
  connected: boolean;
  stats: {
    totalProcessed: number;
    totalFiltered: number;
    averageCoherence: number;
    activeAPIs: number;
  };
}

export const DashboardApp: React.FC = () => {
  const [state, setState] = useState<DashboardState>({
    coherenceData: [],
    healthMetrics: {
      status: 'healthy',
      cpu: 0,
      memory: 0,
      memoryMB: 0,
      errorRate: 0,
      uptime: 0,
      activeConnections: 0,
      processedCount: 0,
      failedCount: 0,
      responseTime: 0
    },
    recentDataPoints: [],
    activeSource: 'all',
    sources: [],
    connected: false,
    stats: {
      totalProcessed: 0,
      totalFiltered: 0,
      averageCoherence: 0,
      activeAPIs: 0
    }
  });
  
  const [ws, setWs] = useState<WebSocketHandler | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  
  useEffect(() => {
    // Initialize WebSocket connection
    const wsHandler = new WebSocketHandler({
      url: `ws://${window.location.hostname}:3000/ws`,
      reconnectInterval: 5000,
      maxReconnectAttempts: 10
    });
    
    // Set up event handlers
    wsHandler.on('connected', () => {
      setState(prev => ({ ...prev, connected: true }));
      wsHandler.send('subscribe', { events: ['data', 'health', 'stats'] });
    });
    
    wsHandler.on('disconnected', () => {
      setState(prev => ({ ...prev, connected: false }));
    });
    
    wsHandler.on('filtered-data', (data: FilteredDataPoint) => {
      setState(prev => {
        const newCoherenceData = [...prev.coherenceData, {
          timestamp: new Date(data.timestamp),
          value: data.coherenceScore,
          label: data.source
        }];
        
        // Keep only last 5 minutes of data
        const cutoff = Date.now() - 5 * 60 * 1000;
        const filteredData = newCoherenceData.filter(d => 
          d.timestamp.getTime() > cutoff
        );
        
        const newRecentData = [data, ...prev.recentDataPoints].slice(0, 50);
        
        return {
          ...prev,
          coherenceData: filteredData,
          recentDataPoints: newRecentData
        };
      });
    });
    
    wsHandler.on('health-update', (health: HealthMetrics) => {
      setState(prev => ({ ...prev, healthMetrics: health }));
    });
    
    wsHandler.on('stats-update', (stats: any) => {
      setState(prev => ({
        ...prev,
        stats: {
          totalProcessed: stats.totalProcessed || 0,
          totalFiltered: stats.totalFiltered || 0,
          averageCoherence: stats.averageCoherence || 0,
          activeAPIs: stats.activeAPIs || 0
        },
        sources: stats.sources || []
      }));
    });
    
    setWs(wsHandler);
    
    return () => {
      wsHandler.disconnect();
    };
  }, []);
  
  const handleRefreshHealth = useCallback(() => {
    ws?.send('request-health', {});
  }, [ws]);
  
  const handleSourceChange = useCallback((source: string) => {
    setState(prev => ({ ...prev, activeSource: source }));
  }, []);
  
  const handleExport = useCallback(() => {
    const exportData = {
      timestamp: new Date().toISOString(),
      data: state.recentDataPoints,
      stats: state.stats,
      health: state.healthMetrics
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ecne-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);
  
  const filteredCoherenceData = state.activeSource === 'all' 
    ? state.coherenceData 
    : state.coherenceData.filter(d => d.label === state.activeSource);
  
  const getFilterRate = () => {
    if (state.stats.totalProcessed === 0) return 0;
    return (state.stats.totalFiltered / state.stats.totalProcessed * 100).toFixed(1);
  };
  
  return (
    <div className={`dashboard-app min-h-screen ${theme === 'dark' ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                ECNE Data River Dashboard
              </h1>
              <div className="ml-4">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  state.connected 
                    ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' 
                    : 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
                }`}>
                  <span className={`w-2 h-2 mr-1.5 rounded-full ${
                    state.connected ? 'bg-green-400' : 'bg-red-400'
                  } animate-pulse`} />
                  {state.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                {theme === 'light' ? '🌙' : '☀️'}
              </button>
              
              <button
                onClick={handleExport}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Export Data
              </button>
            </div>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Processed</div>
            <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
              {state.stats.totalProcessed.toLocaleString()}
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Filter Rate</div>
            <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
              {getFilterRate()}%
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Avg Coherence</div>
            <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
              {state.stats.averageCoherence.toFixed(3)}
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Active APIs</div>
            <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
              {state.stats.activeAPIs}
            </div>
          </div>
        </div>
        
        {/* System Health */}
        <div className="mb-8">
          <SystemHealthIndicator 
            metrics={state.healthMetrics}
            onRefresh={handleRefreshHealth}
          />
        </div>
        
        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Coherence Score Chart */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Coherence Score Timeline
              </h2>
              
              <select
                value={state.activeSource}
                onChange={(e) => handleSourceChange(e.target.value)}
                className="text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                <option value="all">All Sources</option>
                {state.sources.map(source => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </select>
            </div>
            
            <RealTimeChart
              data={filteredCoherenceData}
              config={{
                title: 'Coherence Score',
                duration: 300000, // 5 minutes
                refreshInterval: 1000
              }}
              height={300}
            />
          </div>
          
          {/* Recent Data Points */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Recent Data Points
            </h2>
            
            <div className="overflow-y-auto max-h-80">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Source
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Score
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {state.recentDataPoints.map((point, index) => (
                    <tr key={`${point.id}-${index}`} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {point.source}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          point.coherenceScore > 0.7 
                            ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100'
                            : point.coherenceScore > 0.4
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100'
                            : 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
                        }`}>
                          {point.coherenceScore.toFixed(3)}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {new Date(point.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};