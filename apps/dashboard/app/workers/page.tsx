'use client';

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { getWorkers, type Worker } from "@/lib/api";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { RefreshCw } from "lucide-react";

function relativeTime(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function uptime(startedAt: string) {
  const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const tableHeadStyle = "font-medium text-muted-foreground text-xs uppercase tracking-wider pb-3";

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const data = await getWorkers().catch(() => []);
    setWorkers(Array.isArray(data) ? data : []);
    setIsLoading(false);
  }, []);

  const { enabled, toggle } = useAutoRefresh(load, 10_000);

  useEffect(() => { load(); }, [load]);

  const skeletonRows = Array.from({ length: 3 }, (_, i) => (
    <TableRow key={i}>
      {Array.from({ length: 6 }, (_, j) => (
        <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
      ))}
    </TableRow>
  ));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Workers</h2>
          <p className="text-muted-foreground">Active worker instances (heartbeat within 30s)</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="auto-refresh" checked={enabled} onCheckedChange={toggle} />
            <Label htmlFor="auto-refresh" className="text-sm">Auto-refresh (10s)</Label>
          </div>
          <Button onClick={load} disabled={isLoading} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Workers ({isLoading ? '…' : workers.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableHead className={tableHeadStyle}>Status</TableHead>
                <TableHead className={tableHeadStyle}>Worker ID</TableHead>
                <TableHead className={tableHeadStyle}>Version</TableHead>
                <TableHead className={tableHeadStyle}>Started At</TableHead>
                <TableHead className={tableHeadStyle}>Last Heartbeat</TableHead>
                <TableHead className={tableHeadStyle}>Uptime</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? skeletonRows : (
                <>
                  {workers.map((w) => (
                    <TableRow key={w.id} className="border-b border-border hover:bg-muted/50">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
                          <span className="text-sm">Active</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{w.id}</TableCell>
                      <TableCell className="text-sm">{w.version}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(w.startedAt).toLocaleString()}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{relativeTime(w.lastHeartbeat)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{uptime(w.startedAt)}</TableCell>
                    </TableRow>
                  ))}
                  {workers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-12 text-sm">
                        No active workers. Start the worker service to see it here.
                      </TableCell>
                    </TableRow>
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
