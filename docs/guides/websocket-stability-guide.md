
# WebSocket Stability & Management Guide

This document provides comprehensive information about WebSocket implementation, stability measures, and troubleshooting in the CriteriaIQ application.

## Table of Contents

1. [Overview](#overview)
2. [WebSocket Manager](#websocket-manager)
3. [Connection Stability](#connection-stability)
4. [Error Handling](#error-handling)
5. [Performance Optimization](#performance-optimization)
6. [React Integration](#react-integration)
7. [Memory Management](#memory-management)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices)
10. [Monitoring & Debugging](#monitoring--debugging)

## Overview

The CriteriaIQ application uses WebSockets for real-time communication between the client and server. This enables live updates for project changes, user activities, and system notifications without requiring page refreshes.

### Key Features

- **Automatic Reconnection**: Robust reconnection logic with exponential backoff
- **Connection State Management**: Real-time connection status tracking
- **Memory Leak Prevention**: Proper cleanup and listener management
- **Error Recovery**: Graceful handling of connection failures
- **Performance Optimization**: Efficient message handling and resource usage

## WebSocket Manager

### Implementation (`client/src/lib/websocket-manager.ts`)

The WebSocket Manager implements a singleton pattern to ensure only one WebSocket connection exists throughout the application lifecycle.

#### Core Features

**Singleton Pattern**:
```typescript
class WebSocketManager extends EventEmitter {
  private static instance: WebSocketManager;
  
  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }
}
```

**Connection Management**:
```typescript
connect(url: string): void {
  if (this.ws && this.ws.readyState === WebSocket.OPEN) {
    return; // Already connected
  }
  
  this.ws = new WebSocket(url);
  this.setupEventHandlers();
}
```

**Event Handling**:
```typescript
// Emit events for React components to listen
this.ws.onopen = () => this.emit('open');
this.ws.onclose = (event) => this.emit('close', event);
this.ws.onmessage = (event) => this.emit('message', JSON.parse(event.data));
this.ws.onerror = (error) => this.emit('error', error);
```

## Connection Stability

### Automatic Reconnection

**Exponential Backoff Strategy**:
```typescript
const reconnectDelays = [1000, 2000, 4000, 8000, 16000]; // Up to 16 seconds
const maxReconnectAttempts = 5;

reconnect(): void {
  if (this.reconnectAttempts >= maxReconnectAttempts) {
    this.emit('maxRetriesReached');
    return;
  }
  
  const delay = reconnectDelays[this.reconnectAttempts] || 16000;
  setTimeout(() => {
    this.connect(this.url);
    this.reconnectAttempts++;
  }, delay);
}
```

**Connection Health Monitoring**:
```typescript
// Ping mechanism for connection health
startPingInterval(): void {
  this.pingInterval = setInterval(() => {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: 'ping' });
    }
  }, 30000); // Ping every 30 seconds
}
```

### Page Visibility Integration

**Connection Pause/Resume**:
```typescript
// Pause connections when page is hidden
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    this.pause();
  } else {
    this.resume();
  }
});
```

## Error Handling

### Connection Error Types

**1. Initial Connection Failures**:
```typescript
// Handle connection failures during initial connect
this.ws.onerror = (error) => {
  console.error('WebSocket connection error:', error);
  this.emit('connectionFailed', error);
};
```

**2. Unexpected Disconnections**:
```typescript
// Handle unexpected disconnections
this.ws.onclose = (event) => {
  if (event.code !== 1000) { // Not a normal closure
    console.warn('Unexpected WebSocket disconnection:', event);
    this.scheduleReconnect();
  }
};
```

**3. Message Handling Errors**:
```typescript
// Safely parse messages
this.ws.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    this.emit('message', data);
  } catch (error) {
    console.error('Failed to parse WebSocket message:', error);
    this.emit('parseError', error);
  }
};
```

### Error Recovery Strategies

**Graceful Degradation**:
- Application continues to function without real-time updates
- Fallback to polling for critical data
- User notifications about connection status

**Automatic Recovery**:
- Reconnection attempts with increasing delays
- Connection state restoration
- Message queue replay for missed messages

## Performance Optimization

### Message Handling Optimization

**Efficient Message Processing**:
```typescript
// Batch message processing
private messageQueue: any[] = [];
private processingTimeout: NodeJS.Timeout | null = null;

private queueMessage(message: any): void {
  this.messageQueue.push(message);
  
  if (!this.processingTimeout) {
    this.processingTimeout = setTimeout(() => {
      this.processMessageBatch();
    }, 100); // Process every 100ms
  }
}
```

**Memory-Efficient Event Handling**:
```typescript
// Limit event listeners to prevent memory leaks
private maxListeners = 15;

constructor() {
  super();
  this.setMaxListeners(this.maxListeners);
}
```

### Connection Resource Management

**Resource Cleanup**:
```typescript
disconnect(): void {
  // Clear all timers
  if (this.pingInterval) {
    clearInterval(this.pingInterval);
    this.pingInterval = null;
  }
  
  // Close connection
  if (this.ws) {
    this.ws.close(1000, 'Deliberate disconnect');
    this.ws = null;
  }
  
  // Clear event listeners
  this.removeAllListeners();
}
```

## React Integration

### useWebSocket Hook (`client/src/hooks/useWebSocket.ts`)

**Purpose**: Provides React components with WebSocket functionality while managing component lifecycle.

#### Key Features

**State Management**:
```typescript
const useWebSocket = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [lastError, setLastError] = useState(null);
  
  // WebSocket manager reference
  const wsManagerRef = useRef<WebSocketManager | null>(null);
};
```

**Event Handler Setup**:
```typescript
useEffect(() => {
  const handleOpen = () => setIsConnected(true);
  const handleClose = () => setIsConnected(false);
  const handleMessage = (data: any) => setLastMessage(data);
  const handleError = (error: any) => setLastError(error);
  
  // Register event handlers
  wsManager.on('open', handleOpen);
  wsManager.on('close', handleClose);
  wsManager.on('message', handleMessage);
  wsManager.on('error', handleError);
  
  return () => {
    // Cleanup event handlers
    wsManager.off('open', handleOpen);
    wsManager.off('close', handleClose);
    wsManager.off('message', handleMessage);
    wsManager.off('error', handleError);
  };
}, []);
```

## Memory Management

### EventEmitter Leak Prevention

**Listener Limit Management**:
```typescript
// Set reasonable listener limits
webSocketManager.setMaxListeners(15);

// Monitor for potential leaks
webSocketManager.on('newListener', (eventName) => {
  const listenerCount = webSocketManager.listenerCount(eventName);
  if (listenerCount > 10) {
    console.warn(`High listener count for ${eventName}: ${listenerCount}`);
  }
});
```

**Automatic Cleanup**:
```typescript
// Component cleanup
useEffect(() => {
  return () => {
    // Remove all listeners for this component
    wsManager.removeAllListeners();
  };
}, []);
```

### Memory Usage Monitoring

**Real-time Monitoring**:
```typescript
// Monitor memory usage during WebSocket operations
const monitorWebSocketMemory = () => {
  const memoryInfo = performance.memory;
  console.log('WebSocket Memory Usage:', {
    used: Math.round(memoryInfo.usedJSHeapSize / 1024 / 1024) + 'MB',
    total: Math.round(memoryInfo.totalJSHeapSize / 1024 / 1024) + 'MB'
  });
};
```

## Monitoring & Debugging

### Connection Status Monitoring

**Console Logging**:
```typescript
// Connection events
["Attempting WebSocket connection to:", url]
["WebSocket connected"]
["WebSocket disconnected", { code: 1006, reason: "" }]
["Page visible, resuming WebSocket connection"]
```

**Connection Metrics**:
- Connection attempt frequency
- Successful connection rate
- Average connection duration
- Disconnection reason analysis

### Performance Metrics

**Key Metrics**:
- Message throughput (messages/second)
- Connection stability (uptime percentage)
- Reconnection frequency
- Memory usage during operations

**Monitoring Tools**:
```typescript
// WebSocket performance tracking
const wsPerformance = {
  connectTime: Date.now(),
  messageCount: 0,
  reconnectionCount: 0,
  avgMessageSize: 0
};
```

## Troubleshooting

### Common WebSocket Issues

**1. Connection Failures**
- **Symptoms**: Unable to establish initial connection
- **Causes**: Network issues, server unavailability, firewall blocking
- **Solutions**: Check network connectivity, verify server status, check firewall settings

**2. Frequent Disconnections**
- **Symptoms**: Repeated connect/disconnect cycles
- **Causes**: Network instability, server restarts, proxy issues
- **Solutions**: Implement longer ping intervals, check network stability, review proxy configuration

**3. Memory Leaks**
- **Symptoms**: Increasing memory usage over time
- **Causes**: Event listeners not properly removed, message queue accumulation
- **Solutions**: Verify cleanup functions, monitor listener counts, implement message queue limits

**4. Message Loss**
- **Symptoms**: Missing real-time updates
- **Causes**: Connection drops during message transmission, queue overflow
- **Solutions**: Implement message acknowledgment, increase queue size, add message retry logic

### Debugging Tools

**Console Commands**:
```javascript
// Check WebSocket status
const wsManager = window.WebSocketManager?.getInstance();
console.log('Connection state:', wsManager?.getConnectionState());

// View connection metrics
console.log('Performance metrics:', wsManager?.getPerformanceMetrics());

// Force reconnection
wsManager?.reconnect();
```

**Performance Analysis**:
```javascript
// Memory usage analysis
const memoryInfo = performance.memory;
console.log('Memory utilization:', 
  (memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit * 100).toFixed(2) + '%'
);
```

## Best Practices

### Development Guidelines

1. **Always cleanup WebSocket connections** in component unmount
2. **Use the singleton WebSocket Manager** instead of creating multiple connections
3. **Implement proper error handling** for all WebSocket operations
4. **Monitor memory usage** during development
5. **Test connection scenarios** including network failures

### Production Considerations

1. **Set appropriate reconnection limits** to avoid infinite retry loops
2. **Implement user notifications** for connection status changes
3. **Monitor WebSocket performance metrics** in production
4. **Plan for graceful degradation** when WebSocket is unavailable
5. **Use compression** for large message payloads

### Security Considerations

1. **Validate all incoming messages** to prevent injection attacks
2. **Use secure WebSocket (WSS)** in production
3. **Implement proper authentication** for WebSocket connections
4. **Rate limit** WebSocket messages to prevent abuse

This WebSocket stability guide ensures reliable real-time communication in the CriteriaIQ application while maintaining optimal performance and preventing common issues like memory leaks and connection instability.
