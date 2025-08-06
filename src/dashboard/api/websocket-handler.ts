import { EventEmitter } from 'events';

export interface WebSocketConfig {
  url: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  reconnectDecay?: number;
  protocols?: string | string[];
}

export interface WebSocketMessage {
  event: string;
  data: any;
  timestamp?: Date;
  id?: string;
}

export class WebSocketHandler extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectInterval: number;
  private maxReconnectAttempts: number;
  private reconnectAttempts: number = 0;
  private heartbeatInterval: number;
  private reconnectDecay: number;
  private heartbeatTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private messageQueue: WebSocketMessage[] = [];
  private isConnecting: boolean = false;
  private eventHandlers: Map<string, Function[]> = new Map();
  private lastPingTime?: number;
  private connectionId?: string;
  
  constructor(private config: WebSocketConfig) {
    super();
    
    this.reconnectInterval = config.reconnectInterval || 5000;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 5;
    this.heartbeatInterval = config.heartbeatInterval || 30000;
    this.reconnectDecay = config.reconnectDecay || 1.5;
    
    this.connect();
  }
  
  private connect(): void {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }
    
    this.isConnecting = true;
    
    try {
      this.ws = new WebSocket(this.config.url, this.config.protocols);
      this.setupEventHandlers();
    } catch (error) {
      console.error('WebSocket connection error:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }
  
  private setupEventHandlers(): void {
    if (!this.ws) return;
    
    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.connectionId = this.generateConnectionId();
      
      this.emit('connected', {
        url: this.config.url,
        connectionId: this.connectionId,
        timestamp: new Date()
      });
      
      // Send queued messages
      this.flushMessageQueue();
      
      // Start heartbeat
      this.startHeartbeat();
    };
    
    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage;
        this.handleMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
        this.emit('error', {
          type: 'parse-error',
          error,
          data: event.data
        });
      }
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.emit('error', {
        type: 'connection-error',
        error
      });
    };
    
    this.ws.onclose = (event) => {
      console.log(`WebSocket closed: ${event.code} - ${event.reason}`);
      this.isConnecting = false;
      this.stopHeartbeat();
      
      this.emit('disconnected', {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
        timestamp: new Date()
      });
      
      // Attempt reconnection if not a clean close
      if (!event.wasClean && event.code !== 1000) {
        this.handleReconnect();
      }
    };
  }
  
  private handleMessage(message: WebSocketMessage): void {
    // Handle system messages
    if (message.event === 'pong') {
      this.lastPingTime = Date.now();
      return;
    }
    
    if (message.event === 'error') {
      this.emit('server-error', message.data);
      return;
    }
    
    // Emit general message event
    this.emit('message', message);
    
    // Emit specific event
    this.emit(message.event, message.data);
    
    // Call registered handlers
    const handlers = this.eventHandlers.get(message.event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(message.data);
        } catch (error) {
          console.error(`Handler error for event ${message.event}:`, error);
        }
      });
    }
  }
  
  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.emit('max-reconnect-exceeded', {
        attempts: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts
      });
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.calculateReconnectDelay();
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    this.emit('reconnecting', {
      attempt: this.reconnectAttempts,
      delay,
      maxAttempts: this.maxReconnectAttempts
    });
    
    this.scheduleReconnect(delay);
  }
  
  private scheduleReconnect(delay?: number): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay || this.reconnectInterval);
  }
  
  private calculateReconnectDelay(): number {
    const delay = this.reconnectInterval * Math.pow(this.reconnectDecay, this.reconnectAttempts - 1);
    // Cap at 60 seconds
    return Math.min(delay, 60000);
  }
  
  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        this.sendHeartbeat();
        
        // Check if we've received a pong recently
        if (this.lastPingTime && Date.now() - this.lastPingTime > this.heartbeatInterval * 2) {
          console.warn('Heartbeat timeout - reconnecting');
          this.ws?.close();
        }
      }
    }, this.heartbeatInterval);
  }
  
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }
  
  private sendHeartbeat(): void {
    this.send('ping', { timestamp: Date.now() });
  }
  
  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected()) {
      const message = this.messageQueue.shift();
      if (message) {
        this.sendMessage(message);
      }
    }
  }
  
  private sendMessage(message: WebSocketMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    
    try {
      this.ws.send(JSON.stringify(message));
      this.emit('message-sent', message);
    } catch (error) {
      console.error('Failed to send message:', error);
      this.emit('send-error', { message, error });
    }
  }
  
  subscribe(event: string, callback: Function): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    
    this.eventHandlers.get(event)!.push(callback);
    
    // Return unsubscribe function
    return () => {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        const index = handlers.indexOf(callback);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }
  
  unsubscribe(event: string, callback?: Function): void {
    if (!callback) {
      this.eventHandlers.delete(event);
    } else {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        const index = handlers.indexOf(callback);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    }
  }
  
  send(event: string, data: any): void {
    const message: WebSocketMessage = {
      event,
      data,
      timestamp: new Date(),
      id: this.generateMessageId()
    };
    
    if (this.isConnected()) {
      this.sendMessage(message);
    } else {
      // Queue message if not connected
      this.messageQueue.push(message);
      
      // Limit queue size to prevent memory issues
      if (this.messageQueue.length > 100) {
        this.messageQueue.shift();
      }
    }
  }
  
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
  
  getConnectionState(): {
    connected: boolean;
    connecting: boolean;
    reconnectAttempts: number;
    connectionId?: string;
    queuedMessages: number;
  } {
    return {
      connected: this.isConnected(),
      connecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts,
      connectionId: this.connectionId,
      queuedMessages: this.messageQueue.length
    };
  }
  
  reconnect(): void {
    this.reconnectAttempts = 0;
    
    if (this.ws) {
      this.ws.close(1000, 'Manual reconnect');
    }
    
    setTimeout(() => {
      this.connect();
    }, 100);
  }
  
  disconnect(): void {
    this.stopHeartbeat();
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    
    this.messageQueue = [];
    this.eventHandlers.clear();
    this.removeAllListeners();
  }
  
  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}