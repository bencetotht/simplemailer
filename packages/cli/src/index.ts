import { readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { mailerManifestSchema, type MailerManifest } from "@simplemailer/contracts";
import {
  SimpleMailer,
  SimpleMailerError,
  applyMailerSync,
  planMailerSync,
  resolveMailerDefinition,
  type ResolvedMailerDefinition,
  type SyncPlan,
} from "@simplemailer/sdk";
import { parse as parseYaml } from "yaml";

export interface LoadedManifest {
  path: string;
  manifest: MailerManifest;
  resolved: ResolvedMailerDefinition;
}

export async function loadManifest(path: string): Promise<LoadedManifest> {
  const absolutePath = resolve(path);
  const raw = await readFile(absolutePath, "utf8");
  const extension = extname(absolutePath).toLowerCase();
  const value =
    extension === ".yaml" || extension === ".yml"
      ? parseYaml(raw)
      : JSON.parse(raw) as unknown;
  const manifest = mailerManifestSchema.parse(value);
  const root = dirname(absolutePath);
  const resolved = await resolveMailerDefinition(
    manifest,
    (sourcePath) => readFile(resolve(root, sourcePath), "utf8"),
  );
  return { path: absolutePath, manifest, resolved };
}

export function createEnvironmentClient(
  environment: NodeJS.ProcessEnv = process.env,
): SimpleMailer {
  const baseUrl = environment.SIMPLEMAILER_URL;
  const apiKey = environment.SIMPLEMAILER_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new SimpleMailerError(
      "SIMPLEMAILER_URL and SIMPLEMAILER_API_KEY are required for diff and sync",
      { code: "INVALID_CONFIGURATION" },
    );
  }
  return new SimpleMailer({ baseUrl, apiKey });
}

export async function diffManifest(
  manifest: LoadedManifest,
  client: SimpleMailer,
): Promise<SyncPlan> {
  return planMailerSync(client, manifest.resolved);
}

export async function syncManifest(
  manifest: LoadedManifest,
  client: SimpleMailer,
): Promise<SyncPlan> {
  const plan = await diffManifest(manifest, client);
  await applyMailerSync(client, plan);
  return plan;
}

export function redactPlan(plan: SyncPlan): unknown {
  return {
    ...plan,
    operations: plan.operations.map((operation) => {
      if (operation.kind !== "sender.upsert" || !operation.desired.credential) {
        return operation;
      }
      return {
        ...operation,
        desired: {
          ...operation.desired,
          credential: { env: operation.desired.credential.env, value: "[REDACTED]" },
        },
      };
    }),
  };
}
