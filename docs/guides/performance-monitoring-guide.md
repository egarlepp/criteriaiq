
# Performance Monitoring & Optimization Guide

This document provides detailed information about performance monitoring, optimization strategies, and troubleshooting performance issues in the CriteriaIQ application.

## Table of Contents

1. [Overview](#overview)
2. [Performance Utils](#performance-utils)
3. [Memory Management](#memory-management)
4. [Database Performance](#database-performance)
5. [WebSocket Performance](#websocket-performance)
6. [Frontend Optimization](#frontend-optimization)
7. [Monitoring Tools](#monitoring-tools)
8. [Performance Metrics](#performance-metrics)
9. [Optimization Strategies](#optimization-strategies)
10. [Troubleshooting Performance Issues](#troubleshooting-performance-issues)

## Overview

The CriteriaIQ application implements comprehensive performance monitoring to ensure optimal user experience and system stability. This includes client-side performance tracking, server-side monitoring, and proactive optimization strategies.

### Key Performance Areas

- **Page Load Performance**: Measuring and optimizing initial page load times
- **API Response Times**: Tracking server response performance
- **Memory Usage**: Monitoring and preventing memory leaks
- **Database Queries**: Optimizing query performance and connection management
- **WebSocket Connections**: Ensuring stable real-time communication
- **Resource Loading**: Optimizing asset delivery and caching

## Performance Utils

### Core Performance Utilities (`client/src/lib/performance-utils.ts`)

#### `measurePageLoad()`
Measures comprehensive page load performance metrics.

```typescript
const pageMetrics = measurePageLoad();
// Returns: {
//   loadTime: number,
//   domContentLoaded: number,
//   firstContentfulPaint: number,
//   largestContentfulPaint: number
// }
```

#### `trackApiPerformance(apiCall)`
Tracks API call performance with detailed metrics.

```typescript
const apiMetrics = await trackApiPerformance(() => fetch('/api/projects'));
// Returns: {
//   duration: number,
//   success: boolean,
//   statusCode: number,
//   endpoint: string,
//   timestamp: Date
// }
```

#### `monitorMemoryUsage()`
Monitors current memory usage and provides optimization recommendations.

```typescript
const memoryStats = monitorMemoryUsage();
// Returns: {
//   usedMemory: number,
//   totalMemory: number,
//   memoryLimit: number,
//   utilizationPercentage: number,
//   needsCleanup: boolean
// }
```

#### `getPerformanceMetrics()`
Retrieves comprehensive performance metrics for analysis.

```typescript
const metrics = getPerformanceMetrics();
// Returns aggregated performance data across all monitored areas
```

## Memory Management

### Memory Monitoring Strategy

**Automatic Monitoring**:
- Continuous memory usage tracking
- Threshold-based cleanup triggers
- Performance impact assessment
- Memory leak detection

**Cleanup Strategies**:
```typescript
// Automatic cleanup when memory usage exceeds 80%
if (memoryUtilization > 0.8) {
  performMemoryCleanup();
}

// Error log rotation
const MAX_ERROR_LOGS = 10;
if (errorLogs.length > MAX_ERROR_LOGS) {
  errorLogs.splice(0, errorLogs.length - MAX_ERROR_LOGS);
}
```

### Component Memory Management

**React Component Cleanup**:
```typescript
useEffect(() => {
  const subscription = someService.subscribe(handler);
  
  return () => {
    // Always cleanup subscriptions
    subscription.unsubscribe();
  };
}, []);
```

**WebSocket Memory Management**:
```typescript
// Proper WebSocket cleanup
useEffect(() => {
  const wsManager = WebSocketManager.getInstance();
  
  return () => {
    wsManager.removeAllListeners();
    wsManager.disconnect();
  };
}, []);
```

## Database Performance

### Connection Pool Management

**Pool Configuration**:
- Maximum pool size: 10 connections
- Connection timeout: 30 seconds
- Idle timeout: 300 seconds
- Connection validation on acquisition

**Performance Monitoring**:
```typescript
// Connection tracking
Database client acquired. Active connections: undefined
Database client released. Active connections: undefined

// Slow query detection
if (queryDuration > 100) {
  console.warn(`Slow query detected: ${queryDuration}ms - ${query}`);
}
```

### Query Optimization

**Best Practices**:
- Use proper indexes for frequently queried fields
- Implement pagination for large datasets
- Use connection pooling to reduce overhead
- Monitor query execution plans

**Large Dataset Handling**:
```typescript
// Pagination implementation
const ITEMS_PER_PAGE = 20;
const offset = (page - 1) * ITEMS_PER_PAGE;

const query = `
  SELECT * FROM projects 
  ORDER BY created_at DESC 
  LIMIT ${ITEMS_PER_PAGE} 
  OFFSET ${offset}
`;
```

## WebSocket Performance

### Connection Stability

**Reconnection Strategy**:
- Exponential backoff algorithm
- Maximum reconnection attempts: 5
- Connection state persistence
- Page visibility-based connection management

**Performance Optimization**:
```typescript
// Efficient message handling
const handleMessage = useCallback((message) => {
  // Process message efficiently
  processMessage(message);
}, []);

// Connection state management
if (document.visibilityState === 'visible') {
  wsManager.connect();
} else {
  wsManager.pause();
}
```

### Message Queue Management

**Features**:
- Message queuing during disconnection
- Batch message processing
- Priority-based message handling
- Automatic message retry

## Frontend Optimization

### Code Splitting

**Route-based Splitting**:
```typescript
// Lazy load pages
const Dashboard = lazy(() => import('./pages/dashboard'));
const Projects = lazy(() => import('./pages/projects'));
```

### Asset Optimization

**Image Optimization**:
- Base64 encoding for small images (<5MB)
- Lazy loading for large image sets
- Compressed image formats

**Bundle Optimization**:
- Tree shaking for unused code removal
- Minification in production builds
- Gzip compression for static assets

## Monitoring Tools

### Browser DevTools Integration

**Performance Tab**:
- Timeline analysis for component rendering
- Memory heap snapshots
- Network waterfall analysis

**Console Monitoring**:
```typescript
// Performance logging
console.time('Page Load');
// ... page load operations
console.timeEnd('Page Load');

// Memory usage logging
console.log('Memory usage:', performance.memory);
```

### Custom Performance Dashboard

**Real-time Metrics**:
- API response time trends
- Memory usage graphs
- Error rate monitoring
- User session performance

## Performance Metrics

### Key Performance Indicators

**Client-Side Metrics**:
- Page load time: Target <2 seconds
- First Contentful Paint: Target <1.5 seconds
- Largest Contentful Paint: Target <2.5 seconds
- Memory usage: Keep under 100MB heap size

**Server-Side Metrics**:
- API response time: Target <500ms average
- Database query time: Target <100ms average
- WebSocket message latency: Target <50ms
- Error rate: Target <1% of requests

### Performance Monitoring Schedule

**Real-time Monitoring**:
- Memory usage checks every 30 seconds
- API performance tracking on every request
- WebSocket connection health checks every 60 seconds

**Periodic Analysis**:
- Daily performance report generation
- Weekly trend analysis
- Monthly optimization reviews

## Optimization Strategies

### Database Optimization

**Connection Optimization**:
```typescript
// Efficient connection usage
const client = await pool.connect();
try {
  const result = await client.query(sql, params);
  return result;
} finally {
  client.release(); // Always release connections
}
```

**Query Optimization**:
- Use prepared statements for repeated queries
- Implement query result caching
- Optimize JOIN operations
- Use database indexes effectively

### Frontend Optimization

**React Query Optimization**:
```typescript
// Efficient data fetching
const { data, isLoading, error } = useQuery({
  queryKey: ['projects', filters],
  queryFn: () => fetchProjects(filters),
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 10 * 60 * 1000, // 10 minutes
});
```

**Component Optimization**:
- Use React.memo for expensive components
- Implement proper dependency arrays
- Avoid inline object creation in render
- Use useMemo and useCallback appropriately

## Troubleshooting Performance Issues

### Common Performance Problems

**1. Slow Page Loads**
- Check bundle size and implement code splitting
- Optimize image loading and formats
- Review third-party script impact

**2. High Memory Usage**
- Check for memory leaks in event listeners
- Review error log accumulation
- Monitor component cleanup

**3. Slow API Responses**
- Check database query performance
- Review server-side processing logic
- Verify network conditions

**4. WebSocket Performance Issues**
- Monitor connection stability
- Check message queue size
- Review event handler efficiency

### Performance Debugging Tools

**Browser Tools**:
- Performance tab for timeline analysis
- Memory tab for heap snapshots
- Network tab for request analysis

**Application Tools**:
- Performance Utils for real-time monitoring
- Error Debug Page for performance testing
- Console performance logging

### Performance Best Practices

**Development**:
- Profile components during development
- Monitor bundle size changes
- Test with realistic data volumes
- Use performance budgets

**Production**:
- Monitor real user metrics (RUM)
- Set up performance alerts
- Regular performance audits
- Continuous optimization

This comprehensive performance monitoring system ensures the CriteriaIQ application maintains optimal performance under various load conditions while providing tools for ongoing optimization and troubleshooting.
