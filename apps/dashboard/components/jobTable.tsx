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

interface LogEntry {
  message_count: number
  routing_key: string
  payload: string
}

interface LogTableProps {
  data: Partial<LogEntry>[]
  className?: string
}

export function LogTable({ data, className }: LogTableProps) {
  return (
    <div className={className}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Number</TableHead>
            <TableHead>Routing Key</TableHead>
            <TableHead>Payload</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((entry, index) => (
            <TableRow key={index}>
              <TableCell className="font-medium">{entry.message_count}</TableCell>
              <TableCell>{entry.routing_key}</TableCell>
              <TableCell className="max-w-md truncate" title={entry.payload}>
                {entry.payload && (
                  <pre className="whitespace-pre-wrap break-words">
                    {JSON.stringify(JSON.parse(entry.payload), null, 2)}
                  </pre>
                )}
              </TableCell>
            </TableRow>
          ))}
          {data.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground">
                No data available
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export type { LogEntry }
