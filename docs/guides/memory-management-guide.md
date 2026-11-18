
# Memory Management & Leak Prevention Guide

This document provides comprehensive information about memory management, leak prevention, and optimization strategies in the CriteriaIQ application.

## Table of Contents

1. [Overview](#overview)
2. [Memory Monitoring](#memory-monitoring)
3. [EventEmitter Leak Prevention](#eventemitter-leak-prevention)
4. [React Component Memory Management](#react-component-memory-management)
5. [WebSocket Memory Management](#websocket-memory-management)
6. [Error Log Management](#error-log-management)
7. [Performance Optimization](#performance-optimization)
8. [Memory Debugging Tools](#memory-debugging-tools)
9. [Best Practices](#best-practices)
10. [Troubleshooting Memory Issues](#troubleshooting-memory-issues)

## Overview

Effective memory management is crucial for maintaining application performance and preventing crashes. The CriteriaIQ application implements comprehensive memory monitoring and leak prevention strategies.

### Key Memory Management Areas

- **EventEmitter Listeners**: Preventing listener accumulation
- **React Components**: Proper cleanup on unmount
- **WebSocket Connections**: Connection and event management
- **Error Logs**: Automatic log rotation and cleanup
- **Database Connections**: Connection pool management
- **Browser Storage**: localStorage and sessionStorage optimization

## Memory Monitoring

### Performance Utils Integration

**Real-time Memory Monitoring**:
```typescript
import { monitorMemoryUsage } from '@/lib/performance-utils';

// Get current memory stats
const memoryStats = monitorMemoryUsage();
console.log('Memory usage:', {
  used: `${Math.round(memoryStats.usedMemory / 1024 / 1024)}MB`,
  total: `${Math.round(memoryStats.totalMemory / 1024 / 1024)}MB`,
  utilization: `${memoryStats.utilizationPercentage.toFixed(1)}%`
});

// Automatic cleanup trigger
if (memoryStats.needsCleanup) {
  performMemoryCleanup();
}
```

**Memory Thresholds**:
- **Warning Level**: 70% memory utilization
- **Cleanup Trigger**: 80% memory utilization
- **Critical Level**: 90% memory utilization

### Browser Memory API

**Memory Information Access**:
```typescript
// Check if memory API is available
if ('memory' in performance) {
  const memoryInfo = performance.memory;
  
  console.log('Memory Details:', {
    usedJSHeapSize: memoryInfo.usedJSHeapSize,
    totalJSHeapSize: memoryInfo.totalJSHeapSize,
    jsHeapSizeLimit: memoryInfo.jsHeapSizeLimit
  });
}
```

## EventEmitter Leak Prevention

### MaxListenersExceededWarning Prevention

**Root Cause**: Multiple event listeners being added without proper removal, commonly occurring in React components that don't cleanup properly.

**Solution Implementation**:
```typescript
class WebSocketManager extends EventEmitter {
  private maxListeners = 15;
  
  constructor() {
    super();
    this.setMaxListeners(this.maxListeners);
    
    // Monitor listener additions
    this.on('newListener', this.monitorListeners.bind(this));
  }
  
  private monitorListeners(eventName: string): void {
    const count = this.listenerCount(eventName);
    if (count > 10) {
      console.warn(`High listener count for ${eventName}: ${count}`);
    }
  }
}
```

### Listener Management Best Practices

**Proper Listener Cleanup**:
```typescript
// React component with proper cleanup
useEffect(() => {
  const handleMessage = (data) => processMessage(data);
  const handleError = (error) => handleError(error);
  
  // Add listeners
  wsManager.on('message', handleMessage);
  wsManager.on('error', handleError);
  
  return () => {
    // CRITICAL: Always remove listeners
    wsManager.off('message', handleMessage);
    wsManager.off('error', handleError);
  };
}, []); // Empty dependency array for mount/unmount only
```

**AbortController for Fetch Requests**:
```typescript
useEffect(() => {
  const abortController = new AbortController();
  
  const fetchData = async () => {
    try {
      const response = await fetch('/api/data', {
        signal: abortController.signal
      });
      const data = await response.json();
      setData(data);
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Fetch error:', error);
      }
    }
  };
  
  fetchData();
  
  return () => {
    abortController.abort(); // Cancel ongoing requests
  };
}, []);
```

## React Component Memory Management

### Component Lifecycle Cleanup

**useEffect Cleanup Patterns**:
```typescript
// Timer cleanup
useEffect(() => {
  const interval = setInterval(updateData, 1000);
  
  return () => {
    clearInterval(interval); // Prevent timer leaks
  };
}, []);

// Subscription cleanup
useEffect(() => {
  const subscription = dataService.subscribe(handleUpdate);
  
  return () => {
    subscription.unsubscribe(); // Prevent subscription leaks
  };
}, []);
```

### State Management Optimization

**Efficient State Updates**:
```typescript
// Use functional updates for better performance
const [items, setItems] = useState([]);

// Good: functional update
setItems(prevItems => [...prevItems, newItem]);

// Avoid: recreating entire array unnecessarily
// setItems([...items, newItem]);
```

**Memory-Efficient Data Structures**:
```typescript
// Use Map for frequent lookups instead of arrays
const [projectsMap, setProjectsMap] = useState(new Map());

// Convert to Map for efficient operations
const updateProjectsMap = (projects) => {
  const map = new Map(projects.map(p => [p.id, p]));
  setProjectsMap(map);
};
```

## WebSocket Memory Management

### Connection Resource Management

**Singleton Pattern Benefits**:
- Prevents multiple WebSocket connections
- Centralizes event listener management
- Reduces memory footprint
- Simplifies cleanup procedures

**Resource Cleanup Strategy**:
```typescript
// Complete WebSocket cleanup
disconnect(): void {
  // Clear all timers
  this.clearIntervals();
  
  // Remove all event listeners
  this.removeAllListeners();
  
  // Close WebSocket connection
  if (this.ws) {
    this.ws.close(1000, 'Deliberate disconnect');
    this.ws = null;
  }
  
  // Reset connection state
  this.resetConnectionState();
}
```

### Message Queue Management

**Queue Size Limits**:
```typescript
private messageQueue: any[] = [];
private readonly MAX_QUEUE_SIZE = 100;

private queueMessage(message: any): void {
  // Prevent queue overflow
  if (this.messageQueue.length >= this.MAX_QUEUE_SIZE) {
    this.messageQueue.shift(); // Remove oldest message
  }
  
  this.messageQueue.push(message);
}
```

## Error Log Management

### Automatic Log Rotation

**Log Size Management**:
```typescript
const MAX_ERROR_LOGS = 10;
const MAX_STORAGE_SIZE = 5 * 1024 * 1024; // 5MB

export const logError = (error: any, context?: string, userId?: string): string => {
  const errorId = generateErrorId();
  const errorLog = createErrorLog(error, context, userId, errorId);
  
  // Get existing logs
  const existingLogs = getStoredErrors();
  
  // Add new log
  existingLogs.push(errorLog);
  
  // Cleanup if necessary
  const cleanedLogs = cleanupErrorLogs(existingLogs);
  
  // Store cleaned logs
  localStorage.setItem('app_errors', JSON.stringify(cleanedLogs));
  
  return errorId;
};

const cleanupErrorLogs = (logs: ErrorLog[]): ErrorLog[] => {
  // Keep only last N logs
  let cleanedLogs = logs.slice(-MAX_ERROR_LOGS);
  
  // Check storage size
  const storageSize = JSON.stringify(cleanedLogs).length;
  if (storageSize > MAX_STORAGE_SIZE) {
    // Reduce logs further if storage is too large
    cleanedLogs = cleanedLogs.slice(-5);
  }
  
  return cleanedLogs;
};
```

### Storage Optimization

**localStorage Management**:
```typescript
// Monitor localStorage usage
const getStorageUsage = (): number => {
  let total = 0;
  for (let key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      total += localStorage[key].length;
    }
  }
  return total;
};

// Automatic cleanup when storage is full
const optimizeStorage = (): void => {
  const usage = getStorageUsage();
  const limit = 5 * 1024 * 1024; // 5MB typical limit
  
  if (usage > limit * 0.8) {
    // Clear old error logs
    localStorage.removeItem('app_errors_old');
    
    // Compress current logs
    compressErrorLogs();
  }
};
```

## Performance Optimization

### Garbage Collection Optimization

**Manual Garbage Collection Triggers**:
```typescript
// Force garbage collection in development
if (process.env.NODE_ENV === 'development' && 'gc' in window) {
  window.gc();
}

// Memory pressure relief
const relieveMemoryPressure = (): void => {
  // Clear React Query cache
  queryClient.clear();
  
  // Clear error logs
  localStorage.removeItem('app_errors');
  
  // Reset WebSocket connection
  WebSocketManager.getInstance().reconnect();
};
```

### Component Optimization

**React.memo Usage**:
```typescript
// Prevent unnecessary re-renders
const OptimizedComponent = React.memo(({ data, onUpdate }) => {
  return (
    <div>
      {/* Component content */}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for complex props
  return JSON.stringify(prevProps.data) === JSON.stringify(nextProps.data);
});
```

**useMemo and useCallback Optimization**:
```typescript
const ExpensiveComponent = ({ items }) => {
  // Memoize expensive calculations
  const processedItems = useMemo(() => {
    return items.map(item => processItem(item));
  }, [items]);
  
  // Memoize callback functions
  const handleUpdate = useCallback((id, updates) => {
    updateItem(id, updates);
  }, [updateItem]);
  
  return (
    <div>
      {processedItems.map(item => (
        <ItemComponent
          key={item.id}
          item={item}
          onUpdate={handleUpdate}
        />
      ))}
    </div>
  );
};
```

## Memory Debugging Tools

### Browser DevTools Integration

**Memory Tab Usage**:
1. Open Chrome DevTools → Memory tab
2. Take heap snapshots before and after operations
3. Compare snapshots to identify leaks
4. Look for detached DOM nodes and retained objects

**Performance Tab Analysis**:
1. Record performance timeline
2. Analyze memory allocation patterns
3. Identify GC (Garbage Collection) events
4. Monitor memory trends over time

### Custom Debugging Tools

**Memory Monitoring Component**:
```typescript
const MemoryMonitor = () => {
  const [memoryStats, setMemoryStats] = useState(null);
  
  useEffect(() => {
    const interval = setInterval(() => {
      if ('memory' in performance) {
        setMemoryStats({
          used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
          total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
          limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
        });
      }
    }, 5000); // Update every 5 seconds
    
    return () => clearInterval(interval);
  }, []);
  
  if (!memoryStats) return null;
  
  return (
    <div className="memory-monitor">
      <span>Memory: {memoryStats.used}MB / {memoryStats.limit}MB</span>
      <span>Utilization: {((memoryStats.used / memoryStats.limit) * 100).toFixed(1)}%</span>
    </div>
  );
};
```

## Best Practices

### Development Guidelines

1. **Always implement cleanup functions** in useEffect hooks
2. **Use AbortController** for cancellable async operations
3. **Monitor memory usage** during development
4. **Test component unmounting** to verify cleanup
5. **Avoid creating objects in render** functions

### Production Considerations

1. **Set memory usage alerts** for monitoring
2. **Implement automatic cleanup triggers** for long-running sessions
3. **Monitor error log accumulation** and implement rotation
4. **Use performance budgets** to prevent memory bloat
5. **Regular memory audits** in production environment

### Code Review Checklist

- [ ] All useEffect hooks have proper cleanup functions
- [ ] Event listeners are removed in cleanup
- [ ] WebSocket connections are properly managed
- [ ] No memory leaks in async operations
- [ ] Component re-renders are optimized
- [ ] Large data structures are properly managed

## Troubleshooting Memory Issues

### Common Memory Problems

**1. EventEmitter Memory Leaks**
- **Symptoms**: MaxListenersExceededWarning in console
- **Cause**: Event listeners not properly removed
- **Solution**: Implement proper cleanup in useEffect

**2. WebSocket Connection Leaks**
- **Symptoms**: Multiple WebSocket connections, increasing memory usage
- **Cause**: Components creating multiple connections
- **Solution**: Use singleton WebSocket manager

**3. Error Log Accumulation**
- **Symptoms**: localStorage quota exceeded
- **Cause**: Error logs not being rotated
- **Solution**: Implement automatic log cleanup

**4. React Query Cache Bloat**
- **Symptoms**: Increasing memory usage over time
- **Cause**: Infinite cache growth
- **Solution**: Configure appropriate cache limits

### Memory Debugging Commands

```javascript
// Check current memory usage
if ('memory' in performance) {
  const mem = performance.memory;
  console.log(`Memory: ${Math.round(mem.usedJSHeapSize/1024/1024)}MB used, ${Math.round(mem.jsHeapSizeLimit/1024/1024)}MB limit`);
}

// Check error log size
const errorLogs = JSON.parse(localStorage.getItem('app_errors') || '[]');
console.log(`Error logs: ${errorLogs.length} entries, ${JSON.stringify(errorLogs).length} bytes`);

// Check WebSocket manager state
const wsManager = WebSocketManager.getInstance();
console.log('WebSocket listeners:', wsManager.listenerCount('message'));

// Force garbage collection (Chrome DevTools only)
if ('gc' in window) {
  window.gc();
}
```

This comprehensive memory management guide ensures the CriteriaIQ application maintains optimal performance while preventing common memory-related issues that can impact user experience and system stability.
