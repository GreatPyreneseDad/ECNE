/**
 * Enhanced Dashboard Components for ECNE
 * Provides advanced visualizations and export functionality
 */

import { FilteredDataPoint } from '../core/coherence-filter';
import { Pattern, Anomaly } from '../ml/pattern-detector';
import { SourceProfile } from '../ml/source-recommender';

export interface VisualizationData {
  coherenceTimeSeries: Array<{
    timestamp: Date;
    coherence: number;
    dimensions: any;
    source: string;
  }>;
  heatmapData: Array<{
    hour: number;
    source: string;
    avgCoherence: number;
    count: number;
  }>;
  networkData: {
    nodes: Array<{ id: string; label: string; value: number; group: string }>;
    edges: Array<{ from: string; to: string; value: number }>;
  };
  anomalyData: Anomaly[];
  patternData: Pattern[];
}

export interface ExportOptions {
  format: 'csv' | 'json' | 'pdf' | 'xlsx';
  dateRange?: { start: Date; end: Date };
  sources?: string[];
  includeRawData?: boolean;
  includeVisualizations?: boolean;
}

export class EnhancedDashboard {
  /**
   * Prepare data for visualizations
   */
  static prepareVisualizationData(
    dataPoints: FilteredDataPoint[],
    patterns: Pattern[],
    anomalies: Anomaly[]
  ): VisualizationData {
    // Time series data
    const coherenceTimeSeries = dataPoints.map(dp => ({
      timestamp: dp.timestamp,
      coherence: dp.coherenceScore,
      dimensions: dp.coherenceDimensions,
      source: dp.source
    }));

    // Heatmap data (hour x source)
    const heatmapData = this.generateHeatmapData(dataPoints);

    // Network data (source relationships)
    const networkData = this.generateNetworkData(dataPoints, patterns);

    return {
      coherenceTimeSeries,
      heatmapData,
      networkData,
      anomalyData: anomalies,
      patternData: patterns
    };
  }

  /**
   * Generate heatmap data for hour x source visualization
   */
  private static generateHeatmapData(dataPoints: FilteredDataPoint[]) {
    const heatmap: Map<string, { sum: number; count: number }> = new Map();

    for (const dp of dataPoints) {
      const hour = new Date(dp.timestamp).getHours();
      const key = `${hour}:${dp.source}`;
      
      if (!heatmap.has(key)) {
        heatmap.set(key, { sum: 0, count: 0 });
      }
      
      const entry = heatmap.get(key)!;
      entry.sum += dp.coherenceScore;
      entry.count++;
    }

    return Array.from(heatmap.entries()).map(([key, value]) => {
      const [hour, source] = key.split(':');
      return {
        hour: parseInt(hour),
        source,
        avgCoherence: value.sum / value.count,
        count: value.count
      };
    });
  }

  /**
   * Generate network visualization data
   */
  private static generateNetworkData(dataPoints: FilteredDataPoint[], patterns: Pattern[]) {
    const nodes: Map<string, { label: string; value: number; group: string }> = new Map();
    const edges: Map<string, { from: string; to: string; value: number }> = new Map();

    // Create nodes for sources
    const sourceGroups = new Map<string, string>();
    for (const dp of dataPoints) {
      if (!nodes.has(dp.source)) {
        nodes.set(dp.source, {
          label: dp.source,
          value: 0,
          group: 'source'
        });
      }
      nodes.get(dp.source)!.value++;
    }

    // Create nodes for patterns and connect to sources
    for (const pattern of patterns) {
      const patternId = `pattern-${pattern.id}`;
      nodes.set(patternId, {
        label: `Pattern ${pattern.id.slice(0, 8)}`,
        value: pattern.frequency,
        group: `cluster-${pattern.cluster || 0}`
      });

      // Connect pattern to sources based on feature similarity
      for (const [sourceId, sourceNode] of nodes) {
        if (sourceId.startsWith('pattern-')) continue;
        
        if (pattern.features.source === sourceId) {
          const edgeKey = `${sourceId}-${patternId}`;
          edges.set(edgeKey, {
            from: sourceId,
            to: patternId,
            value: pattern.avgCoherence
          });
        }
      }
    }

    return {
      nodes: Array.from(nodes.entries()).map(([id, data]) => ({ id, ...data })),
      edges: Array.from(edges.values())
    };
  }

