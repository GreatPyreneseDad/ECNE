# ECNE Data River Agent 🌊

## Enhanced Coherence Network Engine

ECNE (Enhanced Coherence Network Engine) is an intelligent data collection and filtering system that uses **Grounded Coherence Theory (GCT)** to identify and analyze relevant information from multiple API data streams in real-time.

![ECNE Dashboard](https://img.shields.io/badge/Dashboard-Live-brightgreen)
![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## 🚀 Key Features

### 🧠 Intelligent Filtering
- **4-Dimensional Coherence Analysis** using GCT principles
- **Real-time Pattern Recognition** with machine learning
- **Anomaly Detection** with statistical analysis
- **Auto-tuning Weights** based on user feedback

### 📊 Advanced Analytics
- **Predictive Modeling** for future coherence trends
- **Pattern Clustering** with K-means algorithm
- **A/B Testing Framework** for filter optimization
- **Performance Metrics** and optimization suggestions

### 🎨 Modern Dashboard
- **Real-time Visualizations** with D3.js
- **Interactive Heatmaps** and network graphs
- **Responsive Design** with dark/light themes
- **Export Capabilities** (CSV, JSON, PDF reports)

### 🔌 Multi-API Integration
- **Public API Catalog** integration (850+ APIs)
- **Rate Limiting** and retry logic
- **Concurrent Processing** with queue management
- **Graceful Degradation** for service failures

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ECNE Data River Agent                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐     ┌──────────────┐    ┌──────────────┐ │
│  │ API Sources  │────▶│  Coherence   │───▶│   Storage    │ │
│  │              │     │   Filter     │    │              │ │
│  └──────────────┘     └──────────────┘    └──────────────┘ │
│         │                    │                     │        │
│         ▼                    ▼                     ▼        │
│  ┌──────────────┐     ┌──────────────┐    ┌──────────────┐ │
│  │ Data Stream  │     │  ML Analytics│    │  Dashboard   │ │
│  │  Collector   │     │   Engine     │    │ Visualizer   │ │
│  └──────────────┘     └──────────────┘    └──────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
ECNE-DataRiver/
├── 📋 README.md                 # Main documentation
├── ⚙️ SETUP.md                  # Setup and installation guide
├── 🔧 package.json              # Node.js dependencies
├── 📊 src/                      # Source code
│   ├── 🧠 core/                 # Core filtering logic
│   ├── 📈 analytics/            # ML and analytics modules
│   ├── 🗄️ storage/              # Database services
│   ├── 🌐 dashboard/            # Web dashboard
│   ├── 🔌 collectors/           # API data collectors
│   └── 🛠️ utils/                # Utility functions
├── 🧪 tests/                    # Test suites and mocks
├── 📊 public/                   # Dashboard frontend
├── 📖 docs/                     # Detailed documentation
├── 🎯 examples/                 # Usage examples
└── 🗃️ prisma/                  # Database schema
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+ (optional - uses mocks by default)

### Installation

```bash
# Clone repository
git clone https://github.com/GreatPyreneseDad/ECNE.git
cd ECNE

# Install dependencies
npm install

# Run the quick start example
npm run example
```

### Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit configuration
nano .env
```

### Launch Dashboard

```bash
# Start in development mode
npm run dev

# Access dashboard
open http://localhost:3000
```

## 📊 Coherence Dimensions

ECNE analyzes data using four key dimensions from Grounded Coherence Theory:

| Dimension | Symbol | Description | Weight |
|-----------|--------|-------------|---------|
| **Internal Consistency** | Ψ (Psi) | How well data aligns with recent patterns | 25% |
| **Accumulated Wisdom** | ρ (Rho) | Historical relevance and pattern matching | 25% |
| **Moral Activation** | q (Q) | Ethical and value-based relevance | 25% |
| **Social Belonging** | f (F) | Community and relationship patterns | 25% |

## 📈 Machine Learning Features

### Anomaly Detection
- **Statistical Analysis**: Z-score based outlier detection
- **Multi-dimensional**: Separate analysis for each coherence dimension
- **Real-time Alerts**: Instant notifications for unusual patterns

### Pattern Prediction
- **Exponential Smoothing**: Short-term coherence forecasting
- **Linear Regression**: Trend analysis and prediction
- **Ensemble Methods**: Combined predictions for higher accuracy

### Auto-tuning
- **Gradient Descent**: Optimize weights based on user feedback
- **Performance Metrics**: Accuracy, precision, recall, F1-score
- **A/B Testing**: Compare filter configurations

## 🎨 Dashboard Features

### Real-time Visualizations
- **Coherence Heatmaps**: Pattern intensity over time
- **Network Graphs**: Relationships between data sources
- **Flow Animation**: Visual representation of data stream
- **Sparklines**: Trend indicators for each metric

### Interactive Controls
- **Filter Presets**: Quick configuration templates
- **Drag & Drop**: Rearrange dashboard widgets
- **Keyboard Shortcuts**: ⌘K (search), ⌘E (export), ⌘/ (help)
- **Theme Toggle**: Dark/light mode switching

### Export & Reporting
- **CSV Export**: Raw data for analysis
- **JSON Export**: Structured data format
- **PDF Reports**: Professional summary documents
- **Real-time Sharing**: WebSocket-based collaboration

## 🔗 API Integration

ECNE integrates with 850+ public APIs across categories:

- **News**: Real-time news analysis
- **Social Media**: Community pattern detection
- **Finance**: Market coherence tracking
- **Weather**: Environmental data streams
- **Government**: Public data sources

## 📖 Documentation

Comprehensive guides available in the `/docs` folder:

- [🏗️ **Architecture Guide**](docs/ARCHITECTURE.md) - System design and components
- [🧠 **Coherence Theory**](docs/COHERENCE.md) - GCT principles and implementation
- [📈 **Analytics Guide**](docs/ANALYTICS.md) - ML features and algorithms
- [🎨 **Dashboard Guide**](docs/DASHBOARD.md) - UI features and customization
- [🔌 **API Integration**](docs/API-INTEGRATION.md) - Adding custom data sources
- [🚀 **Deployment**](docs/DEPLOYMENT.md) - Production setup guide

## 🧪 Examples

### Basic Usage
```typescript
import { EnhancedCoherenceFilter } from './src/core/enhanced-filter';

const filter = new EnhancedCoherenceFilter({
  sensitivity: 0.5,
  enableAnomalyDetection: true,
  enablePrediction: true
});

const result = await filter.filter(dataPoint);
if (result) {
  console.log(`Coherence: ${result.coherenceScore}`);
}
```

### Custom API Source
```typescript
const customSource = {
  id: 'my-api',
  name: 'My Custom API',
  baseUrl: 'https://api.example.com',
  endpoints: [{
    path: '/data',
    method: 'GET',
    refreshInterval: 300
  }]
};

ecne.addSource(customSource);
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙋‍♂️ Support

- **Documentation**: Check the `/docs` folder
- **Issues**: GitHub Issues tab
- **Discussions**: GitHub Discussions
- **Email**: support@ecne-datariver.com

## 🎯 Roadmap

- [ ] **v1.1**: GraphQL API support
- [ ] **v1.2**: Real-time collaboration features
- [ ] **v1.3**: Advanced ML models (LLM integration)
- [ ] **v1.4**: Mobile dashboard app
- [ ] **v2.0**: Distributed processing cluster

---

**Built with ❤️ using Grounded Coherence Theory**

*ECNE transforms chaotic data streams into coherent insights, helping you find signal in the noise.*