"use client"

import React from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

export interface LogEntry {
  id: string;
  recipient: string;
  status: string;
  retryCount?: number;
  completedAt?: string | null;
  account: { id: string; name: string };
  template: { id: string; name: string };
  createdAt: string;
}

interface LogTableProps {
  data: Partial<LogEntry>[]
  className?: string
  isLoading?: boolean
  showExtra?: boolean
}

function formatDate(val: string | null | undefined) {
  if (!val) return '—';
  return new Date(val).toLocaleString();
}

const getStatusVariant = (status: string) => {
  switch (status?.toUpperCase()) {
    case 'SENT': return 'success'
    case 'FAILED': return 'error'
    case 'RETRYING': return 'warning'
    case 'PENDING': return 'info'
    default: return 'secondary'
  }
}

const tableHeadStyle = "font-medium text-muted-foreground text-xs uppercase tracking-wider pb-3"

export function LogTable({ data, className, isLoading, showExtra = false }: LogTableProps) {
  const colCount = showExtra ? 8 : 6;

  const skeletonRows = Array.from({ length: 5 }, (_, index) => (
    <TableRow key={`skeleton-${index}`} className="border-b border-border">
      {Array.from({ length: colCount }, (_, i) => (
        <TableCell key={i} className="py-3"><Skeleton className="h-4 w-20" /></TableCell>
      ))}
    </TableRow>
  ));

  return (
    <div className={className}>
      <Table>
        <TableHeader>
          <TableRow className="border-b border-border hover:bg-transparent">
            <TableHead className={tableHeadStyle}>ID</TableHead>
            <TableHead className={tableHeadStyle}>Status</TableHead>
            <TableHead className={tableHeadStyle}>Recipient</TableHead>
            <TableHead className={tableHeadStyle}>Account</TableHead>
            <TableHead className={tableHeadStyle}>Template</TableHead>
            <TableHead className={tableHeadStyle}>Created At</TableHead>
            {showExtra && <TableHead className={tableHeadStyle}>Retries</TableHead>}
            {showExtra && <TableHead className={tableHeadStyle}>Completed At</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            skeletonRows
          ) : (
            <>
              {data.map((entry, index) => (
                <TableRow key={index} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <TableCell className="py-3 text-sm text-foreground font-mono">{entry.id}</TableCell>
                  <TableCell className="py-3">
                    <Badge variant={getStatusVariant(entry.status || '') as 'success' | 'error' | 'warning' | 'info' | 'secondary'} className="text-xs px-2 py-1">
                      {entry.status || 'Unknown'}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 text-sm text-foreground">{entry.recipient}</TableCell>
                  <TableCell className="py-3 text-sm text-foreground">{entry.account?.name || 'N/A'}</TableCell>
                  <TableCell className="py-3 text-sm text-foreground">{entry.template?.name || 'N/A'}</TableCell>
                  <TableCell className="py-3 text-sm text-muted-foreground">{formatDate(entry.createdAt)}</TableCell>
                  {showExtra && <TableCell className="py-3 text-sm text-muted-foreground">{entry.retryCount ?? 0}</TableCell>}
                  {showExtra && <TableCell className="py-3 text-sm text-muted-foreground">{formatDate(entry.completedAt)}</TableCell>}
                </TableRow>
              ))}
              {data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={colCount} className="text-center text-muted-foreground py-8 text-sm">
                    No data available
                  </TableCell>
                </TableRow>
              )}
            </>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
