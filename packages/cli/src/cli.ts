#!/usr/bin/env node
import {
  createEnvironmentClient,
  diffManifest,
  loadManifest,
  redactPlan,
  syncManifest,
} from "./index.js";

interface Arguments {
  command: string;
  config: string;
  json: boolean;
  ci: boolean;
}

function parseArguments(values: string[]): Arguments {
  const command = values[0] ?? "";
  let config = "simplemailer.yaml";
  let json = false;
  let ci = false;
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--config") {
      const next = values[index + 1];
      if (!next) throw new Error("--config requires a path");
      config = next;
      index += 1;
    } else if (value === "--json") {
      json = true;
    } else if (value === "--ci") {
      ci = true;
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  return { command, config, json, ci };
}

function usage(): string {
  return [
    "Usage: simplemailer <validate|diff|sync> [--config path] [--json] [--ci]",
    "",
    "diff is read-only. sync applies only additive/upsert operations.",
    "SIMPLEMAILER_URL and SIMPLEMAILER_API_KEY are required for diff and sync.",
  ].join("\n");
}

export async function run(values: string[]): Promise<number> {
  try {
    const arguments_ = parseArguments(values);
    if (!["validate", "diff", "sync"].includes(arguments_.command)) {
      process.stderr.write(`${usage()}\n`);
      return 2;
    }
    const manifest = await loadManifest(arguments_.config);
    if (arguments_.command === "validate") {
      const output = {
        valid: true,
        config: manifest.path,
        senders: manifest.resolved.senders.length,
        templates: manifest.resolved.templates.length,
      };
      process.stdout.write(`${JSON.stringify(output, null, arguments_.json ? 0 : 2)}\n`);
      return 0;
    }

    const client = createEnvironmentClient();
    const plan =
      arguments_.command === "diff"
        ? await diffManifest(manifest, client)
        : await syncManifest(manifest, client);
    process.stdout.write(`${JSON.stringify(redactPlan(plan), null, arguments_.json ? 0 : 2)}\n`);
    if (arguments_.command === "diff" && arguments_.ci && plan.operations.length > 0) {
      return 2;
    }
    return 0;
  } catch (error) {
    const output =
      error instanceof Error
        ? { success: false, name: error.name, message: error.message }
        : { success: false, message: String(error) };
    process.stderr.write(`${JSON.stringify(output)}\n`);
    return 1;
  }
}

process.exitCode = await run(process.argv.slice(2));
