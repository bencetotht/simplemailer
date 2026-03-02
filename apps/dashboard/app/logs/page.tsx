'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LogTable } from "@/components/logTable";
import { getLogs, type LogEntry } from "@/lib/api";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { RefreshCw } from "lucide-react";

const PAGE_SIZE = 20;

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState('');
  const [recipient, setRecipient] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchLogs = useCallback(async (p: number, s: string, r: string) => {
    setIsLoading(true);
    const res = await getLogs({
      skip: p * PAGE_SIZE,
      take: PAGE_SIZE,
      status: s || undefined,
      recipient: r || undefined,
    }).catch(() => ({ data: [], total: 0 }));
    setLogs(res.data);
    setTotal(res.total);
    setIsLoading(false);
  }, []);

  // Initial load
  useEffect(() => {
    fetchLogs(0, '', '');
  }, [fetchLogs]);

  // Status change resets to page 0
  const handleStatusChange = (val: string) => {
    const s = val === 'all' ? '' : val;
    setStatus(s);
    setPage(0);
    fetchLogs(0, s, recipient);
  };

  // Recipient change with debounce
  const handleRecipientChange = (val: string) => {
    setRecipient(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(0);
      fetchLogs(0, status, val);
    }, 400);
  };

  // Page change
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchLogs(newPage, status, recipient);
  };

  const refresh = useCallback(() => fetchLogs(page, status, recipient), [fetchLogs, page, status, recipient]);

  const { enabled, toggle } = useAutoRefresh(refresh, 15_000);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = page * PAGE_SIZE + 1;
  const end = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Delivery Logs</h2>
          <p className="text-muted-foreground">Browse and filter email delivery history</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="auto-refresh" checked={enabled} onCheckedChange={toggle} />
            <Label htmlFor="auto-refresh" className="text-sm">Auto-refresh (15s)</Label>
          </div>
          <Button onClick={refresh} disabled={isLoading} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex gap-4 flex-wrap">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status-filter" className="text-sm">Status</Label>
          <Select value={status || 'all'} onValueChange={handleStatusChange}>
            <SelectTrigger id="status-filter" className="w-40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="SENT">Sent</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="RETRYING">Retrying</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="recipient-filter" className="text-sm">Recipient</Label>
          <Input
            id="recipient-filter"
            placeholder="Search recipient..."
            className="w-56"
            value={recipient}
            onChange={(e) => handleRecipientChange(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Logs</CardTitle>
          {total > 0 && (
            <span className="text-sm text-muted-foreground">
              Showing {start}–{end} of {total}
            </span>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <LogTable data={logs} isLoading={isLoading} showExtra />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0 || isLoading}
          onClick={() => handlePageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages - 1 || isLoading}
          onClick={() => handlePageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
