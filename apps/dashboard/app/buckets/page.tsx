'use client';

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { getBuckets, createBucket, deleteBucket, type Bucket } from "@/lib/api";
import { bucketSchema } from "@/lib/validators";
import { Plus, Trash2, RefreshCw } from "lucide-react";

const tableHeadStyle = "font-medium text-muted-foreground text-xs uppercase tracking-wider pb-3";

const defaultForm = { name: '', path: '', accessKeyId: '', secretAccessKey: '', region: '' };

export default function BucketsPage() {
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    const data = await getBuckets().catch(() => []);
    setBuckets(Array.isArray(data) ? data : []);
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    const parsed = bucketSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed.error.flatten().fieldErrors)) {
        fieldErrors[k] = (v as string[])[0];
      }
      setErrors(fieldErrors);
      return;
    }
    setSaving(true);
    const res = await createBucket(parsed.data).catch(() => ({ success: false, message: 'Network error' }));
    setSaving(false);
    if (res.success) {
      setOpen(false);
      setForm(defaultForm);
      setErrors({});
      load();
    } else {
      setFeedback(res.message ?? 'Error creating bucket');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this bucket configuration?')) return;
    await deleteBucket(id).catch(() => null);
    load();
  };

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((f) => ({ ...f, [key]: e.target.value }));
      setErrors((e_) => ({ ...e_, [key]: '' }));
    },
  });

  const skeletonRows = Array.from({ length: 3 }, (_, i) => (
    <TableRow key={i}>
      {Array.from({ length: 5 }, (_, j) => (
        <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
      ))}
    </TableRow>
  ));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Buckets</h2>
          <p className="text-muted-foreground">Manage S3 bucket configurations</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={load} disabled={isLoading} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => { setOpen(true); setFeedback(''); setErrors({}); setForm(defaultForm); }} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Bucket
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>S3 Buckets ({isLoading ? '…' : buckets.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableHead className={tableHeadStyle}>Name</TableHead>
                <TableHead className={tableHeadStyle}>Path</TableHead>
                <TableHead className={tableHeadStyle}>Region</TableHead>
                <TableHead className={tableHeadStyle}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? skeletonRows : (
                <>
                  {buckets.map((b) => (
                    <TableRow key={b.id} className="border-b border-border hover:bg-muted/50">
                      <TableCell className="text-sm font-medium">{b.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono">{b.path}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{b.region}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(b.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {buckets.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-12 text-sm">
                        No buckets configured.
                      </TableCell>
                    </TableRow>
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add S3 Bucket</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {feedback && <p className="text-sm text-red-500">{feedback}</p>}
            {([
              { key: 'name', label: 'Name', placeholder: 'my-bucket' },
              { key: 'path', label: 'Path / Endpoint URL', placeholder: 'https://s3.amazonaws.com/my-bucket' },
              { key: 'accessKeyId', label: 'Access Key ID', placeholder: 'AKIAIOSFODNN7EXAMPLE' },
              { key: 'secretAccessKey', label: 'Secret Access Key', placeholder: '••••••••' },
              { key: 'region', label: 'Region', placeholder: 'us-east-1' },
            ] as const).map(({ key, label, placeholder }) => (
              <div key={key} className="grid gap-1.5">
                <Label htmlFor={key}>{label}</Label>
                <Input
                  id={key}
                  type={key === 'secretAccessKey' ? 'password' : 'text'}
                  placeholder={placeholder}
                  {...field(key)}
                />
                {errors[key] && <p className="text-xs text-red-500">{errors[key]}</p>}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
