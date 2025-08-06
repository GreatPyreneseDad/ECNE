# 🎨 Dashboard Guide

## Overview

The ECNE Dashboard provides a comprehensive real-time interface for monitoring data streams, visualizing coherence patterns, and configuring system parameters. Built with modern web technologies, it offers an intuitive experience for understanding complex data flows.

## 🚀 Getting Started

### Launching the Dashboard

```bash
# Start development server
npm run dev

# Production build
npm run build && npm start

# Access dashboard
open http://localhost:3000
```

### First-Time Setup

1. **Configure Data Sources**: Add API endpoints in Settings
2. **Set Filter Parameters**: Adjust coherence sensitivity and weights
3. **Choose Visualization**: Select preferred chart types and layouts
4. **Enable Notifications**: Configure alerts for anomalies and patterns

## 🎯 Main Interface Components

### 1. Header Navigation

```typescript
interface HeaderProps {
  currentView: 'overview' | 'analytics' | 'settings';
  notifications: NotificationItem[];
  userPreferences: UserPrefs;
}
```

**Features:**
- **Real-time Status**: System health indicators
- **Quick Actions**: Export, settings, help shortcuts
- **Search Bar**: Global search across data (⌘K)
- **Theme Toggle**: Dark/light mode switching

### 2. Sidebar Navigation

**Main Sections:**
- 📊 **Overview**: Real-time coherence dashboard
- 📈 **Analytics**: Deep-dive analysis and ML insights
- 🔌 **Sources**: API data source management
- ⚙️ **Settings**: Configuration and preferences
- 📚 **Help**: Documentation and support

**Quick Filters:**
- Time ranges (1H, 24H, 7D, 30D, Custom)
- Coherence thresholds (High, Medium, Low, All)
- Data sources (Individual API toggles)
- Anomaly filters (Show/hide unusual patterns)

### 3. Main Content Area

Dynamic content area that adapts based on selected view and user preferences.

## 📊 Overview Dashboard

### Real-time Metrics Panel

```typescript
interface MetricsPanel {
  totalDataPoints: number;
  filteredPoints: number;
  averageCoherence: number;
  activeAnomalies: number;
  processingRate: number;
  uptime: string;
}
```

**Key Metrics:**
- **Data Throughput**: Real-time processing rates
- **Coherence Score**: Current average across all sources
- **Filter Efficiency**: Percentage of data passing filters
- **System Status**: Health indicators and uptime

### Interactive Visualizations

#### 1. Coherence Heatmap

```javascript
// D3.js implementation
const heatmap = d3.select('#coherence-heatmap')
  .append('svg')
  .attr('width', 800)
  .attr('height', 400);

// Color scale for coherence values
const colorScale = d3.scaleSequential(d3.interpolateViridis)
  .domain([0, 1]);

// Time-based heatmap cells
const cells = heatmap.selectAll('.coherence-cell')
  .data(coherenceData)
  .enter()
  .append('rect')
  .attr('class', 'coherence-cell')
  .attr('fill', d => colorScale(d.coherenceScore))
  .on('mouseover', showTooltip)
  .on('mouseout', hideTooltip);
```

**Features:**
- **Time-based Visualization**: Hourly/daily coherence patterns
- **Interactive Tooltips**: Detailed metrics on hover
- **Zoom Controls**: Focus on specific time periods
- **Color Coding**: Intuitive coherence intensity mapping

#### 2. Data Flow Animation

```css
/* CSS animations for data flow */
@keyframes dataFlow {
  0% { transform: translateX(-100px); opacity: 0; }
  50% { opacity: 1; }
  100% { transform: translateX(100px); opacity: 0; }
}

.data-particle {
  animation: dataFlow 3s ease-in-out infinite;
  border-radius: 50%;
  position: absolute;
}

.high-coherence { background-color: #4ade80; }
.medium-coherence { background-color: #fbbf24; }
.low-coherence { background-color: #f87171; }
```

**Visual Elements:**
- **Animated Particles**: Represent individual data points
- **Flow Paths**: Show data movement through system
- **Color Coding**: Coherence level indication
- **Speed Variation**: Processing rate visualization

#### 3. Network Graph

```javascript
// Force-directed graph for API relationships
const simulation = d3.forceSimulation(nodes)
  .force('link', d3.forceLink(links).id(d => d.id))
  .force('charge', d3.forceManyBody().strength(-300))
  .force('center', d3.forceCenter(width / 2, height / 2));

// Node styling based on coherence contribution
const nodeColor = d3.scaleOrdinal()
  .domain(['high', 'medium', 'low'])
  .range(['#10b981', '#f59e0b', '#ef4444']);
```

