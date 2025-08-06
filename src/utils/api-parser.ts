/**
 * Parser for public-api-lists README
 * Extracts API information and converts to ECNE sources
 */

import { readFileSync } from 'fs';
import { APISource, APIEndpoint } from '../collectors/data-river';

export interface PublicAPI {
  name: string;
  description: string;
  url: string;
  auth: string;
  https: boolean;
  cors: string;
  category: string;
}

export interface ParseOptions {
  categories?: string[];
  requiresCors?: boolean;
  requiresAuth?: boolean;
  limit?: number;
}

/**
 * Parse public APIs from README file
 */
export async function parsePublicAPIs(
  filePath: string,
  options: ParseOptions = {}
): Promise<APISource[]> {
  const content = readFileSync(filePath, 'utf-8');
  const apis = extractAPIs(content);
  
  // Filter based on options
  let filtered = apis;
  
  if (options.categories && options.categories.length > 0) {
    filtered = filtered.filter(api => 
      options.categories!.includes(api.category)
    );
  }
  
  if (options.requiresCors !== undefined) {
    filtered = filtered.filter(api => 
      options.requiresCors ? api.cors === 'Yes' : true
    );
  }
  
  if (options.requiresAuth !== undefined) {
    filtered = filtered.filter(api => 
      options.requiresAuth ? api.auth !== 'No' : api.auth === 'No'
    );
  }
  
  if (options.limit) {
    filtered = filtered.slice(0, options.limit);
  }
  
  // Convert to ECNE sources
  return filtered.map(convertToSource);
}

/**
 * Extract APIs from README content
 */
function extractAPIs(content: string): PublicAPI[] {
  const apis: PublicAPI[] = [];
  const lines = content.split('\n');
  
  let currentCategory = '';
  let inTable = false;
  
  for (const line of lines) {
    // Detect category headers
    if (line.startsWith('### ')) {
      currentCategory = line.substring(4).trim();
      inTable = false;
      continue;
    }
    
    // Detect table start
    if (line.includes('| API | Description |')) {
      inTable = true;
      continue;
    }
    
    // Skip table separator
    if (line.includes('| :---: | --- |')) {
      continue;
    }
    
    // Parse table rows
    if (inTable && line.startsWith('|') && line.split('|').length >= 6) {
      const parts = line.split('|').map(p => p.trim()).filter(p => p);
      
      if (parts.length >= 5) {
        // Extract API name and URL from markdown link
        const apiMatch = parts[0].match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (apiMatch) {
          apis.push({
            name: apiMatch[1],
            url: apiMatch[2],
            description: parts[1],
            auth: parts[2],
            https: parts[3] === 'Yes',
            cors: parts[4],
            category: currentCategory
          });
        }
      }
    }
    
    // Detect table end
    if (inTable && !line.startsWith('|')) {
      inTable = false;
    }
  }
  
  return apis;
}

/**
 * Convert public API to ECNE source
 */
function convertToSource(api: PublicAPI): APISource {
  // Extract base URL from documentation URL
  const baseUrl = extractBaseUrl(api.url);
  
  // Create default endpoints based on API type
  const endpoints = createDefaultEndpoints(api);
  
  return {
    id: api.name.toLowerCase().replace(/\s+/g, '-'),
    name: api.name,
    baseUrl: baseUrl,
    endpoints: endpoints,
    rateLimit: {
      requests: 10, // Conservative default
      window: 60
    },
    auth: api.auth === 'No' ? { type: 'none' } : undefined
  };
}

/**
 * Extract base API URL from documentation URL
 */
function extractBaseUrl(docUrl: string): string {
  // Try to extract API URL from common patterns
  try {
    const url = new URL(docUrl);
    
    // Common API subdomain patterns
    if (url.hostname.includes('api.')) {
      return `${url.protocol}//${url.hostname}`;
    }
    
    // Check if path contains 'api'
    if (url.pathname.includes('/api')) {
      const apiPath = url.pathname.substring(0, url.pathname.lastIndexOf('/api') + 4);
      return `${url.protocol}//${url.hostname}${apiPath}`;
    }
    
    // Default to base domain with /api
    return `${url.protocol}//api.${url.hostname.replace('www.', '')}`;
  } catch {
    // Fallback for invalid URLs
    return docUrl;
  }
}

/**
 * Create default endpoints based on API category
 */
function createDefaultEndpoints(api: PublicAPI): APIEndpoint[] {
  const endpoints: APIEndpoint[] = [];
  
  // Category-specific endpoints
  switch (api.category) {
    case 'News':
      endpoints.push({
        path: '/headlines',
        method: 'GET',
        refreshInterval: 300, // 5 minutes
        dataExtractor: (response) => {
          if (response.articles) return response.articles;
          if (response.results) return response.results;
          if (response.data) return response.data;
          return [];
        }
      });
      break;
      
    case 'Social':
      endpoints.push({
        path: '/posts/recent',
        method: 'GET',
        refreshInterval: 60, // 1 minute
        dataExtractor: (response) => {
          if (response.posts) return response.posts;
          if (response.data) return response.data;
          if (response.items) return response.items;
          return [];
        }
      });
      break;
      
    case 'Finance':
      endpoints.push({
        path: '/market/summary',
        method: 'GET',
        refreshInterval: 120, // 2 minutes
        dataExtractor: (response) => {
          if (response.quotes) return response.quotes;
          if (response.data) return response.data;
          if (response.markets) return response.markets;
          return [];
        }
      });
      break;
      
    case 'Weather':
      endpoints.push({
        path: '/current',
        method: 'GET',
        params: { location: 'global' },
        refreshInterval: 600, // 10 minutes
        dataExtractor: (response) => {
          if (response.weather) return [response.weather];
          if (response.data) return [response.data];
          return [response];
        }
      });
      break;
      
    default:
      // Generic endpoint for unknown categories
      endpoints.push({
        path: '/',
        method: 'GET',
        refreshInterval: 300, // 5 minutes
        dataExtractor: (response) => {
          if (Array.isArray(response)) return response;
          if (response.data && Array.isArray(response.data)) return response.data;
          if (response.items && Array.isArray(response.items)) return response.items;
          if (response.results && Array.isArray(response.results)) return response.results;
          return [response];
        }
      });
  }
  
  return endpoints;
}

/**
 * Get available categories from public API list
 */
export async function getAvailableCategories(filePath: string): Promise<string[]> {
  const content = readFileSync(filePath, 'utf-8');
  const categories: string[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('### ')) {
      const category = line.substring(4).trim();
      if (category && !category.includes('⬆')) {
        categories.push(category);
      }
    }
  }
  
  return categories;
}