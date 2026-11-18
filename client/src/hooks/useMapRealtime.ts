/**
 * Real-time MAP Updates Hook
 * Listens for WebSocket events related to MAP changes and triggers data refreshes
 */
import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from './useWebSocket';

interface MapUpdateEvent {
  type: 'map_update';
  action: 'created' | 'updated' | 'deleted' | 'status_changed' | 'cascade_complete';
  targetType: 'map_phase' | 'map_step' | 'map_task' | 'map_project';
  targetId: number;
  projectId: number;
  userId: string;
  data: any;
  timestamp: string;
}

interface UseMapRealtimeOptions {
  projectId?: number | null;
  onUpdate?: (event: MapUpdateEvent) => void;
}

// Debounce timers map to prevent rapid successive invalidations per project
const invalidationTimers = new Map<number, NodeJS.Timeout>();

// Event deduplication: Track processed events to prevent duplicate handling
const processedEvents = new Set<string>();
const eventCleanupTimers = new Map<string, NodeJS.Timeout>();

// Generate unique fingerprint for event deduplication
// Includes hookProjectId to scope deduplication per hook instance (global vs project-specific)
function getEventFingerprint(event: MapUpdateEvent, hookProjectId?: number | null): string {
  const scope = hookProjectId ?? 'GLOBAL';
  return `${event.type}-${event.action}-${event.targetType}-${event.targetId}-${event.timestamp}-${scope}`;
}

export function useMapRealtime({ projectId, onUpdate }: UseMapRealtimeOptions = {}) {
  const queryClient = useQueryClient();
  const { lastMessage, isConnected } = useWebSocket();

  const handleMapUpdate = useCallback((event: MapUpdateEvent) => {
    // If projectId is specified, only handle updates for that project
    // IMPORTANT: This filter must run BEFORE deduplication to prevent cross-project event blocking
    if (projectId && event.projectId !== projectId) {
      return;
    }

    // Generate unique fingerprint for this event (scoped by hook's projectId context)
    const fingerprint = getEventFingerprint(event, projectId);
    
    // Check if event already processed (deduplication)
    if (processedEvents.has(fingerprint)) {
      console.log('⚠️ Blocked duplicate MAP event:', fingerprint);
      return;
    }
    
    // Mark event as processed
    processedEvents.add(fingerprint);
    console.log('✅ Processing MAP real-time update:', event);
    
    // Schedule cleanup of this event fingerprint after 5 seconds
    const cleanupTimer = setTimeout(() => {
      processedEvents.delete(fingerprint);
      eventCleanupTimers.delete(fingerprint);
    }, 5000);
    eventCleanupTimers.set(fingerprint, cleanupTimer);

    // Handle cascade_complete action with debounced invalidation
    if (event.action === 'cascade_complete') {
      console.log(`Cascade complete: ${event.data?.count || 0} ${event.data?.entity || 'entities'} updated`);
      
      // Debounce invalidation to prevent rapid successive calls
      if (event.projectId) {
        // Clear existing timer for this project
        if (invalidationTimers.has(event.projectId)) {
          clearTimeout(invalidationTimers.get(event.projectId)!);
        }
        
        // Set new timer - invalidate after 100ms of no new events
        const timer = setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['/api/projects', event.projectId, 'map'] });
          invalidationTimers.delete(event.projectId);
        }, 100);
        
        invalidationTimers.set(event.projectId, timer);
      }
      
      // Call the optional update callback
      if (onUpdate) {
        onUpdate(event);
      }
      return;
    }

    // Standard handling for individual updates with debouncing
    if (event.projectId) {
      // Clear existing timer for this project
      if (invalidationTimers.has(event.projectId)) {
        clearTimeout(invalidationTimers.get(event.projectId)!);
      }
      
      // Set new timer - invalidate after 100ms of no new events
      const timer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/projects', event.projectId, 'map'] });
        queryClient.invalidateQueries({ queryKey: ['project-activities', event.projectId] });
        invalidationTimers.delete(event.projectId);
      }, 100);
      
      invalidationTimers.set(event.projectId, timer);
    }

    // Call the optional update callback
    if (onUpdate) {
      onUpdate(event);
    }
  }, [projectId, queryClient, onUpdate]);

  useEffect(() => {
    if (lastMessage && typeof lastMessage === 'object') {
      // Check if this is a MAP update event
      if (lastMessage.type === 'map_update') {
        handleMapUpdate(lastMessage as MapUpdateEvent);
      }
    }
  }, [lastMessage, handleMapUpdate]);

  return {
    isConnected,
    handleMapUpdate
  };
}

/**
 * Hook specifically for MAP activity timeline real-time updates
 */
export function useMapActivityRealtime(projectId?: number | null) {
  const queryClient = useQueryClient();

  return useMapRealtime({
    projectId,
    onUpdate: (event) => {
      // Specifically invalidate activity queries for timeline updates
      if (event.projectId) {
        queryClient.invalidateQueries({ 
          queryKey: ['project-activities', event.projectId] 
        });
      }
    }
  });
}

/**
 * Hook for MAP dashboard real-time updates
 */
export function useMapDashboardRealtime() {
  const queryClient = useQueryClient();

  return useMapRealtime({
    onUpdate: (event) => {
      // Invalidate dashboard-related queries
      queryClient.invalidateQueries({ queryKey: ['map-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    }
  });
}
