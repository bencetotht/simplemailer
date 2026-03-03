const API_URL = '/api';

// --- Stats ---

export interface Stats {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  retrying: number;
  successRate: number;
}

export const getStats = async (): Promise<Stats> => {
  const res = await fetch(`${API_URL}/stats`);
  return res.json();
};

// --- Health ---

export interface Health {
  status: string;
  message: string;
  version: string;
}

export const getHealth = async (): Promise<Health> => {
  const res = await fetch(`${API_URL}/health`);
  return res.json();
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
  const res = await fetch(`${API_URL}/workers`);
  return res.json();
};

// --- Jobs ---

export const getJobs = async (): Promise<unknown[]> => {
  const res = await fetch(`${API_URL}/jobs`);
  return res.json();
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
  const res = await fetch(`${API_URL}/logs?${query}`);
  return res.json();
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
  const res = await fetch(`${API_URL}/account`);
  return res.json();
};

export const createAccount = async (data: AccountRequest): Promise<{ success: boolean; message: string }> => {
  const res = await fetch(`${API_URL}/account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
};

export const deleteAccount = async (id: string): Promise<{ success: boolean }> => {
  const res = await fetch(`${API_URL}/account/${id}`, { method: 'DELETE' });
  return res.json();
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
  const res = await fetch(`${API_URL}/bucket`);
  return res.json();
};

export const createBucket = async (data: BucketRequest): Promise<{ success: boolean; message: string }> => {
  const res = await fetch(`${API_URL}/bucket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
};

export const deleteBucket = async (id: string): Promise<{ success: boolean }> => {
  const res = await fetch(`${API_URL}/bucket/${id}`, { method: 'DELETE' });
  return res.json();
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
  const res = await fetch(`${API_URL}/template`);
  return res.json();
};

export const getTemplateContent = async (id: string): Promise<string> => {
  const res = await fetch(`${API_URL}/template/${id}`);
  if (!res.ok) throw new Error(`Failed to load template ${id}`);
  return res.text();
};

export const createTemplate = async (data: TemplateCreateRequest): Promise<{ success: boolean; message: string }> => {
  const res = await fetch(`${API_URL}/template`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
};

export const updateTemplate = async (id: string, data: TemplateUpdateRequest): Promise<{ success: boolean; message?: string }> => {
  const res = await fetch(`${API_URL}/template/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
};

export const deleteTemplate = async (id: string): Promise<{ success: boolean }> => {
  const res = await fetch(`${API_URL}/template/${id}`, { method: 'DELETE' });
  return res.json();
};

// --- Send Mail ---

export interface MailJobRequest {
  accountId: string;
  templateId: string;
  recipient: string;
  values: Record<string, unknown>;
}

export const sendMail = async (data: MailJobRequest): Promise<{ success: boolean; message?: string }> => {
  const res = await fetch(`${API_URL}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
};
