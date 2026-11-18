import { useEffect, useState, useCallback, useRef } from 'react';
import { WebSocketManager } from '@/lib/websocket-manager';

export interface WebSocketHook {
  isConnected: boolean;
  lastMessage: any;
  connectionAttempts: number;
  lastError: string | null;
  sendMessage: (data: any) => void;
  disconnect: () => void;
  reconnect: () => void;
}

export function useWebSocket(url?: string): WebSocketHook {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const wsManagerRef = useRef<WebSocketManager | null>(null);

  useEffect(() => {
    if (!wsManagerRef.current) {
      wsManagerRef.current = WebSocketManager.getInstance();
    }
    const wsManager = wsManagerRef.current;

    const handleOpen = () => {
      setIsConnected(true);
      setConnectionAttempts(0);
      setLastError(null);
    };

    const handleClose = (event?: { code: number; reason: string }) => {
      setIsConnected(false);
      if (event?.code === 1006) {
        setLastError('Connection lost unexpectedly');
      } else if (event?.code !== 1000) {
        setLastError(`Connection closed: ${event?.reason || 'Unknown reason'}`);
      }
    };

    const handleMessage = (data: any) => setLastMessage(data);

    const handleError = (error: any) => {
      setLastError(error?.message || 'WebSocket error occurred');
      setConnectionAttempts(prev => prev + 1);
    };

    wsManager.on('open', handleOpen);
    wsManager.on('close', handleClose);
    wsManager.on('message', handleMessage);
    wsManager.on('error', handleError);

    // Connect — if already open the manager will skip reconnection and we
    // sync state here so late-mounting components reflect the live connection.
    wsManager.connect();
    if (wsManager.isOpen()) {
      setIsConnected(true);
    }

    return () => {
      wsManager.off('open', handleOpen);
      wsManager.off('close', handleClose);
      wsManager.off('message', handleMessage);
      wsManager.off('error', handleError);
    };
  }, []);

  const sendMessage = useCallback((message: any) => {
    if (wsManagerRef.current) {
      wsManagerRef.current.send(message);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (wsManagerRef.current) {
      wsManagerRef.current.disconnect();
    }
  }, []);

  const reconnect = useCallback(() => {
    setConnectionAttempts(0);
    setLastError(null);
    if (wsManagerRef.current) {
      wsManagerRef.current.reconnect();
    }
  }, []);

  return {
    isConnected,
    lastMessage,
    connectionAttempts,
    lastError,
    sendMessage,
    disconnect,
    reconnect,
  };
}