const API_URL = '/api';

type JsonRecord = Record<string, unknown>;

const defaultJsonHeaders = {
  'Content-Type': 'application/json',
} as const;

function getApiKeyHeader(): Record<string, string> {
  const apiKey = process.env.NEXT_PUBLIC_DASHBOARD_API_KEY;
  return apiKey ? { 'x-api-key': apiKey } : {};
}

function mergeHeaders(
  ...headersList: Array<HeadersInit | undefined>
): HeadersInit {
  const merged = new Headers();
  for (const headers of headersList) {
    if (!headers) continue;
    const current = new Headers(headers);
    current.forEach((value, key) => merged.set(key, value));
  }
  return merged;
}

async function fetchApi(path: string, init?: RequestInit): Promise<Response> {
  const headers = mergeHeaders(getApiKeyHeader(), init?.headers);
  return fetch(`${API_URL}${path}`, { ...init, headers });
}

async function readJson(res: Response): Promise<unknown> {
  return res.json().catch(() => null);
}

function asObject(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asSuccessResponse(
  value: unknown,
  fallbackMessage: string,
): { success: boolean; message: string } {
  const payload = asObject(value);
  const success = payload.success === true;
  const message =
    typeof payload.message === 'string'
      ? payload.message
      : success
        ? 'ok'
        : fallbackMessage;
  return { success, message };
}

// --- Stats ---

export interface Stats {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  retrying: number;
  queued?: number;
  processing?: number;
  dead?: number;
  successRate: number;
}

export const getStats = async (): Promise<Stats> => {
  const res = await fetchApi('/stats');
  const payload = asObject(await readJson(res));
  if (!res.ok) {
    return { total: 0, sent: 0, failed: 0, pending: 0, retrying: 0, successRate: 0 };
  }
  return {
    total: typeof payload.total === 'number' ? payload.total : 0,
    sent: typeof payload.sent === 'number' ? payload.sent : 0,
    failed: typeof payload.failed === 'number' ? payload.failed : 0,
    pending: typeof payload.pending === 'number' ? payload.pending : 0,
    retrying: typeof payload.retrying === 'number' ? payload.retrying : 0,
    queued: typeof payload.queued === 'number' ? payload.queued : undefined,
    processing: typeof payload.processing === 'number' ? payload.processing : undefined,
    dead: typeof payload.dead === 'number' ? payload.dead : undefined,
    successRate: typeof payload.successRate === 'number' ? payload.successRate : 0,
  };
};

// --- Health ---

export interface Health {
  status: string;
  message: string;
  version: string;
}

export const getHealth = async (): Promise<Health> => {
  const res = await fetchApi('/health');
  const payload = asObject(await readJson(res));
  return {
    status: typeof payload.status === 'string' ? payload.status : (res.ok ? 'ok' : 'error'),
    message: typeof payload.message === 'string' ? payload.message : (res.ok ? 'ok' : 'Unavailable'),
    version: typeof payload.version === 'string' ? payload.version : 'unknown',
  };
};

// --- Workers ---

export interface Worker {
  id: string;
  startedAt: string;
  lastHeartbeat: string;
  version: string;
  metadata: Record<string, unknown>;
}

export const getWorkers = async (): Promise<Worker[]> => {
  const res = await fetchApi('/workers');
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    return [];
  }
  return Array.isArray(payload) ? (payload as Worker[]) : [];
};

// --- Jobs ---

export const getJobs = async (): Promise<unknown[]> => {
  const res = await fetchApi('/jobs');
  const payload = await readJson(res);
  if (!res.ok) return [];
  return asArray(payload);
};

// --- Logs ---

export interface LogEntry {
  id: string;
  recipient: string;
  status: string;
  retryCount: number;
  completedAt: string | null;
  createdAt: string;
  account: { id: string; name: string };
  template: { id: string; name: string };
}

export interface LogsResponse {
  data: LogEntry[];
  total: number;
}

export interface LogsParams {
  skip?: number;
  take?: number;
  status?: string;
  recipient?: string;
}

export const getLogs = async (params: LogsParams = {}): Promise<LogsResponse> => {
  const query = new URLSearchParams();
  if (params.skip !== undefined) query.set('skip', String(params.skip));
  if (params.take !== undefined) query.set('take', String(params.take));
  if (params.status) query.set('status', params.status);
  if (params.recipient) query.set('recipient', params.recipient);
  const res = await fetchApi(`/logs?${query}`);
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    return { data: [], total: 0 };
  }

  const data = Array.isArray((payload as { data?: unknown })?.data)
    ? ((payload as { data: LogEntry[] }).data)
    : [];
  const totalRaw = (payload as { total?: unknown })?.total;
  const total = typeof totalRaw === 'number' && Number.isFinite(totalRaw) ? totalRaw : data.length;
  return { data, total };
};

