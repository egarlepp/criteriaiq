
/**
 * Performance monitoring utilities for tracking slow operations
 */

interface PerformanceMetric {
  operation: string;
  duration: number;
  timestamp: string;
  context?: unknown;
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetric[] = [];
  private readonly maxMetrics = 100;
  private readonly slowQueryThreshold = 1000; // 1 second

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Start timing an operation. The returned function accepts an optional
   * context object that will be attached to the recorded metric.
   */
  startTiming(operation: string): (context?: unknown) => void {
    const startTime = performance.now();

    return (context?: unknown) => {
      const duration = performance.now() - startTime;
      this.recordMetric(operation, duration, context);
    };
  }

  /**
   * Record a performance metric
   */
  private recordMetric(operation: string, duration: number, context?: unknown) {
    const metric: PerformanceMetric = {
      operation,
      duration,
      timestamp: new Date().toISOString(),
      context
    };

    this.metrics.unshift(metric);
    
    // Keep only the most recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(0, this.maxMetrics);
    }

    // Log slow operations
    if (duration > this.slowQueryThreshold) {
      console.warn(`Slow operation detected: ${operation} took ${Math.round(duration)}ms`, {
        operation,
        duration,
        context
      });
    }
  }

  /**
   * Get performance metrics for analysis
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * Get slow operations (above threshold)
   */
  getSlowOperations(): PerformanceMetric[] {
    return this.metrics.filter(metric => metric.duration > this.slowQueryThreshold);
  }

  /**
   * Get average duration for an operation
   */
  getAverageDuration(operation: string): number {
    const operationMetrics = this.metrics.filter(m => m.operation === operation);
    if (operationMetrics.length === 0) return 0;
    
    const total = operationMetrics.reduce((sum, metric) => sum + metric.duration, 0);
    return total / operationMetrics.length;
  }

  /**
   * Clear all metrics
   */
  clearMetrics() {
    this.metrics = [];
  }
}

/**
 * Hook for monitoring API call performance
 */
export function usePerformanceMonitor() {
  const monitor = PerformanceMonitor.getInstance();

  const monitorApiCall = async <T>(
    operation: string,
    apiCall: () => Promise<T>,
    context?: Record<string, unknown>
  ): Promise<T> => {
    const endTiming = monitor.startTiming(operation);

    try {
      const result = await apiCall();
      endTiming({ ...context, success: true });
      return result;
    } catch (error) {
      endTiming({
        ...context,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  return {
    monitorApiCall,
    getMetrics: () => monitor.getMetrics(),
    getSlowOperations: () => monitor.getSlowOperations(),
    getAverageDuration: (operation: string) => monitor.getAverageDuration(operation),
    clearMetrics: () => monitor.clearMetrics()
  };
}

/**
 * Memory usage monitoring
 */
export function getMemoryUsage() {
  if ('memory' in performance) {
    const memory = (performance as any).memory;
    return {
      used: Math.round(memory.usedJSHeapSize / 1024 / 1024),
      total: Math.round(memory.totalJSHeapSize / 1024 / 1024),
      limit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024),
      percentage: Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100)
    };
  }
  return null;
}

/**
 * Monitor for EventEmitter memory leaks in the browser
 */
export function detectEventListenerLeaks() {
  const listeners = {
    window: 0,
    document: 0,
    body: 0
  };

  // Count listeners on common objects
  try {
    if (typeof window !== 'undefined') {
      listeners.window = Object.keys((window as any)._events || {}).length;
    }
    if (typeof document !== 'undefined') {
      listeners.document = Object.keys((document as any)._events || {}).length;
    }
    if (typeof document !== 'undefined' && document.body) {
      listeners.body = Object.keys((document.body as any)._events || {}).length;
    }
  } catch (e) {
    console.warn('Could not detect event listeners:', e);
  }

  return listeners;
}
