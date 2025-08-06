export { ValidationPipeline, ValidationResult, Validator } from './validation-pipeline';
export {
  DataPointValidator,
  APIResponseValidator,
  UserInputValidator,
  FilterConfigValidator,
  APISourceValidator
} from './validation-pipeline';

export {
  RateLimiter,
  RateLimit,
  RateLimitConfig,
  RateLimitExceededError,
  createRateLimitMiddleware
} from './rate-limiter';

// Security utilities
export function sanitizeString(str: string): string {
  return str
    .replace(/[<>]/g, '') // Remove HTML brackets
    .replace(/['"]/g, '') // Remove quotes
    .replace(/[\\\/]/g, '') // Remove slashes
    .trim();
}

export function isValidURL(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function maskSensitiveData(data: any, fieldsToMask: string[] = ['password', 'apiKey', 'token', 'secret']): any {
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  
  if (Array.isArray(data)) {
    return data.map(item => maskSensitiveData(item, fieldsToMask));
  }
  
  const masked: any = {};
  
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    
    if (fieldsToMask.some(field => lowerKey.includes(field.toLowerCase()))) {
      masked[key] = '***MASKED***';
    } else if (typeof value === 'object') {
      masked[key] = maskSensitiveData(value, fieldsToMask);
    } else {
      masked[key] = value;
    }
  }
  
  return masked;
}

export class SecurityLogger {
  private static instance: SecurityLogger;
  private events: SecurityEvent[] = [];
  private maxEvents = 10000;
  
  private constructor() {}
  
  static getInstance(): SecurityLogger {
    if (!this.instance) {
      this.instance = new SecurityLogger();
    }
    return this.instance;
  }
  
  logEvent(event: SecurityEvent): void {
    this.events.push({
      ...event,
      timestamp: new Date()
    });
    
    // Rotate old events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
    
    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[SECURITY] ${event.type}: ${event.message}`, event.data);
    }
  }
  
  getEvents(filter?: {
    type?: string;
    level?: 'info' | 'warning' | 'error';
    since?: Date;
  }): SecurityEvent[] {
    let filtered = [...this.events];
    
    if (filter?.type) {
      filtered = filtered.filter(e => e.type === filter.type);
    }
    
    if (filter?.level) {
      filtered = filtered.filter(e => e.level === filter.level);
    }
    
    if (filter?.since) {
      filtered = filtered.filter(e => e.timestamp > filter.since);
    }
    
    return filtered;
  }
  
  clear(): void {
    this.events = [];
  }
}

export interface SecurityEvent {
  type: 'validation' | 'rate-limit' | 'authentication' | 'authorization' | 'suspicious-activity';
  level: 'info' | 'warning' | 'error';
  message: string;
  data?: any;
  timestamp: Date;
  source?: string;
}