**Capabilities:**
- **Source Relationships**: Visualize API interconnections
- **Coherence Contribution**: Node size based on relevance
- **Interactive Exploration**: Click and drag functionality
- **Clustering**: Group related data sources

### Widget System

#### Draggable Dashboard Widgets

```typescript
interface DashboardWidget {
  id: string;
  type: 'chart' | 'metric' | 'table' | 'custom';
  title: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  config: WidgetConfig;
}

// Widget management
class DashboardManager {
  widgets: Map<string, DashboardWidget> = new Map();

  addWidget(widget: DashboardWidget): void {
    this.widgets.set(widget.id, widget);
    this.renderWidget(widget);
  }

  updatePosition(id: string, position: Position): void {
    const widget = this.widgets.get(id);
    if (widget) {
      widget.position = position;
      this.saveLayout();
    }
  }
}
```

**Available Widgets:**
- **Coherence Trends**: Time-series line charts
- **Source Status**: API health monitoring
- **Top Patterns**: Most frequent coherence patterns
- **Anomaly Alerts**: Recent unusual detections
- **Performance Metrics**: System resource usage
- **Custom Queries**: User-defined data views

## 📈 Analytics Dashboard

### Advanced Visualizations

#### 1. Dimensional Analysis Radar

```javascript
// Radar chart for GCT dimensions
const radarData = [
  { axis: 'Ψ (Internal Consistency)', value: 0.8 },
  { axis: 'ρ (Accumulated Wisdom)', value: 0.6 },
  { axis: 'q (Moral Activation)', value: 0.9 },
  { axis: 'f (Social Belonging)', value: 0.7 }
];

const radarChart = new RadarChart('#dimension-radar', {
  data: radarData,
  levels: 5,
  maxValue: 1.0,
  showLegend: true,
  animationDuration: 1000
});
```

#### 2. Prediction Timeline

```typescript
// Time-series prediction visualization
interface PredictionData {
  timestamp: Date;
  actual?: number;
  predicted: number;
  confidence: number;
  bounds: { upper: number; lower: number };
}

const predictionChart = new PredictionTimeline('#prediction-chart', {
  data: predictionData,
  showConfidenceInterval: true,
  predictionHorizon: 60, // minutes
  updateInterval: 5000 // 5 seconds
});
```

### Interactive Analysis Tools

#### A/B Testing Interface

```typescript
interface ABTestConfig {
  name: string;
  description: string;
  variants: {
    control: FilterConfig;
    test: FilterConfig;
  };
  duration: number; // minutes
  metrics: string[];
}

// A/B test management component
const ABTestManager = () => {
  const [tests, setTests] = useState<ABTest[]>([]);
  const [activeTest, setActiveTest] = useState<ABTest | null>(null);

  const startTest = (config: ABTestConfig) => {
    const test = new ABTest(config);
    test.start();
    setActiveTest(test);
  };

  return (
    <div className="ab-test-manager">
      <TestConfiguration onStart={startTest} />
      {activeTest && <TestResults test={activeTest} />}
    </div>
  );
};
```

#### Pattern Clustering Viewer

```typescript
// Cluster visualization component
const ClusterViewer = ({ clusters }: { clusters: PatternCluster[] }) => {
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);

  return (
    <div className="cluster-viewer">
      <ClusterScatterPlot
        clusters={clusters}
        onClusterSelect={setSelectedCluster}
      />
      {selectedCluster && (
        <ClusterDetails clusterId={selectedCluster} />
      )}
    </div>
  );
};
```

## ⚙️ Configuration Interface

### Filter Settings Panel

```typescript
interface FilterSettings {
  sensitivity: number;
  weights: {
    psi: number;
    rho: number;
    q: number;
    f: number;
  };
  timeWindow: number;
  bufferSize: number;
  enableAnomalyDetection: boolean;
  enablePrediction: boolean;
}

const FilterSettingsPanel = () => {
  const [settings, setSettings] = useState<FilterSettings>(defaultSettings);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const optimizeWeights = async () => {
    setIsOptimizing(true);
    const optimizer = new WeightOptimizer();
    const optimized = await optimizer.optimize(settings.weights);
    setSettings({ ...settings, weights: optimized });
    setIsOptimizing(false);
  };

  return (
    <div className="filter-settings">
      <WeightSliders weights={settings.weights} onChange={setSettings} />
      <SensitivitySlider value={settings.sensitivity} onChange={setSensitivity} />
      <OptimizationButton onClick={optimizeWeights} loading={isOptimizing} />
    </div>
  );
};
```

### Data Source Management

