import { z } from 'zod';
import { ValidationError } from '../types';

export interface ValidationResult {
  success: boolean;
  data?: any;
  errors?: string[];
}

export interface Validator {
  validate(data: unknown): Promise<ValidationResult>;
}

export class ValidationPipeline {
  private validators: Map<string, Validator> = new Map();
  private sanitizers: Map<string, (data: any) => any> = new Map();
  
  constructor() {
    this.registerDefaultValidators();
    this.registerDefaultSanitizers();
  }
  
  private registerDefaultValidators(): void {
    this.validators.set('api-response', new APIResponseValidator());
    this.validators.set('user-input', new UserInputValidator());
    this.validators.set('data-point', new DataPointValidator());
    this.validators.set('filter-config', new FilterConfigValidator());
    this.validators.set('api-source', new APISourceValidator());
  }
  
  private registerDefaultSanitizers(): void {
    // HTML/Script sanitization
    this.sanitizers.set('html', (data: string) => {
      return data
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    });
    
    // SQL injection prevention
    this.sanitizers.set('sql', (data: string) => {
      return data
        .replace(/['";\\]/g, '')
        .replace(/--/g, '')
        .replace(/\/\*/g, '')
        .replace(/\*\//g, '');
    });
    
    // Path traversal prevention
    this.sanitizers.set('path', (data: string) => {
      return data
        .replace(/\.\./g, '')
        .replace(/[\\\/]/g, '_')
        .replace(/^\./, '');
    });
  }
  
  async validate<T>(type: string, data: unknown): Promise<T> {
    const validator = this.validators.get(type);
    if (!validator) {
      throw new ValidationError(`No validator for type: ${type}`);
    }
    
    // Apply sanitization first if applicable
    const sanitized = this.sanitize(type, data);
    
    const result = await validator.validate(sanitized);
    if (!result.success) {
      throw new ValidationError(
        `Validation failed for ${type}`,
        result.errors
      );
    }
    
    return result.data as T;
  }
  
  registerValidator(type: string, validator: Validator): void {
    this.validators.set(type, validator);
  }
  
  registerSanitizer(type: string, sanitizer: (data: any) => any): void {
    this.sanitizers.set(type, sanitizer);
  }
  
  private sanitize(type: string, data: any): any {
    // Apply general sanitization based on type
    if (typeof data === 'string') {
      let sanitized = data;
      
      // Always apply basic sanitization
      sanitized = this.sanitizers.get('html')!(sanitized);
      
      // Apply type-specific sanitization
      const typeSanitizer = this.sanitizers.get(type);
      if (typeSanitizer) {
        sanitized = typeSanitizer(sanitized);
      }
      
      return sanitized;
    }
    
    // Recursively sanitize objects
    if (typeof data === 'object' && data !== null) {
      if (Array.isArray(data)) {
        return data.map(item => this.sanitize(type, item));
      }
      
      const sanitized: any = {};
      for (const [key, value] of Object.entries(data)) {
        sanitized[key] = this.sanitize(type, value);
      }
      return sanitized;
    }
    
    return data;
  }
}

// Specific Validators

export class DataPointValidator implements Validator {
  private schema = z.object({
    id: z.string().uuid().or(z.string().min(1).max(255)),
    source: z.string().min(1).max(100),
    timestamp: z.date().or(z.string().transform(str => new Date(str))),
    content: z.any().refine(this.validateContent.bind(this)),
    metadata: z.object({
      apiVersion: z.string().optional(),
      rateLimit: z.number().optional(),
      contentType: z.string().optional()
    }).passthrough().optional()
  });
  
  private validateContent(content: any): boolean {
    if (content === null || content === undefined) {
      return false;
    }
    
    const str = JSON.stringify(content);
    
    // Check for injection patterns
    const injectionPatterns = [
      /\$where/i,
      /\$gt|\$lt|\$gte|\$lte|\$ne|\$in|\$nin/i, // MongoDB operators
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /eval\s*\(/i,
      /setTimeout|setInterval/i
    ];
    
    return !injectionPatterns.some(pattern => pattern.test(str));
  }
  
  async validate(data: unknown): Promise<ValidationResult> {
    try {
      const validated = await this.schema.parseAsync(data);
      return { success: true, data: validated };
    } catch (error) {
      return {
        success: false,
        errors: error instanceof z.ZodError
          ? error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
          : ['Validation failed']
      };
    }
  }
}

export class APIResponseValidator implements Validator {
  private schema = z.object({
    status: z.number().optional(),
    data: z.any(),
    headers: z.record(z.string()).optional(),
    error: z.object({
      message: z.string(),
      code: z.string().optional()
    }).optional()
  }).passthrough();
  
  async validate(data: unknown): Promise<ValidationResult> {
    try {
      // Basic structure validation
      const validated = await this.schema.parseAsync(data);
      
      // Additional security checks
      if (validated.data) {
        const dataStr = JSON.stringify(validated.data);
        
        // Check for excessively large responses
        if (dataStr.length > 10 * 1024 * 1024) { // 10MB limit
          return {
            success: false,
            errors: ['Response data exceeds size limit']
          };
        }
        
        // Check for suspicious patterns
        if (this.containsSuspiciousPatterns(dataStr)) {
          return {
            success: false,
            errors: ['Response contains suspicious patterns']
          };
        }
      }
      
      return { success: true, data: validated };
    } catch (error) {
      return {
        success: false,
        errors: error instanceof z.ZodError
          ? error.errors.map(e => e.message)
          : ['API response validation failed']
      };
    }
  }
  
  private containsSuspiciousPatterns(data: string): boolean {
    const patterns = [
      /\x00/, // Null bytes
      /[\x01-\x08\x0B\x0C\x0E-\x1F]/, // Control characters
      /__proto__/,
      /constructor\s*\[/,
      /Function\s*\(/
    ];
    
    return patterns.some(pattern => pattern.test(data));
  }
}

export class UserInputValidator implements Validator {
  private schema = z.object({
    sensitivity: z.number().min(0).max(1).optional(),
    weights: z.object({
      psi: z.number().min(0).max(1),
      rho: z.number().min(0).max(1),
      q: z.number().min(0).max(1),
      f: z.number().min(0).max(1)
    }).refine(weights => {
      const sum = weights.psi + weights.rho + weights.q + weights.f;
      return Math.abs(sum - 1) < 0.001; // Allow small floating point errors
    }, 'Weights must sum to 1').optional(),
    timeframe: z.number().min(1).max(10080).optional(), // Max 1 week in minutes
    sources: z.array(z.string().max(100)).max(100).optional()
  }).strict();
  
  async validate(data: unknown): Promise<ValidationResult> {
    try {
      const validated = await this.schema.parseAsync(data);
      return { success: true, data: validated };
    } catch (error) {
      return {
        success: false,
        errors: error instanceof z.ZodError
          ? error.errors.map(e => e.message)
          : ['User input validation failed']
      };
    }
  }
}

export class FilterConfigValidator implements Validator {
  private schema = z.object({
    sensitivity: z.number().min(0).max(1),
    weights: z.object({
      psi: z.number().min(0).max(1),
      rho: z.number().min(0).max(1),
      q: z.number().min(0).max(1),
      f: z.number().min(0).max(1)
    }),
    contextWindowSize: z.number().min(10).max(1000).optional(),
    patternHistorySize: z.number().min(100).max(10000).optional(),
    enableAnomalyDetection: z.boolean().optional(),
    enablePrediction: z.boolean().optional(),
    enableOptimization: z.boolean().optional()
  });
  
  async validate(data: unknown): Promise<ValidationResult> {
    try {
      const validated = await this.schema.parseAsync(data);
      
      // Validate weights sum to 1
      const sum = Object.values(validated.weights).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 1) > 0.001) {
        return {
          success: false,
          errors: ['Filter weights must sum to 1']
        };
      }
      
      return { success: true, data: validated };
    } catch (error) {
      return {
        success: false,
        errors: error instanceof z.ZodError
          ? error.errors.map(e => e.message)
          : ['Filter config validation failed']
      };
    }
  }
}

export class APISourceValidator implements Validator {
  private schema = z.object({
    id: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
    name: z.string().min(1).max(200),
    baseUrl: z.string().url(),
    endpoints: z.array(z.object({
      path: z.string().min(1).max(500),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
      headers: z.record(z.string()).optional(),
      params: z.record(z.any()).optional(),
      refreshInterval: z.number().min(10).max(86400).optional(), // 10s to 24h
      timeout: z.number().min(1000).max(300000).optional() // 1s to 5min
    })).min(1).max(50),
    authentication: z.object({
      type: z.enum(['api-key', 'bearer', 'oauth2', 'basic']),
      apiKey: z.string().optional(),
      token: z.string().optional(),
      headerName: z.string().optional()
    }).optional(),
    rateLimits: z.object({
      requestsPerMinute: z.number().min(1).max(1000),
      requestsPerHour: z.number().min(1).max(10000)
    }).optional()
  });
  
  async validate(data: unknown): Promise<ValidationResult> {
    try {
      const validated = await this.schema.parseAsync(data);
      
      // Additional URL validation
      const url = new URL(validated.baseUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return {
          success: false,
          errors: ['Only HTTP and HTTPS protocols are allowed']
        };
      }
      
      // Validate rate limits consistency
      if (validated.rateLimits) {
        const { requestsPerMinute, requestsPerHour } = validated.rateLimits;
        if (requestsPerMinute * 60 > requestsPerHour) {
          return {
            success: false,
            errors: ['Rate limits are inconsistent: per-minute rate exceeds hourly limit']
          };
        }
      }
      
      return { success: true, data: validated };
    } catch (error) {
      return {
        success: false,
        errors: error instanceof z.ZodError
          ? error.errors.map(e => e.message)
          : ['API source validation failed']
      };
    }
  }
}