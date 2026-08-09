import { createHash } from "node:crypto";
import {
  mailerManifestSchema,
  type MailerManifest,
  type ParsedMailerManifest,
  type Sender,
  type Template,
  type UpsertSender,
  type UpsertTemplate,
} from "@simplemailer/contracts";
import type { SimpleMailer } from "./client.js";

export function defineMailer<const T extends MailerManifest>(manifest: T): T {
  mailerManifestSchema.parse(manifest);
  return manifest;
}

export interface ResolvedTemplate extends UpsertTemplate {
  activate: boolean;
}

export interface ResolvedMailerDefinition {
  apiVersion: "simplemailer/v1";
  environment?: string;
  senders: UpsertSender[];
  templates: ResolvedTemplate[];
}

export type ReadTemplateSource = (path: string) => Promise<string>;

export async function resolveMailerDefinition(
  input: MailerManifest,
  readSource: ReadTemplateSource,
): Promise<ResolvedMailerDefinition> {
  const manifest: ParsedMailerManifest = mailerManifestSchema.parse(input);
  return {
    apiVersion: manifest.apiVersion,
    ...(manifest.environment === undefined ? {} : { environment: manifest.environment }),
    senders: manifest.senders.map(({ credential, ...sender }) => ({
      ...sender,
      ...(credential === undefined ? {} : { credential }),
    })),
    templates: await Promise.all(
      manifest.templates.map(async ({ source, activate = false, ...template }) => ({
        ...template,
        source: await readSource(source.path),
        activate,
      })),
    ),
  };
}

export type SyncOperation =
  | { kind: "sender.upsert"; name: string; desired: UpsertSender }
  | { kind: "template.upsert"; name: string; desired: ResolvedTemplate; digest: string }
  | { kind: "template.activate"; name: string; version: string };

export interface SyncPlan {
  operations: SyncOperation[];
  unchanged: { senders: string[]; templates: string[] };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

export function templateDigest(template: UpsertTemplate): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(template)), "utf8")
    .digest("hex");
}

function senderMatches(current: Sender, desired: UpsertSender): boolean {
  return (
    current.alias === desired.alias &&
    current.displayName === desired.displayName &&
    current.fromAddress === desired.fromAddress &&
    current.replyTo === (desired.replyTo ?? null) &&
    current.status === (desired.status ?? "ACTIVE") &&
    current.maxConcurrency === (desired.maxConcurrency ?? null) &&
    current.maxPerMinute === (desired.maxPerMinute ?? null)
  );
}

export function diffMailerDefinition(
  desired: ResolvedMailerDefinition,
  current: { senders: Sender[]; templates: Template[] },
): SyncPlan {
  const operations: SyncOperation[] = [];
  const unchanged = { senders: [] as string[], templates: [] as string[] };
  const senders = new Map(current.senders.map((sender) => [sender.alias, sender]));
  const templates = new Map(current.templates.map((template) => [template.name, template]));

  for (const sender of [...desired.senders].sort((a, b) => a.alias.localeCompare(b.alias))) {
    const existing = senders.get(sender.alias);
    if (existing && senderMatches(existing, sender)) unchanged.senders.push(sender.alias);
    else operations.push({ kind: "sender.upsert", name: sender.alias, desired: sender });
  }

  for (const template of [...desired.templates].sort((a, b) => a.name.localeCompare(b.name))) {
    const existing = templates.get(template.name);
    const { activate, ...upsert } = template;
    const digest = templateDigest(upsert);
    const version = existing?.versions.find((candidate) => candidate.digest === digest);
    if (!version) {
      operations.push({ kind: "template.upsert", name: template.name, desired: template, digest });
    } else if (activate && existing?.activeVersion !== version.version) {
      operations.push({ kind: "template.activate", name: template.name, version: version.version });
    } else {
      unchanged.templates.push(template.name);
    }
  }
  return { operations, unchanged };
}

export async function planMailerSync(
  client: SimpleMailer,
  desired: ResolvedMailerDefinition,
): Promise<SyncPlan> {
  const [senders, templates] = await Promise.all([
    desired.senders.length > 0 ? client.senders.list() : Promise.resolve([]),
    desired.templates.length > 0 ? client.templates.list() : Promise.resolve([]),
  ]);
  return diffMailerDefinition(desired, { senders, templates });
}

export async function applyMailerSync(
  client: SimpleMailer,
  plan: SyncPlan,
): Promise<void> {
  for (const operation of plan.operations) {
    if (operation.kind === "sender.upsert") {
      await client.senders.upsert(operation.desired);
    } else if (operation.kind === "template.activate") {
      await client.templates.activate(operation.name, operation.version);
    } else {
      const { activate, ...template } = operation.desired;
      const result = await client.templates.upsert(template);
      if (activate) await client.templates.activate(operation.name, result.version);
    }
  }
}
