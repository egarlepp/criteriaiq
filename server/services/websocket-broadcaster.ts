/**
 * WebSocket Broadcasting Utilities for Real-time MAP Updates
 */
import { WebSocketServer } from 'ws';
import WebSocket from 'ws';

export interface MapUpdateEvent {
  type: 'map_update';
  action: 'created' | 'updated' | 'deleted' | 'status_changed' | 'cascade_complete';
  targetType: 'map_phase' | 'map_step' | 'map_task' | 'map_project';
  targetId: number;
  projectId: number;
  userId: string;
  data: any;
  timestamp: string;
}

export interface ConfigUpdateEvent {
  type: 'config_update';
  action: 'created' | 'updated' | 'deleted';
  configType: 'customer_status' | 'project_status' | 'end_date_flag' | 'industry' | 'tag';
  configId?: number;
  userId: string;
  data: any;
  timestamp: string;
}

export interface CelebrationEvent {
  type: 'celebration';
  style: string;
  config: Record<string, any>;
  timestamp: string;
}

export interface EmailAutomationUpdateEvent {
  type: 'email_automation_update';
  action: 'execution_created' | 'rule_updated' | 'trigger_updated';
  targetType: 'email_rule_audit' | 'email_rule' | 'email_trigger';
  targetId?: number;
  userId: string;
  data: any;
  timestamp: string;
}

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  userRole?: string;
  userEmail?: string;
  authorizedProjects?: Set<number>;
}

export class WebSocketBroadcaster {
  private wss: WebSocketServer;

  constructor(wss: WebSocketServer) {
    this.wss = wss;
  }

  /**
   * Broadcast MAP updates to authorized connected clients only
   */
  broadcastMapUpdate(event: Omit<MapUpdateEvent, 'timestamp'>): void {
    const message: MapUpdateEvent = {
      ...event,
      timestamp: new Date().toISOString()
    };

    console.log(`Broadcasting MAP update to authorized clients:`, {
      type: message.type,
      action: message.action,
      targetType: message.targetType,
      targetId: message.targetId,
      projectId: message.projectId
    });

    let broadcastCount = 0;

    // Broadcast only to authenticated clients with access to the project
    this.wss.clients.forEach((client: AuthenticatedWebSocket) => {
      if (client.readyState === 1 && this.hasProjectAccess(client, event.projectId)) {
        try {
          client.send(JSON.stringify(message));
          broadcastCount++;
        } catch (error) {
          console.error('Error broadcasting WebSocket message:', error);
        }
      }
    });

    console.log(`MAP update broadcast sent to ${broadcastCount} authorized clients`);
  }

  /**
   * Check if a WebSocket client has access to a specific project
   */
  private hasProjectAccess(client: AuthenticatedWebSocket, projectId: number): boolean {
    // If not authenticated, no access
    if (!client.userId || !client.authorizedProjects) {
      return false;
    }

    // Check if project is in authorized projects set
    return client.authorizedProjects.has(projectId);
  }

  /**
   * Set authentication and project access for a WebSocket client
   */
  setClientAuth(client: AuthenticatedWebSocket, userId: string, userRole: string, userEmail: string, authorizedProjects: Set<number>): void {
    client.userId = userId;
    client.userRole = userRole;
    client.userEmail = userEmail;
    client.authorizedProjects = authorizedProjects;

    console.log(`WebSocket client authenticated: ${userEmail} with access to ${authorizedProjects.size} projects`);
  }

  /**
   * Forcibly close every open WebSocket connection belonging to a
   * specific user. Used by /api/logout (and the SESSION_SECRET
   * rotation path) so that broadcasts stop reaching a session whose
   * cookie has been invalidated. Without this the WS connection
   * outlives the session — the broadcaster kept matching the (now
   * revoked) userId and pushing map updates until the browser tab
   * closed. Architect security review finding #16.
   *
   * Returns the number of sockets that were closed so callers can log it.
   */
  disconnectUser(userId: string, reason = "Session terminated"): number {
    let closed = 0;
    this.wss.clients.forEach((client: AuthenticatedWebSocket) => {
      if (client.userId === userId) {
        try {
          // 1008 = "Policy Violation" — the same code we use elsewhere
          // for auth-related disconnects.
          client.close(1008, reason);
          closed++;
        } catch (err) {
          console.error("[WebSocketBroadcaster] disconnectUser close error:", err);
        }
      }
    });
    if (closed > 0) {
      console.log(`[WebSocketBroadcaster] terminated ${closed} WebSocket(s) for user=${userId} (${reason})`);
    }
    return closed;
  }

