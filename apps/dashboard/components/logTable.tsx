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

interface LogEntry {
  id: string,
  recipient: string,
  status: string,
  account: {
    id: string,
    name: string,
  },
  template: {
    id: string,
    name: string,
  },
  createdAt: string,
}

interface LogTableProps {
  data: Partial<LogEntry>[]
  className?: string
  isLoading?: boolean
}

export function LogTable({ data, className, isLoading }: LogTableProps) {
  const getStatusVariant = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'SENT':
        return 'success'
      case 'FAILED':
        return 'error'
      case 'RETRYING':
        return 'warning'
      case 'PENDING':
        return 'info'
      default:
        return 'secondary'
    }
  }

  const skeletonRows = Array.from({ length: 5 }, (_, index) => (
    <TableRow key={`skeleton-${index}`} className="border-b border-border">
      <TableCell className="py-3"><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell className="py-3"><Skeleton className="h-6 w-20" /></TableCell>
      <TableCell className="py-3"><Skeleton className="h-4 w-32" /></TableCell>
      <TableCell className="py-3"><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell className="py-3"><Skeleton className="h-4 w-28" /></TableCell>
      <TableCell className="py-3"><Skeleton className="h-4 w-24" /></TableCell>
    </TableRow>
  ))

  const tableHeadStyle = "font-medium text-muted-foreground text-xs uppercase tracking-wider pb-3"

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
                    <Badge variant={getStatusVariant(entry.status || '')} className="text-xs px-2 py-1">
                      {entry.status || 'Unknown'}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 text-sm text-foreground">{entry.recipient}</TableCell>
                  <TableCell className="py-3 text-sm text-foreground">{entry.account?.name || 'N/A'}</TableCell>
                  <TableCell className="py-3 text-sm text-foreground">{entry.template?.name || 'N/A'}</TableCell>
                  <TableCell className="py-3 text-sm text-muted-foreground">{entry.createdAt}</TableCell>
                </TableRow>
              ))}
              {data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8 text-sm">
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

export type { LogEntry }
