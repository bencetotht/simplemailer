'use client';

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { getAccounts, getTemplateContent, getTemplates, sendMail, type Account, type Template } from "@/lib/api";
import { mailJobSchema } from "@/lib/validators";
import { Plus, Trash2, Send } from "lucide-react";

interface KVRow { key: string; value: string; }

const JINJA_VARIABLE_REGEX = /{{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*}}/g;

function extractTemplateVariables(content: string): string[] {
  const variables = new Set<string>();
  for (const match of content.matchAll(JINJA_VARIABLE_REGEX)) {
    const variable = match[1]?.trim();
    if (variable) variables.add(variable);
  }
  return Array.from(variables).sort((a, b) => a.localeCompare(b));
}

export default function SendPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [accountId, setAccountId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [recipient, setRecipient] = useState('');
  const [kvRows, setKvRows] = useState<KVRow[]>([{ key: '', value: '' }]);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonRaw, setJsonRaw] = useState('{}');
  const [jsonError, setJsonError] = useState('');
  const [templateVariables, setTemplateVariables] = useState<string[]>([]);
  const [templateVarsLoading, setTemplateVarsLoading] = useState(false);
  const [templateVarsError, setTemplateVarsError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    getAccounts().then(setAccounts).catch(() => []);
    getTemplates().then(setTemplates).catch(() => []);
  }, []);

  useEffect(() => {
    let isActive = true;

    if (!templateId) {
      setTemplateVariables([]);
      setTemplateVarsError('');
      setTemplateVarsLoading(false);
      return;
    }

    setTemplateVarsLoading(true);
    setTemplateVarsError('');

    getTemplateContent(templateId)
      .then((content) => {
        if (!isActive) return;
        setTemplateVariables(extractTemplateVariables(content));
      })
      .catch(() => {
        if (!isActive) return;
        setTemplateVariables([]);
        setTemplateVarsError('Failed to load template variables.');
      })
      .finally(() => {
        if (isActive) setTemplateVarsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [templateId]);

  const providedValueKeys = useMemo(() => {
    if (jsonMode) {
      try {
        const parsed = JSON.parse(jsonRaw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Set<string>();
        return new Set(Object.keys(parsed as Record<string, unknown>).map((k) => k.trim()).filter(Boolean));
      } catch {
        return new Set<string>();
      }
    }

    return new Set(kvRows.map((row) => row.key.trim()).filter(Boolean));
  }, [jsonMode, jsonRaw, kvRows]);

  const missingTemplateVariables = useMemo(
    () => templateVariables.filter((variable) => !providedValueKeys.has(variable)),
    [templateVariables, providedValueKeys],
  );

  const buildValues = (): Record<string, unknown> | null => {
    if (jsonMode) {
      try {
        const parsed = JSON.parse(jsonRaw);
        setJsonError('');
        return parsed;
      } catch {
        setJsonError('Invalid JSON');
        return null;
      }
    }
    const out: Record<string, unknown> = {};
    for (const { key, value } of kvRows) {
      if (key.trim()) out[key.trim()] = value;
    }
    return out;
  };

  const handleSubmit = async () => {
    setFeedback(null);
    const values = buildValues();
    if (values === null) return;

    const parsed = mailJobSchema.safeParse({ accountId, templateId, recipient, values });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed.error.flatten().fieldErrors)) {
        fieldErrors[k] = (v as string[])[0];
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSending(true);
    const res = await sendMail(parsed.data).catch(() => ({ success: false, message: 'Network error' }));
    setSending(false);
    if (res.success) {
      setFeedback({ ok: true, msg: 'Mail job queued successfully.' });
      setRecipient('');
      setKvRows([{ key: '', value: '' }]);
      setJsonRaw('{}');
    } else {
      setFeedback({ ok: false, msg: res.message ?? 'Failed to queue job.' });
    }
  };

  const updateRow = (i: number, field: keyof KVRow, val: string) => {
    setKvRows((rows) => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  };

  const addRow = () => setKvRows((rows) => [...rows, { key: '', value: '' }]);

  const removeRow = (i: number) => setKvRows((rows) => rows.filter((_, idx) => idx !== i));

  const autofillJsonKeys = () => {
    let base: Record<string, unknown> = {};

    try {
      const parsed = JSON.parse(jsonRaw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        base = parsed as Record<string, unknown>;
      }
    } catch {
      // Ignore invalid JSON and start from an empty object.
    }

    const next: Record<string, unknown> = { ...base };
    for (const variable of templateVariables) {
      if (!(variable in next)) next[variable] = '';
    }

    setJsonRaw(JSON.stringify(next, null, 2));
    setJsonError('');
  };

  const autofillKvKeys = () => {
    if (templateVariables.length === 0) return;

    const valuesByKey = new Map<string, string>();
    for (const row of kvRows) {
      const key = row.key.trim();
      if (key && !valuesByKey.has(key)) valuesByKey.set(key, row.value);
    }

    const existingTemplateKeys = new Set(
      kvRows.map((row) => row.key.trim()).filter((key) => templateVariables.includes(key)),
    );
    const missingRows = templateVariables
      .filter((variable) => !existingTemplateKeys.has(variable))
      .map((variable) => ({ key: variable, value: valuesByKey.get(variable) ?? '' }));

    if (missingRows.length > 0) {
      setKvRows((rows) => [...rows, ...missingRows]);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Send Mail</h2>
        <p className="text-muted-foreground">Queue a mail job for delivery</p>
      </div>

      {feedback && (
        <div className={`rounded-md px-4 py-3 text-sm ${feedback.ok ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'}`}>
          {feedback.msg}
        </div>
      )}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Mail Job</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="account">Account</Label>
            <Select value={accountId} onValueChange={(v) => { setAccountId(v); setErrors((e) => ({ ...e, accountId: '' })); }}>
              <SelectTrigger id="account">
                <SelectValue placeholder="Select an SMTP account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name} ({a.username})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.accountId && <p className="text-xs text-red-500">{errors.accountId}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="template">Template</Label>
            <Select value={templateId} onValueChange={(v) => { setTemplateId(v); setErrors((e) => ({ ...e, templateId: '' })); }}>
              <SelectTrigger id="template">
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.templateId && <p className="text-xs text-red-500">{errors.templateId}</p>}

            {templateId && (
              <div className="rounded-md border border-dashed p-3 space-y-2">
                <p className="text-sm font-medium">Detected Template Variables</p>

                {templateVarsLoading && <p className="text-xs text-muted-foreground">Loading template variables…</p>}

                {!templateVarsLoading && templateVarsError && (
                  <p className="text-xs text-red-500">{templateVarsError}</p>
                )}

                {!templateVarsLoading && !templateVarsError && templateVariables.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No placeholders matching <code>{'{{ variable_name }}'}</code> were found.
                  </p>
                )}

                {!templateVarsLoading && !templateVarsError && templateVariables.length > 0 && (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {templateVariables.map((variable) => (
                        <code key={variable} className="rounded bg-muted px-2 py-1 text-xs">
                          {variable}
                        </code>
                      ))}
                    </div>
                    {missingTemplateVariables.length > 0 ? (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Missing values: {missingTemplateVariables.join(', ')}
                      </p>
                    ) : (
                      <p className="text-xs text-green-700 dark:text-green-400">All template variables are provided.</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="recipient">Recipient</Label>
            <Input
              id="recipient"
              type="email"
              placeholder="recipient@example.com"
              value={recipient}
              onChange={(e) => { setRecipient(e.target.value); setErrors((er) => ({ ...er, recipient: '' })); }}
            />
            {errors.recipient && <p className="text-xs text-red-500">{errors.recipient}</p>}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Template Values</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">JSON mode</span>
                <Switch checked={jsonMode} onCheckedChange={setJsonMode} />
              </div>
            </div>

            {jsonMode ? (
              <div className="grid gap-1.5">
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={autofillJsonKeys}
                    disabled={templateVariables.length === 0 || templateVarsLoading}
                  >
                    Autofill Template Keys
                  </Button>
                </div>
                <Textarea
                  className="font-mono text-sm"
                  rows={6}
                  value={jsonRaw}
                  onChange={(e) => setJsonRaw(e.target.value)}
                  placeholder='{"key": "value"}'
                />
                {jsonError && <p className="text-xs text-red-500">{jsonError}</p>}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={autofillKvKeys}
                    disabled={templateVariables.length === 0 || templateVarsLoading}
                  >
                    Autofill Template Keys
                  </Button>
                </div>
                {kvRows.map((row, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      placeholder="Key"
                      value={row.key}
                      onChange={(e) => updateRow(i, 'key', e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Value"
                      value={row.value}
                      onChange={(e) => updateRow(i, 'value', e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRow(i)}
                      disabled={kvRows.length === 1}
                      className="shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addRow}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Row
                </Button>
              </div>
            )}
          </div>

          <Button onClick={handleSubmit} disabled={sending} className="w-full">
            <Send className="h-4 w-4 mr-2" />
            {sending ? 'Sending…' : 'Queue Mail Job'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
