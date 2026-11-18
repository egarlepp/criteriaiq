
/**
 * Guards against multiple initializations of global services
 */

interface InitializationState {
  errorHandling: boolean;
  i18n: boolean;
  webSocket: boolean;
  performanceMonitoring: boolean;
}

class InitializationGuard {
  private static instance: InitializationGuard;
  private state: InitializationState = {
    errorHandling: false,
    i18n: false,
    webSocket: false,
    performanceMonitoring: false
  };

  static getInstance(): InitializationGuard {
    if (!InitializationGuard.instance) {
      InitializationGuard.instance = new InitializationGuard();
    }
    return InitializationGuard.instance;
  }

  canInitialize(service: keyof InitializationState): boolean {
    return !this.state[service];
  }

  markInitialized(service: keyof InitializationState): void {
    this.state[service] = true;
  }

  reset(service?: keyof InitializationState): void {
    if (service) {
      this.state[service] = false;
    } else {
      // Reset all
      Object.keys(this.state).forEach(key => {
        this.state[key as keyof InitializationState] = false;
      });
    }
  }

  getState(): InitializationState {
    return { ...this.state };
  }
}

export const initGuard = InitializationGuard.getInstance();

/**
 * Decorator function to prevent multiple initializations
 */
export function preventMultipleInit<T extends (...args: any[]) => any>(
  service: keyof InitializationState,
  fn: T
): T {
  return ((...args: any[]) => {
    if (!initGuard.canInitialize(service)) {
      console.log(`${service} already initialized, skipping...`);
      return;
    }
    
    initGuard.markInitialized(service);
    return fn(...args);
  }) as T;
}
