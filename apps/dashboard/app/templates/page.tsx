'use client';

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getTemplates, getTemplateContent, createTemplate, updateTemplate, deleteTemplate,
  type Template,
} from "@/lib/api";
import { templateCreateSchema, templateUpdateSchema } from "@/lib/validators";
import { Eye, Pencil, Trash2, RefreshCw, Plus } from "lucide-react";

const tableHeadStyle = "font-medium text-muted-foreground text-xs uppercase tracking-wider pb-3";

// ── Dialogs ─────────────────────────────────────────────────────────────────

interface ViewDialogProps {
  name: string;
  content: string | null;
  loading: boolean;
  onClose: () => void;
}
function ViewDialog({ name, content, loading, onClose }: ViewDialogProps) {
  return (
    <Dialog open={content !== null} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Template: {name}</DialogTitle>
        </DialogHeader>
        <div className="overflow-auto max-h-[60vh]">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          ) : (
            <pre className="text-sm bg-muted rounded-md p-4 whitespace-pre-wrap font-mono">
              {content || '(empty)'}
            </pre>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Create Dialog ──────────────────────────────────────────────────────────

interface CreateDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}
function CreateDialog({ open, onClose, onSaved }: CreateDialogProps) {
  const [form, setForm] = useState({ name: '', subject: '', content: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => { setForm({ name: '', subject: '', content: '' }); setErrors({}); setFeedback(''); };

  useEffect(() => { if (open) reset(); }, [open]);

  const handleSave = async () => {
    const parsed = templateCreateSchema.safeParse(form);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed.error.flatten().fieldErrors)) fe[k] = (v as string[])[0];
      setErrors(fe);
      return;
    }
    setSaving(true);
    const res = await createTemplate(parsed.data).catch(() => ({ success: false, message: 'Network error' }));
    setSaving(false);
    if (res.success) { onClose(); onSaved(); }
    else setFeedback(res.message ?? 'Error creating template');
  };

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [key]: e.target.value }));
      setErrors((e_) => ({ ...e_, [key]: '' }));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>New Template</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2 overflow-y-auto flex-1">
          {feedback && <p className="text-sm text-red-500">{feedback}</p>}
          <div className="grid gap-1.5">
            <Label htmlFor="c-name">Name</Label>
            <Input id="c-name" placeholder="welcome-email" {...field('name')} />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
            <p className="text-xs text-muted-foreground">Filename will be auto-generated (e.g. welcome-email.mjml)</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-subject">Subject</Label>
            <Input id="c-subject" placeholder="Welcome to SimpleMailer!" {...field('subject')} />
            {errors.subject && <p className="text-xs text-red-500">{errors.subject}</p>}
          </div>
          <div className="grid gap-1.5 flex-1">
            <Label htmlFor="c-content">Content</Label>
            <Textarea
              id="c-content"
              placeholder="<mjml>...</mjml> or HTML"
              className="font-mono text-sm min-h-64 resize-y"
              {...field('content')}
            />
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Dialog ────────────────────────────────────────────────────────────

interface EditDialogProps {
  template: Template | null;
  onClose: () => void;
  onSaved: () => void;
}
function EditDialog({ template, onClose, onSaved }: EditDialogProps) {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [contentLoading, setContentLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!template) return;
    setName(template.name);
    setSubject(template.subject);
    setErrors({});
    setFeedback('');
    setContent('');
    if (template.storageType === 'LOCAL') {
      setContentLoading(true);
      getTemplateContent(template.id)
        .then(setContent)
        .catch(() => setContent(''))
        .finally(() => setContentLoading(false));
    }
  }, [template]);

  const handleSave = async () => {
    if (!template) return;
    const payload = { name, subject, content: template.storageType === 'LOCAL' ? content : undefined };
    const parsed = templateUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed.error.flatten().fieldErrors)) fe[k] = (v as string[])[0];
      setErrors(fe);
      return;
    }
    setSaving(true);
    const res = await updateTemplate(template.id, payload).catch(() => ({ success: false, message: 'Network error' }));
    setSaving(false);
    if (res.success) { onClose(); onSaved(); }
    else setFeedback(res.message ?? 'Error saving template');
  };

  return (
    <Dialog open={!!template} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Template</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2 overflow-y-auto flex-1">
          {feedback && <p className="text-sm text-red-500">{feedback}</p>}
          <div className="grid gap-1.5">
            <Label htmlFor="e-name">Name</Label>
            <Input
              id="e-name"
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors((er) => ({ ...er, name: '' })); }}
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="e-subject">Subject</Label>
            <Input
              id="e-subject"
              value={subject}
              onChange={(e) => { setSubject(e.target.value); setErrors((er) => ({ ...er, subject: '' })); }}
            />
            {errors.subject && <p className="text-xs text-red-500">{errors.subject}</p>}
          </div>
          {template?.storageType === 'LOCAL' && (
            <div className="grid gap-1.5 flex-1">
              <Label htmlFor="e-content">Content</Label>
              {contentLoading ? (
                <div className="space-y-2 pt-1">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-4 w-3/5" />
                </div>
              ) : (
                <Textarea
                  id="e-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="font-mono text-sm min-h-64 resize-y"
                />
              )}
            </div>
          )}
          {template?.storageType === 'S3' && (
            <p className="text-sm text-muted-foreground">
              S3 template content cannot be edited here. Manage it directly in your S3 bucket.
            </p>
          )}
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || contentLoading}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialogs
  const [viewName, setViewName] = useState('');
  const [viewContent, setViewContent] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Template | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const data = await getTemplates().catch(() => []);
    setTemplates(data);
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleView = async (t: Template) => {
    setViewName(t.name);
    setViewContent('');
    setViewLoading(true);
    const content = await getTemplateContent(t.id).catch(() => '(failed to load)');
    setViewContent(content);
    setViewLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template? This also removes the file from disk for LOCAL templates.')) return;
    await deleteTemplate(id).catch(() => null);
    load();
  };

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
          <h2 className="text-3xl font-bold tracking-tight">Templates</h2>
          <p className="text-muted-foreground">Manage email templates</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={load} disabled={isLoading} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setCreateOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Templates ({isLoading ? '…' : templates.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableHead className={tableHeadStyle}>Name</TableHead>
                <TableHead className={tableHeadStyle}>Subject</TableHead>
                <TableHead className={tableHeadStyle}>Storage</TableHead>
                <TableHead className={tableHeadStyle}>Created At</TableHead>
                <TableHead className={tableHeadStyle}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? skeletonRows : (
                <>
                  {templates.map((t) => (
                    <TableRow key={t.id} className="border-b border-border hover:bg-muted/50">
                      <TableCell className="text-sm font-medium">{t.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{t.subject}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{t.storageType}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(t.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleView(t)} title="View content">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditTarget(t)} title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => handleDelete(t.id)}
                            title="Delete"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {templates.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-12 text-sm">
                        No templates found. Create one to get started.
                      </TableCell>
                    </TableRow>
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ViewDialog
        name={viewName}
        content={viewContent}
        loading={viewLoading}
        onClose={() => setViewContent(null)}
      />

      <CreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={load}
      />

      <EditDialog
        template={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={load}
      />
    </div>
  );
}
