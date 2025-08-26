'use client';

import { Button } from "@/components/ui/button";
import { LogTable } from "@/components/logTable";
import { useEffect, useState } from "react";
import { getLogs } from "@/lib/api";

export default function Home() {
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const getInformation = async () => {
    setIsLoading(true);
    const logs = await getLogs();
    setLogs(logs);
    setIsLoading(false);
  }

  useEffect(() => {
    getInformation();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">
            Welcome to Simple Mailer. Monitor your email campaigns and system status.
          </p>
        </div>
        <Button onClick={getInformation} disabled={isLoading}>
          Refresh
        </Button>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center space-x-2">
            <div className="h-4 w-4 rounded-full bg-green-500"></div>
            <p className="text-sm font-medium">System Status</p>
          </div>
          <p className="text-2xl font-bold">Online</p>
          <p className="text-xs text-muted-foreground">All services running</p>
        </div>
        
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center space-x-2">
            <div className="h-4 w-4 rounded-full bg-blue-500"></div>
            <p className="text-sm font-medium">Total Logs</p>
          </div>
          <p className="text-2xl font-bold">{logs.length}</p>
          <p className="text-xs text-muted-foreground">System activity records</p>
        </div>
        
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center space-x-2">
            <div className="h-4 w-4 rounded-full bg-yellow-500"></div>
            <p className="text-sm font-medium">Active Jobs</p>
          </div>
          <p className="text-2xl font-bold">0</p>
          <p className="text-xs text-muted-foreground">No pending emails</p>
        </div>
        
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center space-x-2">
            <div className="h-4 w-4 rounded-full bg-purple-500"></div>
            <p className="text-sm font-medium">Success Rate</p>
          </div>
          <p className="text-2xl font-bold">100%</p>
          <p className="text-xs text-muted-foreground">Perfect delivery</p>
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="p-6">
          <h3 className="text-lg font-semibold">Recent System Logs</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Latest system activity and email processing logs
          </p>
        </div>
        <LogTable data={logs} isLoading={isLoading} />
      </div>
    </div>
  );
}
