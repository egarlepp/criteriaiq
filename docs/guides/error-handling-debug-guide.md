
# Error Handling & Debugging Guide

This document provides a comprehensive overview of the error handling and debugging systems implemented throughout the CriteriaIQ application.

## Table of Contents

1. [Overview](#overview)
2. [Error Handling Components](#error-handling-components)
3. [Error Utilities](#error-utilities)
4. [Global Error Handling](#global-error-handling)
5. [WebSocket Stability & Management](#websocket-stability--management)
6. [Performance Monitoring](#performance-monitoring)
7. [Memory Management](#memory-management)
8. [EventEmitter Leak Prevention](#eventemitter-leak-prevention)
9. [Database Performance Optimization](#database-performance-optimization)
10. [Debugging Tools](#debugging-tools)
11. [Error Recovery Patterns](#error-recovery-patterns)
12. [Logging System](#logging-system)
13. [Development vs Production](#development-vs-production)
14. [Testing Error Scenarios](#testing-error-scenarios)
15. [Troubleshooting Common Issues](#troubleshooting-common-issues)

## Overview

The application implements a multi-layered error handling approach:

- **Component-level**: Error boundaries catch React component errors
- **API-level**: Structured error responses with proper HTTP status codes
- **Global-level**: Unhandled promise rejections and JavaScript errors
- **User-level**: User-friendly error messages with recovery options
- **Developer-level**: Detailed logging and debugging information

## Error Handling Components

### 1. ErrorBoundary (`client/src/components/error-boundary.tsx`)

**Purpose**: Catches JavaScript errors anywhere in the React component tree.

**Features**:
- Automatic error ID generation for tracking
- Component stack trace logging
- Fallback UI with retry functionality
- Support for custom fallback components
- Email reporting integration

**Usage**:
```jsx
<ErrorBoundary showDetails={true} onError={customErrorHandler}>
  <YourComponent />
</ErrorBoundary>

// With HOC wrapper
const SafeComponent = withErrorBoundary(YourComponent);
```

### 2. ErrorRecovery (`client/src/components/error-recovery.tsx`)

**Purpose**: Provides user-friendly error recovery interfaces.

**Features**:
- Customizable recovery actions
- Bug reporting functionality
- Error details display (toggleable)
- Navigation options (home, retry)
- Contact information integration

**Usage**:
```jsx
<ErrorRecovery
  error={error}
  title="Custom Error Title"
  context="Feature Name"
  onRetry={handleRetry}
  showDetails={true}
  recoveryActions={[
    { label: "Reset Data", action: resetData },
    { label: "Clear Cache", action: clearCache }
  ]}
/>
```

### 3. GlobalErrorHandler (`client/src/components/global-error-handler.tsx`)

**Purpose**: Sets up application-wide error handling.

**Features**:
- React Query error configuration
- Online/offline status handling
- Global fetch interception
- Automatic error logging

**Implementation**: Wraps the entire application in `App.tsx`.

### 4. PageErrorBoundary (`client/src/components/page-error-boundary.tsx`)

**Purpose**: Page-level error boundaries for route-specific error handling.

**Features**:
- Page-specific error context
- Navigation preservation
- Breadcrumb integration
- Route-aware recovery options

## Error Utilities

### Core Functions (`client/src/lib/error-utils.ts`)

#### `formatError(error, context?)`
Standardizes error formatting across the application.

```typescript
const formattedError = formatError(apiError, "User Registration");
// Returns: { title, description, details, code, recoverable, retryable }
```

#### `createEnhancedErrorHandler(options)`
Creates context-aware error handlers with retry logic.

```typescript
const errorHandler = createEnhancedErrorHandler({
  toast,
  context: "Project Creation",
  onUnauthorized: redirectToLogin,
  onRetry: retryOperation,
  userId: user.id
});
```

#### `logError(error, context?, userId?)`
Structured error logging with storage.

```typescript
const errorId = logError(error, "API Call", user.id);
// Stores in localStorage and console
```

#### `handleApiError(error, context, toast)`
Specialized API error handling.

```typescript
handleApiError(fetchError, "Loading Projects", toast);
// Shows appropriate user messages, logs details
```

### Error Type Checking

- `isAuthError(error)`: Detects authentication/authorization errors
- `isEmptyDataError(error)`: Identifies empty data scenarios
- `formatValidationErrors(errors)`: Formats validation error arrays

## Global Error Handling

### Setup (`setupGlobalErrorHandling`)

Automatically configured in `GlobalErrorHandler` component:

1. **Unhandled Promise Rejections**: Catches async errors
2. **JavaScript Errors**: Catches synchronous script errors
3. **Network Errors**: Intercepts fetch failures
4. **React Query Errors**: Configures retry logic and error handling

### Configuration

```typescript
// React Query Configuration
queryClient.setQueryDefaults(['global'], {
  retry: (failureCount, error) => {
    // Don't retry 4xx errors
    if (error?.status >= 400 && error?.status < 500) return false;
    return failureCount < 2;
  },
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
});
```

## WebSocket Stability & Management

### WebSocket Manager (`client/src/lib/websocket-manager.ts`)

**Purpose**: Provides robust WebSocket connection management with automatic reconnection and error handling.

**Features**:
- Singleton pattern for single connection instance
- Automatic reconnection with exponential backoff
- Connection state monitoring
- Event-driven architecture
- Memory leak prevention through proper cleanup

**Usage**:
```typescript
const wsManager = WebSocketManager.getInstance();

// Connect to WebSocket
wsManager.connect(url);

// Listen for events
wsManager.on('open', () => console.log('Connected'));
wsManager.on('message', (data) => handleMessage(data));
wsManager.on('error', (error) => handleError(error));

// Send messages
wsManager.send({ type: 'ping' });

// Cleanup
wsManager.disconnect();
```

### WebSocket Hook (`client/src/hooks/useWebSocket.ts`)

**Purpose**: React hook for WebSocket integration with component lifecycle management.

**Features**:
- Automatic connection management
- State synchronization with React
- Connection attempt tracking
- Error state management
- Cleanup on component unmount

**Implementation**:
```typescript
const {
  isConnected,
  lastMessage,
  connectionAttempts,
  lastError,
  sendMessage,
  disconnect,
  reconnect
} = useWebSocket();
```

### Connection Stability Monitoring

**Automatic Reconnection**:
- Exponential backoff: 1s, 2s, 4s, 8s, up to 30s
- Maximum 5 reconnection attempts
- Connection state persistence
- Page visibility detection for pause/resume

**Error Handling**:
- Connection failures logged with context
- User notifications for persistent issues
- Graceful degradation for offline scenarios

## Performance Monitoring

### Performance Utils (`client/src/lib/performance-utils.ts`)

**Purpose**: Comprehensive performance monitoring and optimization utilities.

**Features**:
- Page load time measurement
- API response time tracking
- Memory usage monitoring
- Resource optimization detection
- Performance metrics collection

**Usage**:
```typescript
import { 
  measurePageLoad,
  trackApiPerformance,
  monitorMemoryUsage,
  getPerformanceMetrics
} from '@/lib/performance-utils';

// Measure page load performance
const loadTime = measurePageLoad();

// Track API call performance
const apiMetrics = await trackApiPerformance(apiCall);

// Monitor memory usage
const memoryStats = monitorMemoryUsage();

// Get comprehensive metrics
const metrics = getPerformanceMetrics();
```

**Metrics Collected**:
- **Page Load Times**: First Contentful Paint, Largest Contentful Paint
- **API Performance**: Response times, success rates, error frequencies
- **Memory Usage**: Heap size, garbage collection frequency
- **Resource Loading**: Asset load times, cache hit rates

## Memory Management

### Memory Leak Prevention

**Error Log Management**:
- Automatic cleanup of old error logs (keeps last 10 entries)
- Size-based log rotation when localStorage exceeds limits
- Periodic cleanup of temporary objects

**Component Cleanup**:
- Proper WebSocket disconnection on unmount
- Event listener removal in useEffect cleanup
- React Query cache invalidation strategies

**Memory Monitoring**:
```typescript
// Check memory usage
const memoryInfo = performance.memory;
console.log('Used:', memoryInfo.usedJSHeapSize);
console.log('Total:', memoryInfo.totalJSHeapSize);
console.log('Limit:', memoryInfo.jsHeapSizeLimit);

// Automatic cleanup when threshold exceeded
if (memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit > 0.8) {
  performMemoryCleanup();
}
```

## EventEmitter Leak Prevention

### Listener Management

**Automatic Cleanup**:
- Maximum listeners set to reasonable limits
- Automatic removal of orphaned listeners
- Warning system for potential leaks

**Best Practices**:
```typescript
// Proper listener management
useEffect(() => {
  const handler = (data) => handleData(data);
  
  wsManager.on('message', handler);
  
  return () => {
    // Always cleanup listeners
    wsManager.off('message', handler);
  };
}, []);

// Set max listeners if needed
wsManager.setMaxListeners(15);
```

**Leak Detection**:
- Console warnings for exceeded listener limits
- Automatic reporting of potential memory leaks
- Performance impact assessment

## Database Performance Optimization

### Query Performance Monitoring

**Connection Management**:
- Connection pooling with size limits
- Connection acquisition/release tracking
- Pool health monitoring

**Query Optimization**:
```typescript
// Performance tracking for database queries
const startTime = performance.now();
const result = await db.query(sql);
const duration = performance.now() - startTime;

if (duration > 100) {
  console.warn(`Slow query detected: ${duration}ms`);
}
```

**Large Dataset Handling**:
- Pagination for large result sets
- Lazy loading for heavy queries
- Index optimization recommendations
- Query caching strategies

**Performance Metrics**:
- Average query response time
- Slow query detection (>100ms threshold)
- Connection pool utilization
- Database connection health checks

## Debugging Tools

### 1. Error Debug Page (`/error-debug`)

**Access**: Navigate to `/error-debug` or click "Error Testing" in development menu.

**Features**:
- Test different error types (500, 403, 404, network, validation)
- API endpoint testing
- Error log inspection
- Recovery flow testing

**Error Types Available**:
- **API Errors**: 500 (server), 403 (permission), 404 (not found)
- **Network Errors**: Connection failures, timeouts
- **Validation Errors**: Form validation with field details
- **JavaScript Errors**: Unhandled exceptions

### 2. Error Logging System

**Storage**: Errors are stored in `localStorage` under `app_errors` key.

**Access Methods**:
```javascript
// View in browser console
const errors = JSON.parse(localStorage.getItem('app_errors') || '[]');

// Use debug page "Show Error Logs in Console" button
```

**Log Structure**:
```json
{
  "id": "err_1640995200000_abc123",
  "timestamp": "2023-12-31T23:59:59.999Z",
  "context": "Project Creation",
  "userId": "user_123",
  "message": "Validation failed",
  "stack": "Error stack trace...",
  "status": 422,
  "details": { "field": "email", "message": "Invalid format" },
  "url": "https://app.com/projects/create",
  "userAgent": "Mozilla/5.0..."
}
```

### 3. Server-Side Error Logging

**Location**: `server/index.ts` - Global error middleware

**Features**:
- Request context logging (method, URL, headers, body)
- Session information (user ID, role, email)
- Specialized logging for email and template errors
- Development vs production error details

**Log Format**:
```json
{
  "timestamp": "2023-12-31T23:59:59.999Z",
  "method": "POST",
  "url": "/api/projects",
  "status": 500,
  "message": "Database connection failed",
  "stack": "...",
  "body": { "projectData": "..." },
  "sessionInfo": {
    "userId": "user_123",
    "userRole": "admin",
    "userEmail": "user@example.com"
  }
}
```

## Error Recovery Patterns

### 1. Automatic Retry

```typescript
// Network errors with exponential backoff
handleNetworkError(error, {
  toast,
  onRetry: () => refetchData(),
  maxRetries: 3,
  retryCount: 0
});
```

### 2. User-Initiated Retry

```typescript
// Component state management
const [error, setError] = useState(null);
const [isRetrying, setIsRetrying] = useState(false);

const handleRetry = async () => {
  setIsRetrying(true);
  setError(null);
  try {
    await retryOperation();
  } catch (newError) {
    setError(newError);
  } finally {
    setIsRetrying(false);
  }
};
```

### 3. Graceful Degradation

```typescript
// Handle empty data gracefully
if (isEmptyDataError(error)) {
  return <EmptyState message="No data available" />;
}

// Fallback content for errors
if (error) {
  return <ErrorRecovery error={error} onRetry={handleRetry} />;
}
```

## Logging System

### Client-Side Logging

**Storage**: Last 10 errors in `localStorage`
**Console**: All errors with structured format
**Format**: `[ERROR ${errorId}] ${structuredData}`

### Server-Side Logging

**Console Output**: JSON formatted error objects
**Special Patterns**: Email and template errors flagged separately
**Request Tracing**: Full request context included

### Log Analysis

```javascript
// Get error statistics
const errors = JSON.parse(localStorage.getItem('app_errors') || '[]');
const errorsByContext = errors.reduce((acc, error) => {
  acc[error.context] = (acc[error.context] || 0) + 1;
  return acc;
}, {});
```

## Development vs Production

### Development Features

- **Detailed Error Stack Traces**: Full error information displayed
- **Error Debug Page**: Available at `/error-debug`
- **Console Verbose Logging**: All error details logged
- **Source Maps**: Original file locations in stack traces

### Production Safeguards

- **Sanitized Error Messages**: Generic messages for server errors
- **Error ID Generation**: Trackable error references
- **Contact Information**: Support email integration
- **Performance Logging**: Request timing and performance metrics

### Environment Detection

```typescript
if (process.env.NODE_ENV === 'development') {
  response.details = {
    stack: err.stack,
    timestamp: errorDetails.timestamp,
    errorId: generateErrorId()
  };
}
```

## Testing Error Scenarios

### Using the Error Debug Page

1. **Navigate** to `/error-debug`
2. **Test Error Types**:
   - Click buttons to trigger different error scenarios
   - Observe error handling behavior
   - Check console for logging output
3. **Test API Endpoints**:
   - Use "Test All API Endpoints" button
   - Check browser network tab for response details
4. **Review Error Logs**:
   - Use "Show Error Logs in Console" button
   - Inspect localStorage for stored errors

### Manual Testing

```typescript
// Trigger specific error types in components
throw new Error('Test error for debugging');

// Test API error handling
const response = await fetch('/api/nonexistent');
if (!response.ok) {
  throw new Error(`API Error: ${response.status}`);
}

// Test validation errors
const validationError = new Error('Validation failed');
validationError.status = 422;
validationError.details = [
  { path: 'email', message: 'Invalid email format' }
];
throw validationError;
```

## Troubleshooting Common Issues

### 1. "White Screen of Death"

**Symptoms**: Blank page, no content rendered
**Causes**: Unhandled JavaScript errors in React components
**Solution**: Check browser console for error messages, look for ErrorBoundary logs

### 2. API Request Failures

**Symptoms**: Toast notifications showing "Server Error"
**Debugging**:
1. Check Network tab in browser DevTools
2. Look for error logs in server console
3. Verify error context in localStorage

### 3. Authentication Errors

**Symptoms**: Repeated redirects, "Permission Denied" messages
**Debugging**:
1. Check session state in browser Application tab
2. Look for `isAuthError` logs
3. Verify token expiration

### 4. Empty Data States

**Symptoms**: "No data found" messages
**Debugging**:
1. Check if `isEmptyDataError` is triggered
2. Verify API endpoint responses
3. Check data transformation logic

### 5. Memory Issues

**Symptoms**: Slow performance, browser crashes
**Debugging**:
1. Check localStorage size (`app_errors`)
2. Monitor console for memory warnings
3. Clear error logs if necessary
4. Use Performance Utils to monitor memory usage
5. Check for EventEmitter memory leaks

### 6. Network Connectivity

**Symptoms**: Intermittent failures, offline messages
**Debugging**:
1. Check `navigator.onLine` status
2. Look for "Connection Lost" toast messages
3. Verify network request patterns

### 7. WebSocket Connection Issues

**Symptoms**: Real-time updates not working, frequent disconnections
**Debugging**:
1. Check WebSocket connection logs in console
2. Look for "WebSocket connected/disconnected" messages
3. Verify WebSocket URL and accessibility
4. Check for network proxy or firewall issues

**Common Solutions**:
- WebSocket Manager automatically handles reconnection
- Check browser console for connection attempt logs
- Verify server WebSocket endpoint is accessible

### 8. Database Performance Issues

**Symptoms**: Slow page loads, timeouts on data-heavy pages
**Debugging**:
1. Monitor database connection acquisition/release logs
2. Check for "Slow query detected" warnings in console
3. Review connection pool utilization
4. Analyze query patterns for optimization opportunities

**Solutions**:
- Implement pagination for large datasets
- Add database indexes for frequently queried fields
- Optimize complex queries with JOIN operations

### 9. EventEmitter Memory Leaks

**Symptoms**: Console warnings about MaxListenersExceeded
**Debugging**:
1. Look for "MaxListenersExceededWarning" in console
2. Check component cleanup in useEffect return functions
3. Verify proper event listener removal

**Solutions**:
- Always remove event listeners in cleanup functions
- Use AbortController for fetch requests
- Implement proper WebSocket cleanup

### 10. Multiple Initialization Issues

**Symptoms**: Components initializing multiple times, duplicate API calls
**Debugging**:
1. Check for multiple i18next initialization logs
2. Look for duplicate component mounting
3. Verify React Query cache behavior

**Solutions**:
- Use initialization guards to prevent multiple setups
- Implement proper dependency arrays in useEffect
- Use React Query's stale-while-revalidate strategy

## Best Practices

### For Developers

1. **Always use error boundaries** around major component sections
2. **Provide context** when calling error utilities
3. **Include user ID** in error logs when available
4. **Test error scenarios** during development
5. **Use structured error handling** for predictable error types

### For Error Messages

1. **User-friendly language**: Avoid technical jargon
2. **Actionable information**: Tell users what they can do
3. **Contact information**: Provide support channels
4. **Error IDs**: Include trackable references

### For Logging

1. **Include context**: What operation was being performed
2. **Structured data**: Use consistent log formats
3. **Sensitive data**: Never log passwords or tokens
4. **Performance impact**: Consider log volume in production

## Integration Points

### React Query Integration

Error handling is integrated with React Query for:
- Automatic retry logic
- Cache invalidation on errors
- Background refetching
- Optimistic updates rollback

### Toast Notifications

All error handlers can display toast notifications:
- Consistent styling and positioning
- Action buttons for retry operations
- Automatic dismissal timers
- Queue management for multiple errors

### Routing Integration

Error boundaries work with React Router:
- Page-level error isolation
- Navigation preservation
- Route-specific error contexts
- Breadcrumb maintenance

## Monitoring and Alerting

### Client-Side Monitoring

- Error frequency tracking
- User session correlation
- Performance impact assessment
- Browser compatibility issues

### Server-Side Monitoring

- Error rate thresholds
- Response time monitoring
- Database connection health
- API endpoint reliability

This comprehensive error handling system ensures robust application behavior and provides developers with the tools needed to quickly identify and resolve issues.

## Additional Documentation

For more detailed information about specific performance and stability topics, refer to these additional guides:

- **[Performance Monitoring Guide](performance-monitoring-guide.md)**: Comprehensive performance monitoring and optimization strategies
- **[WebSocket Stability Guide](websocket-stability-guide.md)**: Detailed WebSocket management and troubleshooting
- **[Memory Management Guide](memory-management-guide.md)**: Memory leak prevention and optimization techniques

These guides work together to provide a complete picture of the application's stability and performance infrastructure.