// --- Accounts ---

export interface Account {
  id: string;
  name: string;
  username: string;
  emailHost: string;
  emailPort: number;
  createdAt: string;
}

export interface AccountRequest {
  name: string;
  username: string;
  password: string;
  emailHost: string;
  emailPort: number;
}

export const getAccounts = async (): Promise<Account[]> => {
  const res = await fetchApi('/account');
  const payload = await readJson(res);
  if (!res.ok) return [];
  return asArray<Account>(payload);
};

export const createAccount = async (data: AccountRequest): Promise<{ success: boolean; message: string }> => {
  const res = await fetchApi('/account', {
    method: 'POST',
    headers: defaultJsonHeaders,
    body: JSON.stringify(data),
  });
  return asSuccessResponse(await readJson(res), 'Failed to create account');
};

export const deleteAccount = async (id: string): Promise<{ success: boolean }> => {
  const res = await fetchApi(`/account/${id}`, { method: 'DELETE' });
  const payload = asObject(await readJson(res));
  return { success: payload.success === true && res.ok };
};

// --- Buckets ---

export interface Bucket {
  id: string;
  name: string;
  path: string;
  region: string;
}

export interface BucketRequest {
  name: string;
  path: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export const getBuckets = async (): Promise<Bucket[]> => {
  const res = await fetchApi('/bucket');
  const payload = await readJson(res);
  if (!res.ok) return [];
  return asArray<Bucket>(payload);
};

export const createBucket = async (data: BucketRequest): Promise<{ success: boolean; message: string }> => {
  const res = await fetchApi('/bucket', {
    method: 'POST',
    headers: defaultJsonHeaders,
    body: JSON.stringify(data),
  });
  return asSuccessResponse(await readJson(res), 'Failed to create bucket');
};

export const deleteBucket = async (id: string): Promise<{ success: boolean }> => {
  const res = await fetchApi(`/bucket/${id}`, { method: 'DELETE' });
  const payload = asObject(await readJson(res));
  return { success: payload.success === true && res.ok };
};

// --- Templates ---

export interface Template {
  id: string;
  name: string;
  subject: string;
  storageType: string;
  createdAt: string;
}

export interface TemplateCreateRequest {
  name: string;
  subject: string;
  content: string;
  storageType?: 'LOCAL' | 'S3';
}

export interface TemplateUpdateRequest {
  name?: string;
  subject?: string;
  content?: string;
}

export const getTemplates = async (): Promise<Template[]> => {
  const res = await fetchApi('/template');
  const payload = await readJson(res);
  if (!res.ok) return [];
  return asArray<Template>(payload);
};

export const getTemplateContent = async (id: string): Promise<string> => {
  const res = await fetchApi(`/template/${id}`);
  if (!res.ok) throw new Error(`Failed to load template ${id}`);
  return res.text();
};

export const createTemplate = async (data: TemplateCreateRequest): Promise<{ success: boolean; message: string }> => {
  const res = await fetchApi('/template', {
    method: 'POST',
    headers: defaultJsonHeaders,
    body: JSON.stringify(data),
  });
  return asSuccessResponse(await readJson(res), 'Failed to create template');
};

export const updateTemplate = async (id: string, data: TemplateUpdateRequest): Promise<{ success: boolean; message?: string }> => {
  const res = await fetchApi(`/template/${id}`, {
    method: 'PATCH',
    headers: defaultJsonHeaders,
    body: JSON.stringify(data),
  });
  const payload = asObject(await readJson(res));
  return {
    success: payload.success === true && res.ok,
    message: typeof payload.message === 'string' ? payload.message : undefined,
  };
};

export const deleteTemplate = async (id: string): Promise<{ success: boolean }> => {
  const res = await fetchApi(`/template/${id}`, { method: 'DELETE' });
  const payload = asObject(await readJson(res));
  return { success: payload.success === true && res.ok };
};

// --- Send Mail ---

export interface MailJobRequest {
  accountId: string;
  templateId: string;
  recipient: string;
  values: Record<string, unknown>;
}

export interface SendMailResponse {
  success: boolean;
  message?: string;
  jobId?: string;
  status?: string;
}

export const sendMail = async (data: MailJobRequest): Promise<SendMailResponse> => {
  const res = await fetchApi('/send', {
    method: 'POST',
    headers: defaultJsonHeaders,
    body: JSON.stringify(data),
  });
  const payload = asObject(await readJson(res));
  return {
    success: payload.success === true && res.ok,
    message: typeof payload.message === 'string' ? payload.message : undefined,
    jobId: typeof payload.jobId === 'string' ? payload.jobId : undefined,
    status: typeof payload.status === 'string' ? payload.status : undefined,
  };
};
