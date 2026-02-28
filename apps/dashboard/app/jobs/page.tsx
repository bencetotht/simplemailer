'use client';

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Send, Plus, Clock, CheckCircle, XCircle } from "lucide-react";
import { getJobs } from "@/lib/api";

export default function JobsPage() {
  const [jobs, setJobs] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    getJobs().then(setJobs).catch(() => setJobs([]));
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'in_progress':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-blue-500" />;
      default:
        return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'in_progress':
        return 'In Progress';
      case 'pending':
        return 'Pending';
      default:
        return 'Failed';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Mail Jobs</h2>
          <p className="text-muted-foreground">
            Manage your email campaigns and monitor their progress.
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Campaign
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center space-x-2">
            <Send className="h-4 w-4 text-blue-500" />
            <p className="text-sm font-medium">Total Jobs</p>
          </div>
          <p className="text-2xl font-bold">{jobs.length}</p>
          <p className="text-xs text-muted-foreground">Active campaigns</p>
        </div>

        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center space-x-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <p className="text-sm font-medium">Completed</p>
          </div>
          <p className="text-2xl font-bold">{jobs.filter(job => job.status === 'completed').length}</p>
          <p className="text-xs text-muted-foreground">Successful campaigns</p>
        </div>

        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center space-x-2">
            <Clock className="h-4 w-4 text-yellow-500" />
            <p className="text-sm font-medium">In Progress</p>
          </div>
          <p className="text-2xl font-bold">{jobs.filter(job => job.status === 'in_progress').length}</p>
          <p className="text-xs text-muted-foreground">Currently running</p>
        </div>

        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center space-x-2">
            <Clock className="h-4 w-4 text-blue-500" />
            <p className="text-sm font-medium">Pending</p>
          </div>
          <p className="text-2xl font-bold">{jobs.filter(job => job.status === 'pending').length}</p>
          <p className="text-xs text-muted-foreground">Waiting to start</p>
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="p-6">
          <h3 className="text-lg font-semibold">Queue Messages</h3>
          <p className="text-sm text-muted-foreground">
            Messages currently in the mailer queue
          </p>
        </div>
        <div className="border-t">
          {jobs.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">No jobs in queue</div>
          ) : (
            jobs.map((job, index) => {
              const payload = job.payload as Record<string, unknown> | undefined;
              const data = (payload?.data ?? payload) as Record<string, unknown> | undefined;
              const status = (data?.status as string) ?? 'pending';
              return (
                <div key={index} className="flex items-center justify-between p-6 hover:bg-muted/50">
                  <div className="flex items-center space-x-4">
                    {getStatusIcon(status)}
                    <div>
                      <h4 className="font-medium">{(data?.recipient as string) ?? 'Unknown recipient'}</h4>
                      <p className="text-sm text-muted-foreground">
                        Account: {(data?.accountId as string) ?? 'N/A'} &bull; Template: {(data?.templateId as string) ?? 'N/A'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{getStatusText(status)}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