  /**
   * Broadcast phase updates
   */
  broadcastPhaseUpdate(action: MapUpdateEvent['action'], phase: any, userId: string): void {
    this.broadcastMapUpdate({
      type: 'map_update',
      action,
      targetType: 'map_phase',
      targetId: phase.id,
      projectId: phase.projectId,
      userId,
      data: {
        phase: {
          id: phase.id,
          name: phase.name,
          status: phase.status,
          order: phase.order,
          startDate: phase.startDate,
          endDate: phase.endDate
        }
      }
    });
  }

  /**
   * Broadcast step updates
   */
  broadcastStepUpdate(action: MapUpdateEvent['action'], step: any, userId: string): void {
    this.broadcastMapUpdate({
      type: 'map_update',
      action,
      targetType: 'map_step',
      targetId: step.id,
      projectId: step.projectId,
      userId,
      data: {
        step: {
          id: step.id,
          name: step.name,
          status: step.status,
          order: step.order,
          phaseId: step.phaseId,
          startDate: step.startDate,
          endDate: step.endDate
        }
      }
    });
  }

  /**
   * Broadcast task updates
   */
  broadcastTaskUpdate(action: MapUpdateEvent['action'], task: any, userId: string): void {
    this.broadcastMapUpdate({
      type: 'map_update',
      action,
      targetType: 'map_task',
      targetId: task.id,
      projectId: task.projectId,
      userId,
      data: {
        task: {
          id: task.id,
          name: task.name,
          status: task.status,
          priority: task.priority,
          stepId: task.stepId,
          assignedTo: task.assignedTo,
          startDate: task.startDate,
          endDate: task.endDate
        }
      }
    });
  }

  /**
   * Broadcast project MAP updates (when entire MAP is created/updated)
   */
  broadcastProjectMapUpdate(action: MapUpdateEvent['action'], projectId: number, userId: string, data: any): void {
    this.broadcastMapUpdate({
      type: 'map_update',
      action,
      targetType: 'map_project',
      targetId: projectId,
      projectId,
      userId,
      data
    });
  }

  /**
   * Broadcast configuration updates to all authenticated clients
   */
  broadcastConfigUpdate(event: Omit<ConfigUpdateEvent, 'timestamp'>): void {
    const message: ConfigUpdateEvent = {
      ...event,
      timestamp: new Date().toISOString()
    };

    console.log(`Broadcasting config update to all authenticated clients:`, {
      type: message.type,
      action: message.action,
      configType: message.configType,
      configId: message.configId
    });

    let broadcastCount = 0;

    // Broadcast to all authenticated clients (config changes affect everyone)
    this.wss.clients.forEach((client: AuthenticatedWebSocket) => {
      if (client.readyState === 1 && client.userId) {
        try {
          client.send(JSON.stringify(message));
          broadcastCount++;
        } catch (error) {
          console.error('Error broadcasting config WebSocket message:', error);
        }
      }
    });

    console.log(`Config update broadcast sent to ${broadcastCount} authenticated clients`);
  }

  /**
   * Broadcast email automation updates to all authenticated clients
   */
  broadcastEmailAutomationUpdate(event: Omit<EmailAutomationUpdateEvent, 'timestamp'>): void {
    const message: EmailAutomationUpdateEvent = {
      ...event,
      timestamp: new Date().toISOString()
    };

    console.log(`Broadcasting email automation update to all authenticated clients:`, {
      type: message.type,
      action: message.action,
      targetType: message.targetType,
      targetId: message.targetId
    });

    let broadcastCount = 0;

    // Broadcast to all authenticated clients
    this.wss.clients.forEach((client: AuthenticatedWebSocket) => {
      if (client.readyState === 1 && client.userId) {
        try {
          client.send(JSON.stringify(message));
          broadcastCount++;
        } catch (error) {
          console.error('Error broadcasting email automation WebSocket message:', error);
        }
      }
    });

    console.log(`Email automation update broadcast sent to ${broadcastCount} authenticated clients`);
  }

  /**
   * Broadcast a celebration effect to all authenticated clients
   */
  broadcastCelebration(style: string, config: Record<string, any>): void {
    const message: CelebrationEvent = {
      type: 'celebration',
      style,
      config,
      timestamp: new Date().toISOString(),
    };

    let broadcastCount = 0;

    this.wss.clients.forEach((client: AuthenticatedWebSocket) => {
      if (client.readyState === 1 && client.userId) {
        try {
          client.send(JSON.stringify(message));
          broadcastCount++;
        } catch (error) {
          console.error('Error broadcasting celebration WebSocket message:', error);
        }
      }
    });

    console.log(`Celebration broadcast sent to ${broadcastCount} authenticated clients (style: ${style})`);
  }
}

// Singleton instance will be initialized in routes.ts
export let broadcaster: WebSocketBroadcaster | null = null;

export function initializeBroadcaster(wss: WebSocketServer): void {
  broadcaster = new WebSocketBroadcaster(wss);
  console.log('WebSocket broadcaster initialized');
}

export function getBroadcaster(): WebSocketBroadcaster | null {
  return broadcaster;
}