  /**
   * Export data in various formats
   */
  static async exportData(
    dataPoints: FilteredDataPoint[],
    options: ExportOptions
  ): Promise<Blob> {
    // Filter data based on options
    let filteredData = dataPoints;
    
    if (options.dateRange) {
      filteredData = filteredData.filter(dp => 
        dp.timestamp >= options.dateRange!.start && 
        dp.timestamp <= options.dateRange!.end
      );
    }
    
    if (options.sources && options.sources.length > 0) {
      filteredData = filteredData.filter(dp => 
        options.sources!.includes(dp.source)
      );
    }

    switch (options.format) {
      case 'csv':
        return this.exportToCSV(filteredData);
      case 'json':
        return this.exportToJSON(filteredData, options);
      case 'xlsx':
        return this.exportToExcel(filteredData);
      case 'pdf':
        return this.exportToPDF(filteredData, options);
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
  }

  /**
   * Export to CSV format
   */
  private static exportToCSV(dataPoints: FilteredDataPoint[]): Blob {
    const headers = [
      'ID', 'Source', 'Timestamp', 'Coherence Score',
      'Psi', 'Rho', 'Q', 'F', 'Relevance Reasons'
    ];

    const rows = dataPoints.map(dp => [
      dp.id,
      dp.source,
      dp.timestamp.toISOString(),
      dp.coherenceScore.toFixed(3),
      dp.coherenceDimensions.psi.toFixed(3),
      dp.coherenceDimensions.rho.toFixed(3),
      dp.coherenceDimensions.q.toFixed(3),
      dp.coherenceDimensions.f.toFixed(3),
      dp.relevanceReason.join('; ')
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => 
        typeof cell === 'string' && cell.includes(',') 
          ? `"${cell.replace(/"/g, '""')}"` 
          : cell
      ).join(','))
    ].join('\\n');

    return new Blob([csv], { type: 'text/csv' });
  }

  /**
   * Export to JSON format
   */
  private static exportToJSON(
    dataPoints: FilteredDataPoint[], 
    options: ExportOptions
  ): Blob {
    const exportData: any = {
      metadata: {
        exportDate: new Date().toISOString(),
        totalPoints: dataPoints.length,
        dateRange: options.dateRange,
        sources: options.sources
      },
      data: dataPoints
    };

    if (options.includeRawData) {
      exportData.rawData = dataPoints.map(dp => dp.content);
    }

    return new Blob([JSON.stringify(exportData, null, 2)], { 
      type: 'application/json' 
    });
  }

