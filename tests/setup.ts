// Global test setup
import { TextEncoder, TextDecoder } from 'util';

// Polyfills for Node.js
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Type definitions for WebSocket API
type BinaryType = 'blob' | 'arraybuffer';
type EventListener = (event: Event) => void;

interface CloseEventInit {
  bubbles?: boolean;
  cancelable?: boolean;
  code?: number;
  reason?: string;
  wasClean?: boolean;
}

class CloseEvent extends Event {
  readonly code: number;
  readonly reason: string;
  readonly wasClean: boolean;
  
  constructor(type: string, init?: CloseEventInit) {
    super(type, init);
    this.code = init?.code ?? 1000;
    this.reason = init?.reason ?? '';
    this.wasClean = init?.wasClean ?? true;
  }
}

// Mock WebSocket for Node.js environment
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  
  readyState: number = MockWebSocket.CONNECTING;
  url: string;
  protocol: string = '';
  bufferedAmount: number = 0;
  extensions: string = '';
  binaryType: BinaryType = 'blob';
  
  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    if (protocols) {
      this.protocol = Array.isArray(protocols) ? protocols[0] : protocols;
    }
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        const event = new Event('open');
        this.onopen(event);
      }
    }, 10);
  }
  
  send(_data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    // Mock send implementation
  }
  
  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSING;
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      if (this.onclose) {
        const event = new CloseEvent('close', {
          code: code || 1000,
          reason: reason || 'Normal closure',
          wasClean: true
        });
        this.onclose(event);
      }
    }, 10);
  }
  
  addEventListener(_type: string, _listener: EventListener): void {
    // Mock addEventListener
  }
  
  removeEventListener(_type: string, _listener: EventListener): void {
    // Mock removeEventListener
  }
  
  dispatchEvent(_event: Event): boolean {
    return true;
  }
  
  // Event handlers
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
}

// Assign to global with proper typing
(global as any).WebSocket = MockWebSocket;

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