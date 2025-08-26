import { useEffect, useState, useCallback, useRef } from 'react';

interface LogEntry {
  id: string;
  level: string;
  message: string;
  timestamp: string;
  service?: string;
}

interface WebSocketState {
  isConnected: boolean;
  logs: LogEntry[];
  error: string | null;
}

export function useWebSocket() {
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    logs: [],
    error: null,
  });
  
  const socketRef = useRef<any>(null);
  const logIdCounter = useRef(0);

  const connect = useCallback(() => {
    try {
      // Dynamic import to avoid SSR issues
      import('socket.io-client').then(({ io }) => {
        if (socketRef.current) {
          socketRef.current.disconnect();
        }

        socketRef.current = io('http://localhost:3000', {
          transports: ['websocket', 'polling'],
          timeout: 20000,
        });

        socketRef.current.on('connect', () => {
          console.log('Connected to WebSocket server');
          setState(prev => ({ ...prev, isConnected: true, error: null }));
        });

        socketRef.current.on('disconnect', () => {
          console.log('Disconnected from WebSocket server');
          setState(prev => ({ ...prev, isConnected: false }));
        });

        socketRef.current.on('connected', (data: any) => {
          console.log('Server welcome:', data);
          // Add connection log
          const logEntry: LogEntry = {
            id: `log-${++logIdCounter.current}`,
            level: 'info',
            message: `Connected to server: ${data.message}`,
            timestamp: new Date().toISOString(),
            service: 'websocket',
          };
          setState(prev => ({
            ...prev,
            logs: [logEntry, ...prev.logs.slice(0, 99)], // Keep last 100 logs
          }));
        });

        socketRef.current.on('pong', (data: any) => {
          console.log('Pong received:', data);
          // Add pong response log
          const logEntry: LogEntry = {
            id: `log-${++logIdCounter.current}`,
            level: 'success',
            message: `Ping response: ${data.message}`,
            timestamp: data.timestamp || new Date().toISOString(),
            service: 'ping',
          };
          
          setState(prev => ({
            ...prev,
            logs: [logEntry, ...prev.logs.slice(0, 99)], // Keep last 100 logs
          }));
        });

        socketRef.current.on('log', (data: any) => {
          const logEntry: LogEntry = {
            id: `log-${++logIdCounter.current}`,
            level: data.level || 'info',
            message: data.message || 'Unknown log message',
            timestamp: data.timestamp || new Date().toISOString(),
            service: data.service || 'system',
          };
          
          setState(prev => ({
            ...prev,
            logs: [logEntry, ...prev.logs.slice(0, 99)], // Keep last 100 logs
          }));
        });

        socketRef.current.on('error', (error: any) => {
          console.error('WebSocket error:', error);
          setState(prev => ({ 
            ...prev, 
            error: error.message || 'WebSocket connection error' 
          }));
        });

        socketRef.current.on('connect_error', (error: any) => {
          console.error('Connection error:', error);
          setState(prev => ({ 
            ...prev, 
            error: `Connection failed: ${error.message}`,
            isConnected: false 
          }));
        });

      }).catch((error) => {
        console.error('Failed to load Socket.IO client:', error);
        setState(prev => ({ 
          ...prev, 
          error: 'Failed to load WebSocket client' 
        }));
      });
    } catch (error) {
      console.error('Error setting up WebSocket:', error);
      setState(prev => ({ 
        ...prev, 
        error: 'Failed to setup WebSocket connection' 
      }));
    }
  }, []);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setState(prev => ({ ...prev, isConnected: false }));
  }, []);

  const sendPing = useCallback(() => {
    if (socketRef.current && state.isConnected) {
      // Add ping sent log
      const pingLogEntry: LogEntry = {
        id: `log-${++logIdCounter.current}`,
        level: 'info',
        message: 'Ping sent to server',
        timestamp: new Date().toISOString(),
        service: 'ping',
      };
      
      setState(prev => ({
        ...prev,
        logs: [pingLogEntry, ...prev.logs.slice(0, 99)], // Keep last 100 logs
      }));
      
      socketRef.current.emit('ping', { message: 'Ping from dashboard' });
    }
  }, [state.isConnected]);

  const subscribeToLogs = useCallback(() => {
    if (socketRef.current && state.isConnected) {
      socketRef.current.emit('subscribe_logs');
    }
  }, [state.isConnected]);

  const unsubscribeFromLogs = useCallback(() => {
    if (socketRef.current && state.isConnected) {
      socketRef.current.emit('unsubscribe_logs');
    }
  }, [state.isConnected]);

  const clearLogs = useCallback(() => {
    setState(prev => ({ ...prev, logs: [] }));
  }, []);

  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    ...state,
    connect,
    disconnect,
    sendPing,
    subscribeToLogs,
    unsubscribeFromLogs,
    clearLogs,
  };
}
