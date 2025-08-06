import * as fs from 'fs';
import * as path from 'path';
import { APISource } from '../types';

interface ParsedAPI {
  name: string;
  url: string;
  description: string;
  auth: string;
  https: boolean;
  cors: string;
  category: string;
}

export class PublicAPIParser {
  private apis: ParsedAPI[] = [];

  async parseMarkdown(filePath: string): Promise<ParsedAPI[]> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    let currentCategory = '';
    let inTable = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Detect category headers
      if (line.startsWith('### ')) {
        currentCategory = line.substring(4).trim();
        inTable = false;
        continue;
      }
      
      // Skip table headers and separators
      if (line.includes('| :---') || line.includes('| API |')) {
        inTable = true;
        continue;
      }
      
      // Parse table rows
      if (inTable && line.startsWith('|') && line.endsWith('|')) {
        const cells = line.split('|').map(cell => cell.trim()).filter(cell => cell);
        
        if (cells.length >= 5) {
          // Extract API info from markdown links
          const nameMatch = cells[0].match(/\[([^\]]+)\]\(([^)]+)\)/);
          if (nameMatch) {
            this.apis.push({
              name: nameMatch[1],
              url: nameMatch[2],
              description: cells[1],
              auth: cells[2].replace(/`/g, ''),
              https: cells[3] === 'Yes',
              cors: cells[4],
              category: currentCategory
            });
          }
        }
      }
      
      // End table when we hit the back to index link
      if (line.includes('**[⬆ Back to Index](#index)**')) {
        inTable = false;
      }
    }
    
    return this.apis;
  }

  // Convert parsed APIs to ECNE APISource format
  convertToAPISources(apis: ParsedAPI[], options?: {
    filterByAuth?: boolean;
    filterByHttps?: boolean;
    filterByCors?: boolean;
    categories?: string[];
    limit?: number;
  }): APISource[] {
    let filtered = apis;
    
    // Apply filters
    if (options?.filterByAuth) {
      filtered = filtered.filter(api => api.auth === 'No');
    }
    
    if (options?.filterByHttps) {
      filtered = filtered.filter(api => api.https);
    }
    
    if (options?.filterByCors) {
      filtered = filtered.filter(api => api.cors === 'Yes');
    }
    
    if (options?.categories && options.categories.length > 0) {
      filtered = filtered.filter(api => options.categories!.includes(api.category));
    }
    
    // Apply limit
    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }
    
    // Convert to APISource format
    return filtered.map(api => ({
      id: `${api.category.toLowerCase().replace(/\s+/g, '-')}-${api.name.toLowerCase().replace(/\s+/g, '-')}`,
      name: api.name,
      baseUrl: this.extractBaseUrl(api.url),
      endpoints: [{
        path: '/',
        method: 'GET' as const,
        refreshInterval: 300 // 5 minutes default
      }],
      rateLimits: {
        requestsPerMinute: 10, // Conservative default
        requestsPerHour: 100
      },
      metadata: {
        category: api.category,
        description: api.description,
        auth: api.auth,
        https: api.https,
        cors: api.cors,
        originalUrl: api.url
      }
    }));
  }

  private extractBaseUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // For documentation URLs, try to extract the API base URL
      if (parsed.hostname.includes('github.com') || parsed.pathname.includes('docs')) {
        // This is likely documentation, not the actual API endpoint
        return url; // Keep original for now, will need manual configuration
      }
      return `${parsed.protocol}//${parsed.hostname}`;
    } catch {
      return url;
    }
  }

  // Get categories and their API counts
  getCategories(): Map<string, number> {
    const categories = new Map<string, number>();
    this.apis.forEach(api => {
      categories.set(api.category, (categories.get(api.category) || 0) + 1);
    });
    return categories;
  }

  // Get APIs that don't require authentication
  getFreeAPIs(): ParsedAPI[] {
    return this.apis.filter(api => api.auth === 'No');
  }

  // Get APIs with CORS support
  getCORSEnabledAPIs(): ParsedAPI[] {
    return this.apis.filter(api => api.cors === 'Yes');
  }
}