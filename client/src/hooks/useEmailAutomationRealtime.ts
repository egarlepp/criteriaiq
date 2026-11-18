/**
 * Real-time Email Automation Updates Hook
 * Listens for WebSocket events related to email automation execution and triggers data refreshes
 */
import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from './useWebSocket';

interface EmailAutomationUpdateEvent {
  type: 'email_automation_update';
  action: 'execution_created' | 'rule_updated' | 'trigger_updated';
  targetType: 'email_rule_audit' | 'email_rule' | 'email_trigger';
  targetId?: number;
  userId: string;
  data: any;
  timestamp: string;
}

interface UseEmailAutomationRealtimeOptions {
  onUpdate?: (event: EmailAutomationUpdateEvent) => void;
}

export function useEmailAutomationRealtime({ onUpdate }: UseEmailAutomationRealtimeOptions = {}) {
  const queryClient = useQueryClient();
  const { lastMessage, isConnected } = useWebSocket();

  const handleEmailAutomationUpdate = useCallback((event: EmailAutomationUpdateEvent) => {
    console.log('Received email automation real-time update:', event);

    // Invalidate relevant queries based on the update type
    const queryKeysToInvalidate = [];

    switch (event.targetType) {
      case 'email_rule_audit':
        // New execution audit created - refresh diagnostics and schedules
        queryKeysToInvalidate.push(['/api/email-automation/executions']);
        queryKeysToInvalidate.push(['/api/email-automation/schedules']);
        queryKeysToInvalidate.push(['/api/email-automation/stats']);
        break;
      case 'email_rule':
        // Rule updated - refresh rules list
        queryKeysToInvalidate.push(['/api/email-automation/rules']);
        queryKeysToInvalidate.push(['/api/email-automation/executions']);
        break;
      case 'email_trigger':
        // Trigger updated - refresh triggers list
        queryKeysToInvalidate.push(['/api/email-automation/triggers']);
        queryKeysToInvalidate.push(['/api/email-automation/executions']);
        break;
    }

    // Invalidate all relevant queries
    queryKeysToInvalidate.forEach((queryKey) => {
      queryClient.invalidateQueries({ queryKey });
    });

    // Call the optional update callback
    if (onUpdate) {
      onUpdate(event);
    }
  }, [queryClient, onUpdate]);

  useEffect(() => {
    if (lastMessage && typeof lastMessage === 'object') {
      // Check if this is an email automation update event
      if (lastMessage.type === 'email_automation_update') {
        handleEmailAutomationUpdate(lastMessage as EmailAutomationUpdateEvent);
      }
    }
  }, [lastMessage, handleEmailAutomationUpdate]);

  return {
    isConnected,
    handleEmailAutomationUpdate
  };
}
