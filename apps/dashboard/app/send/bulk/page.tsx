'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  getAccounts, getTemplateContent, getTemplates, sendBulkMail, getBulkBatchStatus,
  type Account, type Template, type BulkRecipient, type BulkSendResponse, type BulkBatch, type BulkBatchItem,
} from "@/lib/api";
import { Plus, Trash2, Send, ChevronLeft, ChevronRight, Download } from "lucide-react";

interface KVRow { key: string; value: string; }

const JINJA_VARIABLE_REGEX = /{{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*}}/g;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PREVIEW_LIMIT = 100;

function extractTemplateVariables(content: string): string[] {
  const variables = new Set<string>();
  for (const match of content.matchAll(JINJA_VARIABLE_REGEX)) {
    const variable = match[1]?.trim();
    if (variable) variables.add(variable);
  }
  return Array.from(variables).sort((a, b) => a.localeCompare(b));
}

function parseCsv(
  text: string,
  blankAsUndefined: boolean,
): { recipients: BulkRecipient[]; errors: string[] } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    return { recipients: [], errors: ['Need a header row plus at least one data row'] };
  }

  // Simple CSV split — handles basic quoting but not escaped quotes within fields
  function splitRow(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  const headers = splitRow(lines[0]!).map((h) => h.toLowerCase());
  const recipientIdx = headers.findIndex((h) => h === 'recipient');
  if (recipientIdx === -1) {
    return { recipients: [], errors: ['Missing "recipient" column in header row'] };
  }

  const recipients: BulkRecipient[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitRow(lines[i]!);
    const recipientVal = cells[recipientIdx]?.trim() ?? '';
    const values: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      if (j === recipientIdx) continue;
      const header = headers[j]!;
      const cellVal = cells[j]?.trim() ?? '';
      if (blankAsUndefined && cellVal === '') continue;
      values[header] = cellVal;
    }
    recipients.push({ recipient: recipientVal, values: Object.keys(values).length > 0 ? values : undefined });
  }

  if (recipients.length === 0) {
    errors.push('No data rows found');
  }

  return { recipients, errors };
}

function kvRowsToObject(rows: KVRow[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const { key, value } of rows) {
    if (key.trim()) out[key.trim()] = value;
  }
  return out;
}

function isBulkRecipient(value: unknown): value is BulkRecipient {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.recipient !== 'string') return false;
  return entry.values === undefined || (
    entry.values !== null &&
    typeof entry.values === 'object' &&
    !Array.isArray(entry.values)
  );
}

