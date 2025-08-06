// Global test setup
import { TextEncoder, TextDecoder } from 'util';

// Polyfills for Node.js
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Mock WebSocket for Node.js environment
global.WebSocket = class MockWebSocket {
  readyState: number = 0;
  url: string;
  
  constructor(url: string) {
    this.url = url;
    setTimeout(() => {
      this.readyState = 1;
      if (this.onopen) this.onopen({} as any);
    }, 10);
  }
  
  send(data: any): void {
    // Mock send
  }
  
  close(): void {
    this.readyState = 3;
    if (this.onclose) this.onclose({ code: 1000, reason: 'Normal' } as any);
  }
  
  // Event handlers
  onopen?: (event: Event) => void;
  onclose?: (event: CloseEvent) => void;
  onmessage?: (event: MessageEvent) => void;
  onerror?: (event: Event) => void;
} as any;

// Global test configuration
jest.setTimeout(30000);

// Suppress console logs in tests unless explicitly needed
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterAll(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
});