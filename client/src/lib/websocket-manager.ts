
/**
 * Enhanced WebSocket manager with singleton pattern and proper connection handling
 */
export class WebSocketManager {
  private static instance: WebSocketManager | null = null;
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private connectionBackoffMultiplier = 1.5;
  private isManualDisconnect = false;
  private listeners = new Map<string, Set<(...args: any[]) => void>>();

  private constructor(url: string) {
    this.url = url;
  }

  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      // Use appropriate protocol and target backend server
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws`;
      WebSocketManager.instance = new WebSocketManager(wsUrl);
    }
    return WebSocketManager.instance;
  }

  connect(): Promise<void> {
    // If already connected or connecting, don't tear down the existing connection
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        // Clean up any stale/closed connection before creating a new one
        if (this.ws) {
          this.disconnect(true);
        }

        console.log('Attempting WebSocket connection to:', this.url);
        this.ws = new WebSocket(this.url);
        this.isManualDisconnect = false;

        this.ws.onopen = async () => {
          console.log('WebSocket connected');
          this.reconnectAttempts = 0;
          
          // Send authentication message immediately after connection
          try {
            const response = await fetch('/api/auth/user');
            if (response.ok) {
              const user = await response.json();
              const authMessage = {
                type: 'auth',
                sessionId: 'browser-session', // Using browser session
                userId: user.id,
                userRole: user.role,
                userEmail: user.email
              };
              this.ws?.send(JSON.stringify(authMessage));
              console.log('WebSocket authentication message sent');
            }
          } catch (error) {
            console.error('Failed to send WebSocket authentication:', error);
          }
          
          this.setupHeartbeat();
          this.emit('open');
          resolve();
        };

        this.ws.onclose = (event) => {
          console.log('WebSocket disconnected', { code: event.code, reason: event.reason });
          this.cleanupHeartbeat();
          this.emit('close', { code: event.code, reason: event.reason });

          if (!this.isManualDisconnect && this.shouldReconnect(event.code)) {
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.emit('error', error);
          // Only reject if this is the initial connection attempt
          // Subsequent errors during an open connection should not reject
          if (this.ws?.readyState !== WebSocket.OPEN) {
            reject(error);
          }
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(manual = false) {
    this.isManualDisconnect = manual;
    this.cleanupHeartbeat();
    this.cleanupReconnectTimeout();

    if (this.ws) {
      this.ws.close(1000, manual ? 'Deliberate disconnect' : 'Automatic disconnect');
      this.ws = null;
    }
  }

  reconnect() {
    this.disconnect(false);
    this.connect();
  }

  private shouldReconnect(code: number): boolean {
    // Don't reconnect on deliberate close (1000) or policy violation (1008)
    return code !== 1000 && code !== 1008 && this.reconnectAttempts < this.maxReconnectAttempts;
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnection attempts reached');
      // Reset attempts after a longer delay to allow manual retry
      setTimeout(() => {
        this.reconnectAttempts = 0;
        console.log('WebSocket reconnection attempts reset');
      }, 60000); // Reset after 1 minute
      return;
    }

    // Exponential backoff with jitter to prevent thundering herd
    const baseDelay = this.reconnectDelay * Math.pow(this.connectionBackoffMultiplier, this.reconnectAttempts);
    const jitter = Math.random() * 1000; // Add up to 1 second of random jitter
    const delay = Math.min(baseDelay + jitter, this.maxReconnectDelay);

    console.log(`Scheduling reconnect in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  private setupHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // 30 seconds
  }

  private cleanupHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private cleanupReconnectTimeout() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private handleMessage(event: MessageEvent) {
    try {
      const data = JSON.parse(event.data);
      this.emit('message', data);
      
      // Also emit specific event types
      if (data.type) {
        this.emit(data.type, data);
      }
    } catch (error) {
      console.error('WebSocket message parsing error:', error);
    }
  }

  // Add event emitter-like interface
  on(event: string, listener: (...args: any[]) => void) {
    this.addEventListener(event, listener);
  }

  off(event: string, listener: (...args: any[]) => void) {
    this.removeEventListener(event, listener);
  }

  emit(event: string, ...args: any[]) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(...args);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  addEventListener(type: string, listener: (...args: any[]) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: (...args: any[]) => void) {
    const eventListeners = this.listeners.get(type);
    if (eventListeners) {
      eventListeners.delete(listener);
      if (eventListeners.size === 0) {
        this.listeners.delete(type);
      }
    }
  }

  // Clean up all listeners to prevent memory leaks
  cleanup() {
    this.disconnect(true);
    this.listeners.clear();
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket not connected, cannot send message');
    }
  }
}

// Cleanup on page unload - handled by singleton pattern
if (typeof window !== 'undefined') {
  let beforeUnloadHandlerAdded = false;
  
  if (!beforeUnloadHandlerAdded) {
    window.addEventListener('beforeunload', () => {
      const instance = WebSocketManager.getInstance();
      if (instance) {
        instance.cleanup();
      }
    });
    beforeUnloadHandlerAdded = true;
  }
}
