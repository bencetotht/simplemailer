'use client';

import { Button } from "@/components/ui/button";
import { FileText, RefreshCw, Info, AlertTriangle, CheckCircle, XCircle, Wifi, WifiOff, Play, Square, Trash2 } from "lucide-react";
import { useWebSocket } from "@/hooks/use-websocket";
import { useEffect } from "react";

export default function LogsPage() {
  const {
    isConnected,
    logs,
    error,
    connect,
    disconnect,
    sendPing,
    subscribeToLogs,
    clearLogs,
  } = useWebSocket();

  useEffect(() => {
    if (isConnected) {
      subscribeToLogs();
    }
  }, [isConnected, subscribeToLogs]);

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'info':
        return <Info className="h-4 w-4 text-blue-500" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warn':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'debug':
        return <Info className="h-4 w-4 text-gray-500" />;
      case 'verbose':
        return <Info className="h-4 w-4 text-gray-400" />;
      case 'fatal':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Info className="h-4 w-4 text-gray-500" />;
    }
  };

  const getLevelBadge = (level: string) => {
    const baseClasses = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium";
    switch (level) {
      case 'info':
        return `${baseClasses} bg-blue-100 text-blue-800`;
      case 'success':
        return `${baseClasses} bg-green-100 text-green-800`;
      case 'warning':
      case 'warn':
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case 'error':
        return `${baseClasses} bg-red-100 text-red-800`;
      case 'debug':
        return `${baseClasses} bg-gray-100 text-gray-800`;
      case 'verbose':
        return `${baseClasses} bg-gray-100 text-gray-600`;
      case 'fatal':
        return `${baseClasses} bg-red-200 text-red-900`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  const getStats = () => {
    const total = logs.length;
    const success = logs.filter(log => log.level === 'success').length;
    const warnings = logs.filter(log => ['warning', 'warn'].includes(log.level)).length;
    const errors = logs.filter(log => ['error', 'fatal'].includes(log.level)).length;
    
    return { total, success, warnings, errors };
  };

  const stats = getStats();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Live System Logs</h2>
          <p className="text-muted-foreground">
            Real-time monitoring of system activity, email processing, and application events.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-2">
            {isConnected ? (
              <div className="flex items-center space-x-2 text-green-600">
                <Wifi className="h-4 w-4" />
                <span className="text-sm font-medium">Connected</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 text-red-600">
                <WifiOff className="h-4 w-4" />
                <span className="text-sm font-medium">Disconnected</span>
              </div>
            )}
          </div>
          
          {isConnected ? (
            <Button variant="outline" onClick={disconnect}>
              <Square className="h-4 w-4 mr-2" />
              Disconnect
            </Button>
          ) : (
            <Button variant="outline" onClick={connect}>
              <Play className="h-4 w-4 mr-2" />
              Connect
            </Button>
          )}
          
          <Button onClick={sendPing} disabled={!isConnected}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Ping
          </Button>
          
          <Button variant="outline" onClick={clearLogs}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-center space-x-2">
            <XCircle className="h-5 w-5 text-red-500" />
            <span className="text-sm font-medium text-red-800">Connection Error</span>
          </div>
          <p className="mt-1 text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center space-x-2">
            <FileText className="h-4 w-4 text-blue-500" />
            <p className="text-sm font-medium">Total Logs</p>
          </div>
          <p className="text-2xl font-bold">{stats.total}</p>
          <p className="text-xs text-muted-foreground">System events</p>
        </div>
        
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center space-x-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <p className="text-sm font-medium">Success</p>
          </div>
          <p className="text-2xl font-bold">{stats.success}</p>
          <p className="text-xs text-muted-foreground">Successful operations</p>
        </div>
        
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <p className="text-sm font-medium">Warnings</p>
          </div>
          <p className="text-2xl font-bold">{stats.warnings}</p>
          <p className="text-xs text-muted-foreground">Attention needed</p>
        </div>
        
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center space-x-2">
            <XCircle className="h-4 w-4 text-red-500" />
            <p className="text-sm font-medium">Errors</p>
          </div>
          <p className="text-2xl font-bold">{stats.errors}</p>
          <p className="text-xs text-muted-foreground">Issues detected</p>
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="p-6">
          <h3 className="text-lg font-semibold">Live Log Entries</h3>
          <p className="text-sm text-muted-foreground">
            Real-time system events and their details
            {isConnected && (
              <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                <Wifi className="h-3 w-3 mr-1" />
                Live
              </span>
            )}
          </p>
        </div>
        
        {logs.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            {isConnected ? 'Waiting for logs...' : 'Not connected to server'}
          </div>
        ) : (
          <div className="border-t">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start space-x-4 p-6 hover:bg-muted/50 border-b last:border-b-0">
                {getLevelIcon(log.level)}
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{log.message}</p>
                    <span className={getLevelBadge(log.level)}>
                      {log.level.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                    <span>{new Date(log.timestamp).toLocaleString()}</span>
                    {log.service && (
                      <>
                        <span>•</span>
                        <span className="font-mono">{log.service}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
