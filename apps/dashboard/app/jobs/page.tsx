'use client';

import { Button } from "@/components/ui/button";
import { Send, Plus, Clock, CheckCircle, XCircle } from "lucide-react";

export default function JobsPage() {
  const mockJobs = [
    {
      id: 1,
      name: "Welcome Email Campaign",
      status: "completed",
      recipients: 1250,
      sent: 1250,
      failed: 0,
      createdAt: "2024-01-15T10:30:00Z"
    },
    {
      id: 2,
      name: "Monthly Newsletter",
      status: "in_progress",
      recipients: 3200,
      sent: 1850,
      failed: 12,
      createdAt: "2024-01-16T09:15:00Z"
    },
    {
      id: 3,
      name: "Product Update Alert",
      status: "pending",
      recipients: 800,
      sent: 0,
      failed: 0,
      createdAt: "2024-01-16T14:20:00Z"
    }
  ];

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
          <p className="text-2xl font-bold">{mockJobs.length}</p>
          <p className="text-xs text-muted-foreground">Active campaigns</p>
        </div>
        
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center space-x-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <p className="text-sm font-medium">Completed</p>
          </div>
          <p className="text-2xl font-bold">{mockJobs.filter(job => job.status === 'completed').length}</p>
          <p className="text-xs text-muted-foreground">Successful campaigns</p>
        </div>
        
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center space-x-2">
            <Clock className="h-4 w-4 text-yellow-500" />
            <p className="text-sm font-medium">In Progress</p>
          </div>
          <p className="text-2xl font-bold">{mockJobs.filter(job => job.status === 'in_progress').length}</p>
          <p className="text-xs text-muted-foreground">Currently running</p>
        </div>
        
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center space-x-2">
            <Clock className="h-4 w-4 text-blue-500" />
            <p className="text-sm font-medium">Pending</p>
          </div>
          <p className="text-2xl font-bold">{mockJobs.filter(job => job.status === 'pending').length}</p>
          <p className="text-xs text-muted-foreground">Waiting to start</p>
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="p-6">
          <h3 className="text-lg font-semibold">Recent Campaigns</h3>
          <p className="text-sm text-muted-foreground">
            Overview of your email campaigns and their current status
          </p>
        </div>
        <div className="border-t">
          {mockJobs.map((job) => (
            <div key={job.id} className="flex items-center justify-between p-6 hover:bg-muted/50">
              <div className="flex items-center space-x-4">
                {getStatusIcon(job.status)}
                <div>
                  <h4 className="font-medium">{job.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    {job.recipients} recipients • Created {new Date(job.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-medium">{getStatusText(job.status)}</p>
                <p className="text-sm text-muted-foreground">
                  {job.sent} sent, {job.failed} failed
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
