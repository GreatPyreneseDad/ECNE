import React from 'react';

interface LoadingStateProps {
  message?: string;
  fullScreen?: boolean;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ 
  message = 'Loading dashboard data...', 
  fullScreen = false 
}) => {
  const containerClass = fullScreen 
    ? 'fixed inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-900'
    : 'w-full py-12';

  return (
    <div className={containerClass} role="status" aria-live="polite">
      <div className="text-center">
        {/* Accessible loading spinner */}
        <div className="inline-flex items-center justify-center mb-4">
          <svg
            className="animate-spin h-12 w-12 text-blue-600 dark:text-blue-400"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
        <p className="text-gray-600 dark:text-gray-400 text-lg">{message}</p>
      </div>
    </div>
  );
};

// Skeleton loader for data tables
export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
    <div className="animate-pulse" role="status" aria-label="Loading table data">
      <div className="space-y-3">
        {/* Header */}
        <div className="grid grid-cols-3 gap-4 pb-3 border-b border-gray-200 dark:border-gray-700">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
        {/* Rows */}
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="grid grid-cols-3 gap-4 py-3">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
          </div>
        ))}
      </div>
      <span className="sr-only">Loading table data...</span>
    </div>
  );
};

// Skeleton loader for metric cards
export const MetricSkeleton: React.FC = () => {
  return (
    <div className="animate-pulse bg-white dark:bg-gray-800 rounded-lg shadow p-6" role="status">
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-3"></div>
      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
      <span className="sr-only">Loading metric...</span>
    </div>
  );
};

// Skeleton loader for charts
export const ChartSkeleton: React.FC<{ height?: number }> = ({ height = 300 }) => {
  return (
    <div 
      className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg"
      style={{ height: `${height}px` }}
      role="status"
      aria-label="Loading chart"
    >
      <span className="sr-only">Loading chart data...</span>
    </div>
  );
};