```typescript
// API source configuration
interface APISourceConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  endpoints: EndpointConfig[];
  rateLimits: {
    requestsPerMinute: number;
    requestsPerHour: number;
  };
  enabled: boolean;
}

const SourceManager = () => {
  const [sources, setSources] = useState<APISourceConfig[]>([]);
  const [editingSource, setEditingSource] = useState<APISourceConfig | null>(null);

  const testConnection = async (source: APISourceConfig) => {
    try {
      const response = await fetch(`${source.baseUrl}/health`);
      return response.ok;
    } catch (error) {
      return false;
    }
  };

  return (
    <div className="source-manager">
      <SourceList 
        sources={sources}
        onEdit={setEditingSource}
        onTest={testConnection}
      />
      {editingSource && (
        <SourceEditor 
          source={editingSource}
          onSave={handleSave}
          onCancel={() => setEditingSource(null)}
        />
      )}
    </div>
  );
};
```

## 🎨 UI Components Library

### Custom Components

#### CoherenceGauge

```typescript
interface CoherenceGaugeProps {
  value: number;
  max: number;
  size: 'sm' | 'md' | 'lg';
  showLabel: boolean;
  animated: boolean;
}

const CoherenceGauge: React.FC<CoherenceGaugeProps> = ({
  value,
  max,
  size = 'md',
  showLabel = true,
  animated = true
}) => {
  const percentage = (value / max) * 100;
  const radius = size === 'sm' ? 40 : size === 'md' ? 60 : 80;
  
  return (
    <div className={`coherence-gauge ${size}`}>
      <svg width={radius * 2} height={radius * 2}>
        <circle
          cx={radius}
          cy={radius}
          r={radius - 10}
          fill="transparent"
          stroke="#e5e7eb"
          strokeWidth="8"
        />
        <circle
          cx={radius}
          cy={radius}
          r={radius - 10}
          fill="transparent"
          stroke={getColorForValue(value)}
          strokeWidth="8"
          strokeDasharray={`${percentage * 3.14159} ${314.159}`}
          strokeLinecap="round"
          className={animated ? 'animated' : ''}
        />
      </svg>
      {showLabel && <span className="gauge-label">{value.toFixed(2)}</span>}
    </div>
  );
};
```

#### DataTable

```typescript
interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  sortable: boolean;
  filterable: boolean;
  pagination: boolean;
  pageSize: number;
}

const DataTable = <T,>({
  data,
  columns,
  sortable = true,
  filterable = true,
  pagination = true,
  pageSize = 50
}: DataTableProps<T>) => {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filtering, setFiltering] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize });

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters: filtering, pagination },
    onSortingChange: setSorting,
    onColumnFiltersChange: setFiltering,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel()
  });

  return (
    <div className="data-table">
      {filterable && <DataTableToolbar table={table} />}
      <table className="w-full">
        <DataTableHeader headerGroups={table.getHeaderGroups()} />
        <DataTableBody rows={table.getRowModel().rows} />
      </table>
      {pagination && <DataTablePagination table={table} />}
    </div>
  );
};
```

## 📱 Responsive Design

### Breakpoint System

```css
/* Responsive design breakpoints */
.dashboard-container {
  display: grid;
  gap: 1rem;
  padding: 1rem;
}

/* Desktop (default) */
@media (min-width: 1024px) {
  .dashboard-container {
    grid-template-columns: 250px 1fr;
    grid-template-rows: 60px 1fr;
    grid-template-areas:
      "sidebar header"
      "sidebar main";
  }
}

/* Tablet */
@media (max-width: 1023px) and (min-width: 768px) {
  .dashboard-container {
    grid-template-columns: 1fr;
    grid-template-rows: 60px 50px 1fr;
    grid-template-areas:
      "header"
      "nav"
      "main";
  }
  
  .sidebar {
    display: none;
  }
  
  .mobile-nav {
    display: block;
  }
}

/* Mobile */
@media (max-width: 767px) {
  .dashboard-container {
    grid-template-columns: 1fr;
    padding: 0.5rem;
  }
  
  .widget {
    grid-column: 1;
    min-height: 200px;
  }
  
  .chart-container {
    height: 250px; /* Reduced for mobile */
  }
}
```

### Mobile Optimizations

- **Touch-friendly Controls**: Larger tap targets
- **Simplified Navigation**: Hamburger menu and tabs
- **Optimized Charts**: Reduced complexity for small screens
- **Swipe Gestures**: Navigate between views
- **Offline Support**: Service worker caching

## ⚡ Performance Optimizations

### Virtual Scrolling

