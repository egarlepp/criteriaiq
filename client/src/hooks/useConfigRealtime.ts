/**
 * Real-time Configuration Updates Hook
 * Listens for WebSocket events related to configuration changes and triggers data refreshes
 */
import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from './useWebSocket';

interface ConfigUpdateEvent {
  type: 'config_update';
  action: 'created' | 'updated' | 'deleted';
  configType: 'customer_status' | 'project_status' | 'end_date_flag' | 'industry' | 'tag' | 'role';
  configId?: number;
  userId: string;
  data: any;
  timestamp: string;
}

interface UseConfigRealtimeOptions {
  configType?: ConfigUpdateEvent['configType'] | ConfigUpdateEvent['configType'][];
  onUpdate?: (event: ConfigUpdateEvent) => void;
}

export function useConfigRealtime({ configType, onUpdate }: UseConfigRealtimeOptions = {}) {
  const queryClient = useQueryClient();
  const { lastMessage, isConnected } = useWebSocket();

  const handleConfigUpdate = useCallback((event: ConfigUpdateEvent) => {
    console.log('Received config real-time update:', event);

    // If configType is specified, only handle updates for that type
    if (configType) {
      const types = Array.isArray(configType) ? configType : [configType];
      if (!types.includes(event.configType)) {
        return;
      }
    }

    // Invalidate relevant queries based on the config type
    switch (event.configType) {
      case 'customer_status':
        // Invalidate all queries that use customer status configs
        queryClient.invalidateQueries({ queryKey: ['/api/customer-status-configs'] });
        // Also invalidate project lists that might display customer status
        queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
        break;
      case 'project_status':
        queryClient.invalidateQueries({ queryKey: ['/api/status-configs'] });
        queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
        break;
      case 'end_date_flag':
        queryClient.invalidateQueries({ queryKey: ['/api/end-date-flag-configs'] });
        queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
        break;
      case 'industry':
        queryClient.invalidateQueries({ queryKey: ['/api/industry-configs'] });
        queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
        break;
      case 'tag':
        queryClient.invalidateQueries({ queryKey: ['/api/tag-configs'] });
        queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
        break;
      case 'role':
        queryClient.invalidateQueries({ queryKey: ['/api/roles'] });
        queryClient.invalidateQueries({ queryKey: ['/api/users'] });
        break;
    }

    // Call the optional update callback
    if (onUpdate) {
      onUpdate(event);
    }
  }, [configType, queryClient, onUpdate]);

  useEffect(() => {
    if (lastMessage && typeof lastMessage === 'object') {
      // Check if this is a config update event
      if (lastMessage.type === 'config_update') {
        handleConfigUpdate(lastMessage as ConfigUpdateEvent);
      }
    }
  }, [lastMessage, handleConfigUpdate]);

  return {
    isConnected,
    handleConfigUpdate
  };
}

/**
 * Hook specifically for customer status config updates
 */
export function useCustomerStatusConfigRealtime(onUpdate?: (event: ConfigUpdateEvent) => void) {
  return useConfigRealtime({
    configType: 'customer_status',
    onUpdate
  });
}

/**
 * Hook specifically for project status config updates
 */
export function useProjectStatusConfigRealtime(onUpdate?: (event: ConfigUpdateEvent) => void) {
  return useConfigRealtime({
    configType: 'project_status',
    onUpdate
  });
}

/**
 * Hook specifically for role config updates
 */
export function useRoleConfigRealtime(onUpdate?: (event: ConfigUpdateEvent) => void) {
  return useConfigRealtime({
    configType: 'role',
    onUpdate
  });
}
