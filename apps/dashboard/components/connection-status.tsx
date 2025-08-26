'use client';

import { Wifi, WifiOff, AlertTriangle } from "lucide-react";
import { useWebSocket } from "@/hooks/use-websocket";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function ConnectionStatus() {
  const { isConnected, error, connect, disconnect } = useWebSocket();

  const getStatusIcon = () => {
    if (error) {
      return <AlertTriangle className="h-4 w-4 text-red-500" />;
    }
    if (isConnected) {
      return <Wifi className="h-4 w-4 text-green-500" />;
    }
    return <WifiOff className="h-4 w-4 text-gray-400" />;
  };

  const getStatusText = () => {
    if (error) {
      return 'Connection Error';
    }
    if (isConnected) {
      return 'Connected';
    }
    return 'Disconnected';
  };

  const getStatusColor = () => {
    if (error) {
      return 'text-red-600';
    }
    if (isConnected) {
      return 'text-green-600';
    }
    return 'text-gray-500';
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-2">
              {getStatusIcon()}
              <span className={`text-sm font-medium ${getStatusColor()}`}>
                {getStatusText()}
              </span>
            </div>
            
            {isConnected ? (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={disconnect}
                className="h-7 px-2 text-xs"
              >
                Disconnect
              </Button>
            ) : (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={connect}
                className="h-7 px-2 text-xs"
              >
                Connect
              </Button>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {error 
              ? `WebSocket Error: ${error}` 
              : isConnected 
                ? 'Connected to worker service' 
                : 'Disconnected from worker service'
            }
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
