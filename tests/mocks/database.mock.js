"use strict";
/**
 * Mock Database Service
 * Provides in-memory database functionality for testing
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockDatabaseService = void 0;
class MockDatabaseService {
    constructor() {
        this.dataPoints = new Map();
        this.patterns = new Map();
        this.sources = new Map();
        this.connected = false;
    }
    async connect() {
        console.log('[MockDB] Connecting to in-memory database...');
        this.connected = true;
        // Simulate connection delay
        await new Promise(resolve => setTimeout(resolve, 100));
        console.log('[MockDB] Connected successfully');
    }
    async disconnect() {
        console.log('[MockDB] Disconnecting from in-memory database...');
        this.connected = false;
        this.dataPoints.clear();
        this.patterns.clear();
        this.sources.clear();
    }
    async storeDataPoint(dataPoint) {
        if (!this.connected) {
            throw new Error('Database not connected');
        }
        const record = {
            id: `mock-${Date.now()}-${Math.random()}`,
            externalId: dataPoint.id,
            source: dataPoint.source,
            timestamp: dataPoint.timestamp,
            content: dataPoint.content,
            metadata: dataPoint.metadata || {},
            coherenceScore: dataPoint.coherenceScore,
            coherencePsi: dataPoint.coherenceDimensions.psi,
            coherenceRho: dataPoint.coherenceDimensions.rho,
            coherenceQ: dataPoint.coherenceDimensions.q,
            coherenceF: dataPoint.coherenceDimensions.f,
            relevanceReasons: dataPoint.relevanceReason,
            createdAt: new Date()
        };
        this.dataPoints.set(record.id, record);
        console.log(`[MockDB] Stored data point: ${record.id} (coherence: ${dataPoint.coherenceScore.toFixed(2)})`);
    }
    async queryDataPoints(params) {
        if (!this.connected) {
            throw new Error('Database not connected');
        }
        let results = Array.from(this.dataPoints.values());
        // Apply filters
        if (params.startTime) {
            results = results.filter(dp => dp.timestamp >= params.startTime);
        }
        if (params.endTime) {
            results = results.filter(dp => dp.timestamp <= params.endTime);
        }
        if (params.sources && params.sources.length > 0) {
            results = results.filter(dp => params.sources.includes(dp.source));
        }
        if (params.minCoherence !== undefined) {
            results = results.filter(dp => dp.coherenceScore >= params.minCoherence);
        }
        // Sort by timestamp desc
        results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        // Apply pagination
        const start = params.offset || 0;
        const end = start + (params.limit || 100);
        results = results.slice(start, end);
        // Map to FilteredDataPoint format
        return results.map(record => ({
            id: record.externalId,
            source: record.source,
            timestamp: record.timestamp,
            content: record.content,
            metadata: record.metadata,
            coherenceScore: record.coherenceScore,
            coherenceDimensions: {
                psi: record.coherencePsi,
                rho: record.coherenceRho,
                q: record.coherenceQ,
                f: record.coherenceF
            },
            relevanceReason: record.relevanceReasons
        }));
    }
    async getCoherenceStatistics(params) {
        if (!this.connected) {
            throw new Error('Database not connected');
        }
        // Mock aggregated statistics
        const sources = params.sources || ['MockSource1', 'MockSource2'];
        return sources.map(source => ({
            source,
            _count: Math.floor(Math.random() * 100),
            _avg: {
                coherenceScore: 0.5 + Math.random() * 0.3,
                coherencePsi: 0.4 + Math.random() * 0.3,
                coherenceRho: 0.5 + Math.random() * 0.3,
                coherenceQ: 0.3 + Math.random() * 0.3,
                coherenceF: 0.6 + Math.random() * 0.3
            }
        }));
    }
    async getTopPatterns(params) {
        if (!this.connected) {
            throw new Error('Database not connected');
        }
        // Mock pattern data
        const patterns = [];
        const limit = params.limit || 10;
        for (let i = 0; i < limit; i++) {
            patterns.push({
                source: `MockSource${i % 3 + 1}`,
                coherenceScore: 0.9 - (i * 0.05),
                relevanceReasons: ['High consistency with recent data', 'Matches historical patterns']
            });
        }
        return patterns;
    }
    async getSourcesSummary() {
        if (!this.connected) {
            throw new Error('Database not connected');
        }
        // Count data points by source
        const sourceCounts = new Map();
        const sourceScores = new Map();
        for (const dp of this.dataPoints.values()) {
            const count = sourceCounts.get(dp.source) || 0;
            sourceCounts.set(dp.source, count + 1);
            const scores = sourceScores.get(dp.source) || [];
            scores.push(dp.coherenceScore);
            sourceScores.set(dp.source, scores);
        }
        // Build summary
        const summary = [];
        for (const [source, count] of sourceCounts.entries()) {
            const scores = sourceScores.get(source) || [];
            const avgScore = scores.length > 0
                ? scores.reduce((a, b) => a + b, 0) / scores.length
                : 0;
            summary.push({
                source,
                _count: count,
                _avg: { coherenceScore: avgScore }
            });
        }
        // Sort by count desc
        summary.sort((a, b) => b._count - a._count);
        return summary;
    }
    // Helper method for tests
    getDataPointCount() {
        return this.dataPoints.size;
    }
    // Helper method for tests
    clearData() {
        this.dataPoints.clear();
        this.patterns.clear();
        this.sources.clear();
    }
}
exports.MockDatabaseService = MockDatabaseService;
