/**
 * ECNE Plugin Manager
 * Manages loading, lifecycle, and execution of plugins
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  Plugin,
  PluginContext,
  PluginManifest,
  CoherenceDimensionPlugin,
  DataExtractorPlugin,
  VisualizationPlugin,
  FilterEnhancementPlugin,
  isCoherenceDimensionPlugin,
  isDataExtractorPlugin,
  isVisualizationPlugin,
  isFilterEnhancementPlugin
} from './plugin-interface';
import { DataPoint, FilteredDataPoint, CoherenceDimensions } from '../core/coherence-filter';
import winston from 'winston';

export interface PluginManagerConfig {
  pluginsDir: string;
  autoLoad: boolean;
  sandboxed: boolean;
}

export class PluginManager extends EventEmitter {
  private plugins: Map<string, Plugin> = new Map();
  private coherenceDimensions: Map<string, CoherenceDimensionPlugin> = new Map();
  private dataExtractors: Map<string, DataExtractorPlugin> = new Map();
  private visualizations: Map<string, VisualizationPlugin> = new Map();
  private filterEnhancements: FilterEnhancementPlugin[] = [];
  private logger: winston.Logger;
  private contextBuffer: DataPoint[] = [];
  private patternHistory: Map<string, number> = new Map();

  constructor(private config: PluginManagerConfig) {
    super();
    
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.simple()
        }),
        new winston.transports.File({ filename: 'plugins.log' })
      ]
    });
  }

  /**
   * Initialize plugin manager
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing plugin manager');
    
    if (this.config.autoLoad) {
      await this.loadPluginsFromDirectory();
    }
    
    this.emit('initialized');
  }

  /**
   * Load plugins from directory
   */
  private async loadPluginsFromDirectory(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.pluginsDir);
      
      for (const file of files) {
        if (file.endsWith('.plugin.js') || file.endsWith('.plugin.ts')) {
          const pluginPath = path.join(this.config.pluginsDir, file);
          await this.loadPlugin(pluginPath);
        }
      }
    } catch (error) {
      this.logger.error('Failed to load plugins from directory', error);
    }
  }

  /**
   * Load a plugin from file
   */
  async loadPlugin(pluginPath: string): Promise<void> {
    try {
      this.logger.info(`Loading plugin from ${pluginPath}`);
      
      // Dynamic import
      const pluginModule = await import(pluginPath);
      const manifest: PluginManifest = pluginModule.default || pluginModule;
      
      if (!manifest.plugins || !Array.isArray(manifest.plugins)) {
        throw new Error('Invalid plugin manifest');
      }
      
      for (const plugin of manifest.plugins) {
        await this.registerPlugin(plugin);
      }
      
    } catch (error) {
      this.logger.error(`Failed to load plugin ${pluginPath}`, error);
      this.emit('plugin-error', { path: pluginPath, error });
    }
  }

  /**
   * Register a plugin
   */
  async registerPlugin(plugin: Plugin): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin ${plugin.name} already registered`);
    }
    
    this.logger.info(`Registering plugin: ${plugin.name} v${plugin.version}`);
    this.plugins.set(plugin.name, plugin);
    
    // Register by type
    if (isCoherenceDimensionPlugin(plugin)) {
      this.coherenceDimensions.set(plugin.dimensionKey, plugin);
    } else if (isDataExtractorPlugin(plugin)) {
      this.dataExtractors.set(plugin.sourceType, plugin);
    } else if (isVisualizationPlugin(plugin)) {
      this.visualizations.set(plugin.componentName, plugin);
    } else if (isFilterEnhancementPlugin(plugin)) {
      this.filterEnhancements.push(plugin);
    }
    
    // Call onLoad lifecycle hook
    const context = this.createPluginContext(plugin);
    if ('onLoad' in plugin && plugin.onLoad) {
      await plugin.onLoad(context);
    }
    
    if (plugin.enabled && 'onEnable' in plugin && plugin.onEnable) {
      await plugin.onEnable(context);
    }
    
    this.emit('plugin-registered', plugin);
  }

  /**
   * Unregister a plugin
   */
  async unregisterPlugin(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin ${pluginName} not found`);
    }
    
    this.logger.info(`Unregistering plugin: ${pluginName}`);
    
    // Call lifecycle hooks
    const context = this.createPluginContext(plugin);
    if ('onDisable' in plugin && plugin.onDisable) {
      await plugin.onDisable(context);
    }
    if ('onUnload' in plugin && plugin.onUnload) {
      await plugin.onUnload(context);
    }
    
    // Remove from registries
    this.plugins.delete(pluginName);
    
    if (isCoherenceDimensionPlugin(plugin)) {
      this.coherenceDimensions.delete(plugin.dimensionKey);
    } else if (isDataExtractorPlugin(plugin)) {
      this.dataExtractors.delete(plugin.sourceType);
    } else if (isVisualizationPlugin(plugin)) {
      this.visualizations.delete(plugin.componentName);
    } else if (isFilterEnhancementPlugin(plugin)) {
      this.filterEnhancements = this.filterEnhancements.filter(p => p.name !== pluginName);
    }
    
    this.emit('plugin-unregistered', pluginName);
  }

  /**
   * Enable/disable a plugin
   */
  async setPluginEnabled(pluginName: string, enabled: boolean): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin ${pluginName} not found`);
    }
    
    if (plugin.enabled === enabled) {
      return;
    }
    
    plugin.enabled = enabled;
    const context = this.createPluginContext(plugin);
    
    if (enabled && 'onEnable' in plugin && plugin.onEnable) {
      await plugin.onEnable(context);
    } else if (!enabled && 'onDisable' in plugin && plugin.onDisable) {
      await plugin.onDisable(context);
    }
    
    this.emit('plugin-status-changed', { plugin: pluginName, enabled });
  }

  /**
   * Get all custom coherence dimensions
   */
  getCustomDimensions(): Map<string, CoherenceDimensionPlugin> {
    const enabled = new Map<string, CoherenceDimensionPlugin>();
    for (const [key, plugin] of this.coherenceDimensions) {
      if (plugin.enabled) {
        enabled.set(key, plugin);
      }
    }
    return enabled;
  }

  /**
   * Calculate custom coherence dimensions
   */
  async calculateCustomDimensions(dataPoint: DataPoint): Promise<Record<string, number>> {
    const customDimensions: Record<string, number> = {};
    
    for (const [key, plugin] of this.coherenceDimensions) {
      if (!plugin.enabled) continue;
      
      try {
        const context = this.createPluginContext(plugin);
        const value = await plugin.calculate(dataPoint, context);
        customDimensions[key] = Math.max(0, Math.min(1, value)); // Ensure 0-1 range
      } catch (error) {
        this.logger.error(`Error in dimension plugin ${plugin.name}:`, error);
        customDimensions[key] = 0;
      }
    }
    
    return customDimensions;
  }

  /**
   * Get data extractor for source type
   */
  getDataExtractor(sourceType: string): DataExtractorPlugin | undefined {
    const extractor = this.dataExtractors.get(sourceType);
    return extractor?.enabled ? extractor : undefined;
  }

  /**
   * Get visualization plugins
   */
  getVisualizations(): VisualizationPlugin[] {
    return Array.from(this.visualizations.values()).filter(v => v.enabled);
  }

  /**
   * Apply filter enhancements
   */
  async applyPreProcessing(dataPoint: DataPoint): Promise<DataPoint> {
    let processed = dataPoint;
    
    for (const plugin of this.filterEnhancements) {
      if (!plugin.enabled || !plugin.preProcess) continue;
      
      try {
        processed = await plugin.preProcess(processed);
      } catch (error) {
        this.logger.error(`Error in pre-process plugin ${plugin.name}:`, error);
      }
    }
    
    return processed;
  }

  /**
   * Apply post-processing to filtered data
   */
  async applyPostProcessing(dataPoint: FilteredDataPoint): Promise<FilteredDataPoint> {
    let processed = dataPoint;
    
    for (const plugin of this.filterEnhancements) {
      if (!plugin.enabled || !plugin.postProcess) continue;
      
      try {
        processed = await plugin.postProcess(processed);
      } catch (error) {
        this.logger.error(`Error in post-process plugin ${plugin.name}:`, error);
      }
    }
    
    return processed;
  }

  /**
   * Enhance coherence calculation
   */
  async enhanceCoherence(
    dimensions: CoherenceDimensions, 
    dataPoint: DataPoint
  ): Promise<CoherenceDimensions> {
    let enhanced = dimensions;
    
    for (const plugin of this.filterEnhancements) {
      if (!plugin.enabled || !plugin.enhanceCoherence) continue;
      
      try {
        enhanced = await plugin.enhanceCoherence(enhanced, dataPoint);
      } catch (error) {
        this.logger.error(`Error in coherence enhancement plugin ${plugin.name}:`, error);
      }
    }
    
    return enhanced;
  }

  /**
   * Create plugin context
   */
  private createPluginContext(plugin: Plugin): PluginContext {
    return {
      getRecentDataPoints: (count: number) => {
        return this.contextBuffer.slice(-count);
      },
      
      getPatternHistory: (pattern: string) => {
        return this.patternHistory.get(pattern) || 0;
      },
      
      getConfig: () => {
        return this.config;
      },
      
      log: (level, message, data) => {
        this.logger.log(level, `[${plugin.name}] ${message}`, data);
      },
      
      recordMetric: (name, value, tags) => {
        this.emit('metric', { plugin: plugin.name, name, value, tags });
      }
    };
  }

  /**
   * Update context buffer (called by main system)
   */
  updateContext(dataPoint: DataPoint): void {
    this.contextBuffer.push(dataPoint);
    if (this.contextBuffer.length > 1000) {
      this.contextBuffer.shift();
    }
  }

  /**
   * Update pattern history (called by main system)
   */
  updatePatternHistory(pattern: string, count: number): void {
    this.patternHistory.set(pattern, count);
  }

  /**
   * Get plugin list
   */
  getPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugin by name
   */
  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }
}