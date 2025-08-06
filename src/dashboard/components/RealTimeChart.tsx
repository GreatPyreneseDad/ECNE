import React, { useRef, useEffect, useState } from 'react';
import { Chart, ChartConfiguration, ChartType, registerables } from 'chart.js';
import 'chartjs-adapter-date-fns';
import { StreamingPlugin } from 'chartjs-plugin-streaming';

Chart.register(...registerables, StreamingPlugin);

export interface ChartProps {
  data: {
    timestamp: Date;
    value: number;
    label?: string;
  }[];
  config?: {
    primaryColor?: string;
    backgroundColor?: string;
    gridColor?: string;
    title?: string;
    yAxisLabel?: string;
    duration?: number; // ms to display
    refreshInterval?: number; // ms
    min?: number;
    max?: number;
  };
  height?: number;
  className?: string;
}

export const RealTimeChart: React.FC<ChartProps> = ({ 
  data, 
  config = {},
  height = 300,
  className = ''
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [chart, setChart] = useState<Chart | null>(null);
  
  const {
    primaryColor = '#3b82f6',
    backgroundColor = 'rgba(59, 130, 246, 0.1)',
    gridColor = '#e5e7eb',
    title = 'Coherence Score',
    yAxisLabel = 'Score',
    duration = 60000, // 1 minute
    refreshInterval = 1000, // 1 second
    min = 0,
    max = 1
  } = config;
  
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    
    const chartConfig: ChartConfiguration = {
      type: 'line' as ChartType,
      data: {
        datasets: [{
          label: title,
          data: data.map(d => ({
            x: d.timestamp,
            y: d.value
          })),
          borderColor: primaryColor,
          backgroundColor: backgroundColor,
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: primaryColor,
          pointHoverBorderColor: '#ffffff',
          pointHoverBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        scales: {
          x: {
            type: 'realtime',
            realtime: {
              duration: duration,
              refresh: refreshInterval,
              delay: refreshInterval,
              onRefresh: (chart) => {
                // This will be called to update data
                const datasets = chart.data.datasets;
                datasets.forEach(dataset => {
                  // Add new data points from the data prop
                  const latestData = data[data.length - 1];
                  if (latestData) {
                    dataset.data.push({
                      x: latestData.timestamp,
                      y: latestData.value
                    });
                  }
                });
              }
            },
            grid: {
              color: gridColor,
              lineWidth: 0.5
            },
            ticks: {
              font: {
                size: 11
              },
              color: '#6b7280'
            }
          },
          y: {
            min: min,
            max: max,
            title: {
              display: true,
              text: yAxisLabel,
              font: {
                size: 12
              },
              color: '#6b7280'
            },
            grid: {
              color: gridColor,
              lineWidth: 0.5
            },
            ticks: {
              font: {
                size: 11
              },
              color: '#6b7280',
              callback: function(value) {
                return value.toFixed(2);
              }
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            enabled: true,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: '#ffffff',
            bodyColor: '#ffffff',
            borderColor: primaryColor,
            borderWidth: 1,
            titleFont: {
              size: 12
            },
            bodyFont: {
              size: 11
            },
            padding: 8,
            displayColors: false,
            callbacks: {
              title: (tooltipItems) => {
                const date = new Date(tooltipItems[0].parsed.x);
                return date.toLocaleTimeString();
              },
              label: (context) => {
                return `${title}: ${context.parsed.y.toFixed(3)}`;
              }
            }
          }
        }
      }
    };
    
    const newChart = new Chart(ctx, chartConfig);
    setChart(newChart);
    
    return () => {
      newChart.destroy();
    };
  }, []);
  
  // Update chart data when new data comes in
  useEffect(() => {
    if (!chart || data.length === 0) return;
    
    const dataset = chart.data.datasets[0];
    const latestData = data[data.length - 1];
    
    if (latestData && dataset.data.length > 0) {
      const lastDataPoint = dataset.data[dataset.data.length - 1] as any;
      
      // Only add if it's a new data point
      if (lastDataPoint.x !== latestData.timestamp.getTime()) {
        dataset.data.push({
          x: latestData.timestamp,
          y: latestData.value
        });
        
        // Remove old data points to prevent memory issues
        const cutoffTime = Date.now() - duration;
        dataset.data = dataset.data.filter((point: any) => 
          point.x > cutoffTime
        );
      }
    }
  }, [data, chart, duration]);
  
  return (
    <div className={`chart-container ${className}`} style={{ height: `${height}px` }}>
      <canvas ref={canvasRef} />
    </div>
  );
};