function escapeCsvCell(value: string): string {
  const safeValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replace(/"/g, '""')}"`;
}

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'SENT': return 'default';
    case 'REJECTED':
    case 'FAILED':
    case 'DEAD': return 'destructive';
    case 'RETRYING': return 'secondary';
    default: return 'outline';
  }
}

function formatMs(ms: number): string {
  if (ms < 60_000) return `${ms / 1000}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function estimatedCompletion(count: number, delayMs: number): string {
  const totalMs = Math.max(count - 1, 0) * delayMs;
  if (totalMs < 60_000) return `~${Math.ceil(totalMs / 1000)} seconds`;
  if (totalMs < 3_600_000) return `~${Math.ceil(totalMs / 60_000)} minutes`;
  return `~${(totalMs / 3_600_000).toFixed(1)} hours`;
}

type Step = 1 | 2 | 3;

export default function BulkSendPage() {
  // Data
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  // Step 1
  const [accountId, setAccountId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [templateVariables, setTemplateVariables] = useState<string[]>([]);
  const [templateVarsLoading, setTemplateVarsLoading] = useState(false);
  const [templateVarsError, setTemplateVarsError] = useState('');
  const [sharedKvRows, setSharedKvRows] = useState<KVRow[]>([{ key: '', value: '' }]);
  const [sharedJsonMode, setSharedJsonMode] = useState(false);
  const [sharedJsonRaw, setSharedJsonRaw] = useState('{}');
  const [delaySeconds, setDelaySeconds] = useState(5);
  const [step1Errors, setStep1Errors] = useState<Record<string, string>>({});

  // Step 2
  const [inputMode, setInputMode] = useState<'json' | 'csv'>('json');
  const [jsonInput, setJsonInput] = useState('');
  const [csvInput, setCsvInput] = useState('');
  const [blankAsUndefined, setBlankAsUndefined] = useState(false);
  const [parsedRecipients, setParsedRecipients] = useState<BulkRecipient[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [previewPage, setPreviewPage] = useState(0);

  // Step 3
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<BulkSendResponse | null>(null);
  const [batchStatus, setBatchStatus] = useState<BulkBatch | null>(null);
  const [batchItems, setBatchItems] = useState<BulkBatchItem[]>([]);
  const [batchItemsTotal, setBatchItemsTotal] = useState(0);
  const [itemsPage, setItemsPage] = useState(0);
  const ITEMS_PAGE_SIZE = 50;
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load accounts + templates
  useEffect(() => {
    getAccounts().then((d) => setAccounts(Array.isArray(d) ? d : [])).catch(() => {});
    getTemplates().then((d) => setTemplates(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // Load template variables
  useEffect(() => {
    let active = true;
    if (!templateId) { setTemplateVariables([]); setTemplateVarsError(''); setTemplateVarsLoading(false); return; }
    setTemplateVarsLoading(true);
    setTemplateVarsError('');
    getTemplateContent(templateId)
      .then((content) => { if (active) setTemplateVariables(extractTemplateVariables(content)); })
      .catch(() => { if (active) { setTemplateVariables([]); setTemplateVarsError('Failed to load template variables.'); } })
      .finally(() => { if (active) setTemplateVarsLoading(false); });
    return () => { active = false; };
  }, [templateId]);

  // Parse recipients on input change
  useEffect(() => {
    if (inputMode === 'json') {
      if (!jsonInput.trim()) { setParsedRecipients([]); setParseErrors([]); return; }
      try {
        const parsed = JSON.parse(jsonInput);
        if (!Array.isArray(parsed)) { setParseErrors(['Input must be a JSON array']); setParsedRecipients([]); return; }
        const invalidIndex = parsed.findIndex((entry) => !isBulkRecipient(entry));
        if (invalidIndex !== -1) {
          setParseErrors([`Recipient at index ${invalidIndex} must contain a string recipient and optional values object`]);
          setParsedRecipients([]);
          return;
        }
        setParsedRecipients(parsed);
        setParseErrors([]);
      } catch {
        setParseErrors(['Invalid JSON']);
        setParsedRecipients([]);
      }
    } else {
      if (!csvInput.trim()) { setParsedRecipients([]); setParseErrors([]); return; }
      const { recipients, errors } = parseCsv(csvInput, blankAsUndefined);
      setParsedRecipients(recipients);
      setParseErrors(errors);
    }
    setPreviewPage(0);
  }, [inputMode, jsonInput, csvInput, blankAsUndefined]);

  // Polling
  useEffect(() => {
    if (!submitResult?.batchId) return;
    if (batchStatus?.completedAt) return;

    const poll = async () => {
      const res = await getBulkBatchStatus(submitResult.batchId!, {
        skip: itemsPage * ITEMS_PAGE_SIZE,
        take: ITEMS_PAGE_SIZE,
      }).catch(() => null);
      if (!res?.success || !res.batch) return;
      setBatchStatus(res.batch);
      setBatchItems(res.items ?? []);
      setBatchItemsTotal(res.total ?? 0);
      if (res.batch.completedAt && pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };

    pollingRef.current = setInterval(poll, 5000);
    poll();
    return () => {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    };
  }, [submitResult?.batchId, batchStatus?.completedAt, itemsPage]);

  const sharedValueResult = useMemo((): {
    values: Record<string, unknown> | null;
    error: string;
  } => {
    if (sharedJsonMode) {
      try {
        const parsed: unknown = JSON.parse(sharedJsonRaw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return { values: null, error: 'Shared values must be a JSON object' };
        }
        return { values: parsed as Record<string, unknown>, error: '' };
      } catch {
        return { values: null, error: 'Invalid JSON' };
      }
    }
    return { values: kvRowsToObject(sharedKvRows), error: '' };
  }, [sharedJsonMode, sharedJsonRaw, sharedKvRows]);
  const sharedValues = sharedValueResult.values;
  const sharedJsonError = sharedValueResult.error;

  const mergedPreview = useMemo(() => {
    const shared = sharedValues ?? {};
    return parsedRecipients.map((r) => ({ recipient: r.recipient, merged: { ...shared, ...(r.values ?? {}) } }));
  }, [parsedRecipients, sharedValues]);

  const displayedPreview = useMemo(() => {
    const start = previewPage * PREVIEW_LIMIT;
    return mergedPreview.slice(start, start + PREVIEW_LIMIT);
  }, [mergedPreview, previewPage]);

  const invalidEmailCount = useMemo(
    () => parsedRecipients.filter((r) => !EMAIL_REGEX.test(r.recipient ?? '')).length,
    [parsedRecipients],
  );

  // Step navigation
  const goToStep2 = () => {
    const errs: Record<string, string> = {};
    if (!accountId) errs.accountId = 'Select an account';
    if (!templateId) errs.templateId = 'Select a template';
    if (sharedJsonMode && sharedValues === null) errs.sharedValues = 'Fix JSON errors first';
    const d = delaySeconds;
    if (!Number.isFinite(d) || d < 5 || d > 600) errs.delay = 'Delay must be between 5 and 600 seconds';
    setStep1Errors(errs);
    if (Object.keys(errs).length === 0) setStep(2);
  };

  const goToStep3 = () => {
    if (parsedRecipients.length === 0) return;
    setStep(3);
  };

  const handleSubmit = async () => {
    if (sharedValues === null) return;
    setSubmitting(true);
    const res = await sendBulkMail({
      accountId,
      templateId,
      sharedValues: Object.keys(sharedValues).length > 0 ? sharedValues : undefined,
      recipients: parsedRecipients,
      options: { minDelayMs: delaySeconds * 1000 },
    }).catch(() => ({ success: false, message: 'Network error' }));
    setSubmitting(false);
    setSubmitResult(res);
  };

  const downloadRejectedCsv = () => {
    if (!submitResult?.rejectedItems?.length) return;
    const header = 'index,recipient,error';
    const rows = submitResult.rejectedItems.map((r) => [
      String(r.index),
      escapeCsvCell(r.recipient ?? ''),
      escapeCsvCell(r.error),
    ].join(','));
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rejected-${submitResult.batchId ?? 'batch'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const autofillSharedJson = () => {
    let base: Record<string, unknown> = {};
    try { const p = JSON.parse(sharedJsonRaw); if (p && typeof p === 'object' && !Array.isArray(p)) base = p as Record<string, unknown>; } catch {}
    const next = { ...base };
    for (const v of templateVariables) { if (!(v in next)) next[v] = ''; }
    setSharedJsonRaw(JSON.stringify(next, null, 2));
  };

  const autofillSharedKv = () => {
    const existingKeys = new Set(sharedKvRows.map((r) => r.key.trim()).filter((k) => templateVariables.includes(k)));
    const missing = templateVariables.filter((v) => !existingKeys.has(v)).map((v) => ({ key: v, value: '' }));
    if (missing.length > 0) setSharedKvRows((rows) => [...rows, ...missing]);
  };

  const delayMs = delaySeconds * 1000;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Bulk Send</h2>
        <p className="text-muted-foreground">Send paced emails to multiple recipients</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {(['Setup', 'Recipients', 'Review'].map((label, i) => {
          const n = (i + 1) as Step;
          return (
            <span key={label} className="flex items-center gap-2">
              <span className={`rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium ${step === n ? 'bg-primary text-primary-foreground' : step > n ? 'bg-primary/30 text-primary' : 'bg-muted text-muted-foreground'}`}>{n}</span>
              <span className={step === n ? 'font-medium' : 'text-muted-foreground'}>{label}</span>
              {i < 2 && <span className="text-muted-foreground">/</span>}
            </span>
          );
        }))}
      </div>

      {/* ─── Step 1: Setup ─── */}
      {step === 1 && (
        <Card className="max-w-2xl">
          <CardHeader><CardTitle>Setup</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {/* Account */}
            <div className="grid gap-1.5">
              <Label htmlFor="account">Account</Label>
              <Select value={accountId} onValueChange={(v) => { setAccountId(v); setStep1Errors((e) => ({ ...e, accountId: '' })); }}>
                <SelectTrigger id="account"><SelectValue placeholder="Select an SMTP account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} ({a.username})</SelectItem>)}
                </SelectContent>
              </Select>
              {step1Errors.accountId && <p className="text-xs text-red-500">{step1Errors.accountId}</p>}
            </div>

            {/* Template */}
            <div className="grid gap-1.5">
              <Label htmlFor="template">Template</Label>
              <Select value={templateId} onValueChange={(v) => { setTemplateId(v); setStep1Errors((e) => ({ ...e, templateId: '' })); }}>
                <SelectTrigger id="template"><SelectValue placeholder="Select a template" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {step1Errors.templateId && <p className="text-xs text-red-500">{step1Errors.templateId}</p>}

              {templateId && (
                <div className="rounded-md border border-dashed p-3 space-y-2">
                  <p className="text-sm font-medium">Detected Template Variables</p>
                  {templateVarsLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
                  {!templateVarsLoading && templateVarsError && <p className="text-xs text-red-500">{templateVarsError}</p>}
                  {!templateVarsLoading && !templateVarsError && templateVariables.length === 0 && (
                    <p className="text-xs text-muted-foreground">No <code>{'{{ variable }}'}</code> placeholders found.</p>
                  )}
                  {!templateVarsLoading && !templateVarsError && templateVariables.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {templateVariables.map((v) => <code key={v} className="rounded bg-muted px-2 py-1 text-xs">{v}</code>)}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Shared values */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Shared Values <span className="text-xs text-muted-foreground">(applied to all recipients)</span></Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">JSON mode</span>
                  <Switch checked={sharedJsonMode} onCheckedChange={setSharedJsonMode} />
                </div>
              </div>
              {sharedJsonMode ? (
                <div className="grid gap-1.5">
                  <div className="flex justify-end">
                    <Button type="button" variant="outline" size="sm" onClick={autofillSharedJson} disabled={templateVariables.length === 0}>
                      Autofill Template Keys
                    </Button>
                  </div>
                  <Textarea className="font-mono text-sm" rows={5} value={sharedJsonRaw} onChange={(e) => setSharedJsonRaw(e.target.value)} placeholder='{"key": "value"}' />
                  {sharedJsonError && <p className="text-xs text-red-500">{sharedJsonError}</p>}
                  {step1Errors.sharedValues && <p className="text-xs text-red-500">{step1Errors.sharedValues}</p>}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-end">
                    <Button type="button" variant="outline" size="sm" onClick={autofillSharedKv} disabled={templateVariables.length === 0}>
                      Autofill Template Keys
                    </Button>
                  </div>
                  {sharedKvRows.map((row, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Input placeholder="Key" value={row.key} onChange={(e) => setSharedKvRows((rows) => rows.map((r, idx) => idx === i ? { ...r, key: e.target.value } : r))} className="flex-1" />
                      <Input placeholder="Value" value={row.value} onChange={(e) => setSharedKvRows((rows) => rows.map((r, idx) => idx === i ? { ...r, value: e.target.value } : r))} className="flex-1" />
                      <Button variant="ghost" size="icon" onClick={() => setSharedKvRows((rows) => rows.filter((_, idx) => idx !== i))} disabled={sharedKvRows.length === 1} className="shrink-0">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setSharedKvRows((rows) => [...rows, { key: '', value: '' }])}>
                    <Plus className="h-4 w-4 mr-2" />Add Row
                  </Button>
                </div>
              )}
            </div>

            {/* Pacing */}
            <div className="grid gap-1.5">
              <Label htmlFor="delay">Pacing delay between emails (seconds)</Label>
              <Input
                id="delay"
                type="number"
                min={5}
                max={600}
                value={delaySeconds}
                onChange={(e) => { setDelaySeconds(Number(e.target.value)); setStep1Errors((err) => ({ ...err, delay: '' })); }}
                className="max-w-[160px]"
              />
              <p className="text-xs text-muted-foreground">Min 5s, max 600s (10 min)</p>
              {step1Errors.delay && <p className="text-xs text-red-500">{step1Errors.delay}</p>}
            </div>

            <Button onClick={goToStep2} className="w-full">
              Next: Add Recipients
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── Step 2: Recipients ─── */}
      {step === 2 && (
        <div className="space-y-4 max-w-4xl">
          <Card>
            <CardHeader><CardTitle>Recipients</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {/* Input mode toggle */}
              <div className="flex items-center gap-3">
                <span className={`text-sm ${inputMode === 'json' ? 'font-medium' : 'text-muted-foreground'}`}>JSON</span>
                <Switch checked={inputMode === 'csv'} onCheckedChange={(v) => setInputMode(v ? 'csv' : 'json')} />
                <span className={`text-sm ${inputMode === 'csv' ? 'font-medium' : 'text-muted-foreground'}`}>CSV</span>
              </div>

              {inputMode === 'json' ? (
                <div className="grid gap-1.5">
                  <Label>Recipient list (JSON array)</Label>
                  <Textarea
                    className="font-mono text-sm"
                    rows={10}
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    placeholder={`[\n  { "recipient": "alice@example.com", "values": { "name": "Alice" } },\n  { "recipient": "bob@example.com" }\n]`}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid gap-1.5">
                    <Label>Recipient list (CSV)</Label>
                    <Textarea
                      className="font-mono text-sm"
                      rows={10}
                      value={csvInput}
                      onChange={(e) => setCsvInput(e.target.value)}
                      placeholder={"recipient,name,promo_code\nalice@example.com,Alice,SAVE10\nbob@example.com,Bob,"}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch id="blank-as-undef" checked={blankAsUndefined} onCheckedChange={setBlankAsUndefined} />
                    <Label htmlFor="blank-as-undef" className="text-sm">Treat blank cells as no override (use shared value)</Label>
                  </div>
                </div>
              )}

              {parseErrors.length > 0 && (
                <div className="rounded-md bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 px-4 py-3 text-sm space-y-1">
                  {parseErrors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}

              {parsedRecipients.length > 0 && invalidEmailCount > 0 && (
                <div className="rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 px-4 py-3 text-sm">
                  {invalidEmailCount} recipient{invalidEmailCount !== 1 ? 's' : ''} have invalid email addresses and will likely be rejected.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Preview table */}
          {parsedRecipients.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Preview — {parsedRecipients.length} recipient{parsedRecipients.length !== 1 ? 's' : ''}
                  {parsedRecipients.length > PREVIEW_LIMIT && ` (showing ${previewPage * PREVIEW_LIMIT + 1}–${Math.min((previewPage + 1) * PREVIEW_LIMIT, parsedRecipients.length)} of ${parsedRecipients.length})`}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-auto max-h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Merged Values</TableHead>
                        <TableHead className="w-20">Valid</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayedPreview.map((row, i) => {
                        const globalIdx = previewPage * PREVIEW_LIMIT + i;
                        const isValid = EMAIL_REGEX.test(row.recipient ?? '');
                        return (
                          <TableRow key={globalIdx}>
                            <TableCell className="text-muted-foreground text-xs">{globalIdx + 1}</TableCell>
                            <TableCell className="font-mono text-sm">{row.recipient || <span className="text-red-500 italic">empty</span>}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground max-w-xs truncate">
                              {Object.keys(row.merged).length > 0 ? JSON.stringify(row.merged) : '—'}
                            </TableCell>
                            <TableCell>
                              <Badge variant={isValid ? 'default' : 'destructive'}>{isValid ? 'OK' : 'Invalid'}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {parsedRecipients.length > PREVIEW_LIMIT && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <Button variant="outline" size="sm" onClick={() => setPreviewPage((p) => Math.max(0, p - 1))} disabled={previewPage === 0}>
                      <ChevronLeft className="h-4 w-4 mr-1" />Prev
                    </Button>
                    <span className="text-sm text-muted-foreground">Page {previewPage + 1} of {Math.ceil(parsedRecipients.length / PREVIEW_LIMIT)}</span>
                    <Button variant="outline" size="sm" onClick={() => setPreviewPage((p) => p + 1)} disabled={(previewPage + 1) * PREVIEW_LIMIT >= parsedRecipients.length}>
                      Next<ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ChevronLeft className="h-4 w-4 mr-1" />Back
            </Button>
            <Button onClick={goToStep3} disabled={parsedRecipients.length === 0 || parseErrors.length > 0}>
              Next: Review
            </Button>
          </div>
        </div>
      )}

      {/* ─── Step 3: Review & Status ─── */}
      {step === 3 && (
        <div className="space-y-4 max-w-2xl">
          {!submitResult ? (
            <>
              {/* Pre-submit summary */}
              <Card>
                <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <span className="text-muted-foreground">Recipients</span>
                    <span className="font-medium">{parsedRecipients.length}</span>
                    <span className="text-muted-foreground">Pacing delay</span>
                    <span className="font-medium">{formatMs(delayMs)}</span>
                    <span className="text-muted-foreground">Estimated completion</span>
                    <span className="font-medium">{estimatedCompletion(parsedRecipients.length, delayMs)}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Sample payloads */}
              <Card>
                <CardHeader><CardTitle className="text-base">Sample Payloads (first 3)</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {mergedPreview.slice(0, 3).map((row, i) => (
                    <div key={i} className="rounded-md bg-muted p-3">
                      <p className="text-xs text-muted-foreground mb-1">#{i + 1} — {row.recipient}</p>
                      <pre className="text-xs overflow-auto">{JSON.stringify(row.merged, null, 2)}</pre>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <div className="rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 px-4 py-3 text-sm">
                Bulk sends are paced automatically and may continue after closing this page.
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ChevronLeft className="h-4 w-4 mr-1" />Back
                </Button>
                <Button onClick={handleSubmit} disabled={submitting}>
                  <Send className="h-4 w-4 mr-2" />
                  {submitting ? 'Submitting…' : 'Submit Bulk Send'}
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Post-submit */}
              <div className={`rounded-md px-4 py-3 text-sm ${submitResult.success ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'}`}>
                {submitResult.success ? (
                  <div className="space-y-1">
                    <p className="font-medium">Bulk batch accepted</p>
                    <p>Batch ID: <code className="font-mono">{submitResult.batchId}</code></p>
                    <p>{submitResult.acceptedCount} accepted, {submitResult.rejectedCount} rejected — delay {formatMs(submitResult.effectiveMinDelayMs ?? delayMs)}</p>
                  </div>
                ) : (
                  <p>{submitResult.message ?? 'Failed to create bulk batch'}</p>
                )}
              </div>

              {/* Rejected items */}
              {(submitResult.rejectedItems?.length ?? 0) > 0 && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base">Rejected Items ({submitResult.rejectedItems!.length})</CardTitle>
                    <Button variant="outline" size="sm" onClick={downloadRejectedCsv}>
                      <Download className="h-4 w-4 mr-2" />Download CSV
                    </Button>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>Recipient</TableHead>
                          <TableHead>Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {submitResult.rejectedItems!.map((item) => (
                          <TableRow key={item.index}>
                            <TableCell className="text-xs text-muted-foreground">{item.index}</TableCell>
                            <TableCell className="font-mono text-sm">{item.recipient}</TableCell>
                            <TableCell className="text-sm text-red-600 dark:text-red-400">{item.error}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Batch status */}
              {batchStatus && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base">
                      Batch Status
                      {batchStatus.completedAt
                        ? <Badge variant="default" className="ml-2 text-xs">Completed</Badge>
                        : <Badge variant="outline" className="ml-2 text-xs">In Progress</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Count by status */}
                    {Object.keys(batchStatus.countsByStatus).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(batchStatus.countsByStatus).map(([s, count]) => (
                          <Badge key={s} variant={statusBadgeVariant(s)} className="gap-1">
                            {s} <span className="font-bold">{count}</span>
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Items table */}
                    {batchItems.length > 0 && (
                      <>
                        <div className="overflow-auto max-h-96">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-12">#</TableHead>
                                <TableHead>Recipient</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Scheduled</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {batchItems.map((item) => (
                                <TableRow key={item.id}>
                                  <TableCell className="text-xs text-muted-foreground">{item.sequence + 1}</TableCell>
                                  <TableCell className="font-mono text-sm">{item.recipient}</TableCell>
                                  <TableCell>
                                    <Badge variant={statusBadgeVariant(item.status)}>{item.status}</Badge>
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground">
                                    {item.scheduledFor ? new Date(item.scheduledFor).toLocaleString() : '—'}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        {batchItemsTotal > ITEMS_PAGE_SIZE && (
                          <div className="flex items-center justify-between">
                            <Button variant="outline" size="sm" onClick={() => setItemsPage((p) => Math.max(0, p - 1))} disabled={itemsPage === 0}>
                              <ChevronLeft className="h-4 w-4 mr-1" />Prev
                            </Button>
                            <span className="text-sm text-muted-foreground">
                              {itemsPage * ITEMS_PAGE_SIZE + 1}–{Math.min((itemsPage + 1) * ITEMS_PAGE_SIZE, batchItemsTotal)} of {batchItemsTotal}
                            </span>
                            <Button variant="outline" size="sm" onClick={() => setItemsPage((p) => p + 1)} disabled={(itemsPage + 1) * ITEMS_PAGE_SIZE >= batchItemsTotal}>
                              Next<ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {!batchStatus && submitResult.success && (
                <p className="text-sm text-muted-foreground">Loading batch status…</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
