'use client';

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogTable } from "@/components/logTable";
import { getStats, getHealth, getWorkers, getJobs, getLogs, type Stats, type Health, type LogEntry } from "@/lib/api";
import { Activity, CheckCircle2, XCircle, Clock, RefreshCw, Cpu, Send, BarChart3 } from "lucide-react";

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [workerCount, setWorkerCount] = useState<number>(0);
  const [queueDepth, setQueueDepth] = useState<number>(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setIsLoading(true);
    const [s, h, workers, jobs, logsRes] = await Promise.all([
      getStats().catch(() => null),
      getHealth().catch(() => null),
      getWorkers().catch(() => []),
      getJobs().catch(() => []),
      getLogs({ take: 10 }).catch(() => ({ data: [], total: 0 })),
    ]);
    setStats(s);
    setHealth(h);
    setWorkerCount(workers.length);
    setQueueDepth(Array.isArray(jobs) ? jobs.length : 0);
    setLogs(logsRes.data);
    setIsLoading(false);
  };

  useEffect(() => { load(); }, []);

  const isHealthy = health?.status === 'ok';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Overview</h2>
          <p className="text-muted-foreground">System status and recent activity</p>
        </div>
        <Button onClick={load} disabled={isLoading} variant="outline" size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className={`h-3 w-3 rounded-full ${isHealthy ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-2xl font-bold">{isHealthy ? 'Online' : 'Offline'}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">API v{health?.version ?? '—'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Workers</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '—' : workerCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Heartbeat in last 30s</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Queue Depth</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '—' : queueDepth}</div>
            <p className="text-xs text-muted-foreground mt-1">Pending in RabbitMQ</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '—' : `${stats?.successRate ?? 0}%`}</div>
            <p className="text-xs text-muted-foreground mt-1">{stats?.sent ?? 0} of {stats?.total ?? 0} sent</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Emails Sent</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '—' : (stats?.sent ?? 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">Successfully delivered</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '—' : (stats?.failed ?? 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">Delivery failures</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '—' : (stats?.pending ?? 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting processing</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Retrying</CardTitle>
            <RefreshCw className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '—' : (stats?.retrying ?? 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">In retry backoff</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Delivery Logs</CardTitle>
        </CardHeader>
        <LogTable data={logs} isLoading={isLoading} />
      </Card>
    </div>
  );
}