```typescript
// Virtual scrolling for large datasets
const VirtualDataList = ({ items, itemHeight = 50 }: VirtualListProps) => {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const containerHeight = 400;
  const visibleItems = Math.ceil(containerHeight / itemHeight);
  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.min(startIndex + visibleItems + 1, items.length);
  
  const visibleData = items.slice(startIndex, endIndex);
  
  return (
    <div
      ref={containerRef}
      className="virtual-list"
      style={{ height: containerHeight, overflow: 'auto' }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: items.length * itemHeight, position: 'relative' }}>
        {visibleData.map((item, index) => (
          <div
            key={startIndex + index}
            style={{
              position: 'absolute',
              top: (startIndex + index) * itemHeight,
              height: itemHeight,
              width: '100%'
            }}
          >
            <DataItem item={item} />
          </div>
        ))}
      </div>
    </div>
  );
};
```

### Chart Performance

```typescript
// Optimized chart rendering
const OptimizedChart = ({ data, width, height }: ChartProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Use requestAnimationFrame for smooth updates
    let animationId: number;
    
    const render = () => {
      ctx.clearRect(0, 0, width, height);
      
      // Batch DOM updates
      requestAnimationFrame(() => {
        drawChart(ctx, data, { width, height });
        animationId = requestAnimationFrame(render);
      });
    };
    
    render();
    
    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [data, width, height]);
  
  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ maxWidth: '100%', height: 'auto' }}
    />
  );
};
```

## 🔧 Developer Tools

### Debug Panel

```typescript
// Development debug panel
const DebugPanel = ({ enabled }: { enabled: boolean }) => {
  const [debugInfo, setDebugInfo] = useState({
    memoryUsage: 0,
    renderTime: 0,
    activeConnections: 0,
    cacheHitRate: 0
  });
  
  useEffect(() => {
    if (!enabled) return;
    
    const interval = setInterval(() => {
      setDebugInfo({
        memoryUsage: (performance as any).memory?.usedJSHeapSize || 0,
        renderTime: performance.now(),
        activeConnections: websocketManager.getConnectionCount(),
        cacheHitRate: cacheManager.getHitRate()
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [enabled]);
  
  if (!enabled) return null;
  
  return (
    <div className="debug-panel">
      <h3>Debug Information</h3>
      <dl>
        <dt>Memory Usage:</dt>
        <dd>{(debugInfo.memoryUsage / 1024 / 1024).toFixed(2)} MB</dd>
        <dt>Active WebSocket Connections:</dt>
        <dd>{debugInfo.activeConnections}</dd>
        <dt>Cache Hit Rate:</dt>
        <dd>{(debugInfo.cacheHitRate * 100).toFixed(1)}%</dd>
      </dl>
    </div>
  );
};
```

### Component Inspector

- **React DevTools Integration**: Debug component state
- **Performance Profiling**: Identify rendering bottlenecks  
- **Network Monitoring**: Track API requests and responses
- **Error Boundary**: Graceful error handling and reporting

## 🎮 Keyboard Shortcuts

### Global Shortcuts

| Shortcut | Action |
|----------|---------|
| `⌘ + K` | Open global search |
| `⌘ + /` | Show help overlay |
| `⌘ + E` | Export current view |
| `⌘ + R` | Refresh data |
| `⌘ + D` | Toggle dark mode |
| `⌘ + ,` | Open settings |
| `Esc` | Close modals/overlays |

### Navigation Shortcuts

| Shortcut | Action |
|----------|---------|
| `1-5` | Switch dashboard sections |
| `Tab` | Navigate focusable elements |
| `Space` | Toggle selections |
| `↑/↓` | Navigate lists |
| `Enter` | Activate/confirm |

## 🎭 Theming and Customization

### CSS Variables

```css
:root {
  /* Primary colors */
  --color-primary: #3b82f6;
  --color-primary-hover: #2563eb;
  --color-primary-light: #dbeafe;
  
  /* Coherence colors */
  --color-high-coherence: #10b981;
  --color-medium-coherence: #f59e0b;
  --color-low-coherence: #ef4444;
  --color-no-coherence: #6b7280;
  
  /* Background colors */
  --bg-primary: #ffffff;
  --bg-secondary: #f8fafc;
  --bg-tertiary: #f1f5f9;
  
  /* Text colors */
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #64748b;
}

[data-theme="dark"] {
  --bg-primary: #0f172a;
  --bg-secondary: #1e293b;
  --bg-tertiary: #334155;
  --text-primary: #f8fafc;
  --text-secondary: #cbd5e1;
  --text-muted: #94a3b8;
}
```

### Custom Component Styling

```typescript
// Styled component system
const StyledCard = styled.div<{ variant: 'primary' | 'secondary' }>`
  background: var(--bg-${props => props.variant});
  border-radius: 8px;
  padding: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  
  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
`;
```

---

The ECNE Dashboard provides a powerful, intuitive interface for monitoring and analyzing data streams through the lens of coherence theory, making complex data patterns accessible and actionable.