  /**
   * Export to Excel format (simplified - would need a library like xlsx)
   */
  private static exportToExcel(dataPoints: FilteredDataPoint[]): Blob {
    // This is a simplified version - in production, use a library like xlsx
    const worksheet = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" 
            xmlns:x="urn:schemas-microsoft-com:office:excel" 
            xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <style>
          table { border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; }
          th { background-color: #4dc0b5; color: white; }
        </style>
      </head>
      <body>
        <table>
          <tr>
            <th>ID</th>
            <th>Source</th>
            <th>Timestamp</th>
            <th>Coherence Score</th>
            <th>Psi</th>
            <th>Rho</th>
            <th>Q</th>
            <th>F</th>
            <th>Relevance Reasons</th>
          </tr>
          ${dataPoints.map(dp => `
            <tr>
              <td>${dp.id}</td>
              <td>${dp.source}</td>
              <td>${dp.timestamp.toISOString()}</td>
              <td>${dp.coherenceScore.toFixed(3)}</td>
              <td>${dp.coherenceDimensions.psi.toFixed(3)}</td>
              <td>${dp.coherenceDimensions.rho.toFixed(3)}</td>
              <td>${dp.coherenceDimensions.q.toFixed(3)}</td>
              <td>${dp.coherenceDimensions.f.toFixed(3)}</td>
              <td>${dp.relevanceReason.join('; ')}</td>
            </tr>
          `).join('')}
        </table>
      </body>
      </html>
    `;

    return new Blob([worksheet], { 
      type: 'application/vnd.ms-excel' 
    });
  }

  /**
   * Export to PDF format (simplified - would need a library like jsPDF)
   */
  private static exportToPDF(
    dataPoints: FilteredDataPoint[], 
    options: ExportOptions
  ): Blob {
    // This is a simplified HTML version - in production, use jsPDF
    const report = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>ECNE Data River Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          h1 { color: #4dc0b5; }
          .summary { background: #f0f0f0; padding: 20px; border-radius: 8px; margin: 20px 0; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #4dc0b5; color: white; }
          .chart { page-break-inside: avoid; margin: 20px 0; }
        </style>
      </head>
      <body>
        <h1>ECNE Data River Analysis Report</h1>
        
        <div class="summary">
          <h2>Summary</h2>
          <p>Export Date: ${new Date().toLocaleString()}</p>
          <p>Total Data Points: ${dataPoints.length}</p>
          <p>Average Coherence: ${(dataPoints.reduce((sum, dp) => sum + dp.coherenceScore, 0) / dataPoints.length).toFixed(3)}</p>
          ${options.dateRange ? `
            <p>Date Range: ${options.dateRange.start.toLocaleDateString()} - ${options.dateRange.end.toLocaleDateString()}</p>
          ` : ''}
          ${options.sources ? `
            <p>Sources: ${options.sources.join(', ')}</p>
          ` : ''}
        </div>
        
        <h2>Top Coherence Data Points</h2>
        <table>
          <tr>
            <th>Source</th>
            <th>Timestamp</th>
            <th>Coherence Score</th>
            <th>Reasons</th>
          </tr>
          ${dataPoints
            .sort((a, b) => b.coherenceScore - a.coherenceScore)
            .slice(0, 10)
            .map(dp => `
              <tr>
                <td>${dp.source}</td>
                <td>${dp.timestamp.toLocaleString()}</td>
                <td>${dp.coherenceScore.toFixed(3)}</td>
                <td>${dp.relevanceReason.join(', ')}</td>
              </tr>
            `).join('')}
        </table>
        
        ${options.includeVisualizations ? `
          <div class="chart">
            <h2>Coherence Distribution</h2>
            <p>[Chart placeholder - would include actual visualization]</p>
          </div>
        ` : ''}
      </body>
      </html>
    `;

    return new Blob([report], { type: 'text/html' });
  }

  /**
   * Generate dashboard configuration for different visualization types
   */
  static getDashboardConfig(): any {
    return {
      visualizations: [
        {
          id: 'coherence-timeline',
          type: 'line',
          title: 'Coherence Over Time',
          config: {
            xAxis: 'timestamp',
            yAxis: 'coherenceScore',
            groupBy: 'source',
            aggregation: 'average',
            interval: 'auto'
          }
        },
        {
          id: 'dimension-radar',
          type: 'radar',
          title: 'Coherence Dimensions',
          config: {
            dimensions: ['psi', 'rho', 'q', 'f'],
            compareBy: 'source',
            showAverage: true
          }
        },
        {
          id: 'source-heatmap',
          type: 'heatmap',
          title: 'Source Activity Heatmap',
          config: {
            xAxis: 'hour',
            yAxis: 'source',
            value: 'coherenceScore',
            colorScale: 'viridis'
          }
        },
        {
          id: 'pattern-network',
          type: 'network',
          title: 'Pattern Relationships',
          config: {
            nodeSize: 'frequency',
            edgeWeight: 'similarity',
            layout: 'force-directed',
            clustering: true
          }
        },
        {
          id: 'anomaly-scatter',
          type: 'scatter',
          title: 'Anomaly Detection',
          config: {
            xAxis: 'timestamp',
            yAxis: 'anomalyScore',
            size: 'coherenceScore',
            color: 'type'
          }
        }
      ],
      layouts: [
        {
          id: 'overview',
          name: 'Overview Dashboard',
          grid: [
            { visualization: 'coherence-timeline', x: 0, y: 0, w: 12, h: 4 },
            { visualization: 'dimension-radar', x: 0, y: 4, w: 6, h: 4 },
            { visualization: 'source-heatmap', x: 6, y: 4, w: 6, h: 4 }
          ]
        },
        {
          id: 'analysis',
          name: 'Deep Analysis',
          grid: [
            { visualization: 'pattern-network', x: 0, y: 0, w: 8, h: 6 },
            { visualization: 'anomaly-scatter', x: 8, y: 0, w: 4, h: 6 }
          ]
        }
      ]
    };
  }
}