#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

const components = {
  dashboard: {
    versionFile: "apps/dashboard/package.json",
    paths: ["apps/dashboard/"],
  },
  worker: {
    versionFile: "apps/worker/package.json",
    paths: ["apps/worker/"],
  },
  helm: {
    versionFile: "charts/simplemailer/Chart.yaml",
    paths: ["charts/simplemailer/"],
  },
};

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (value && !value.startsWith("--")) {
    args.set(key, value);
    index += 1;
  } else {
    args.set(key, true);
  }
}

const run = (...command) =>
  execFileSync(command[0], command.slice(1), { encoding: "utf8" }).trim();

function resolveBase(candidate, head) {
  if (candidate && !/^0+$/.test(candidate)) {
    try {
      run("git", "cat-file", "-e", `${candidate}^{commit}`);
      return candidate;
    } catch {
      // Fall through to the first-parent fallback for shallow/bootstrap runs.
    }
  }
  try {
    return run("git", "rev-parse", `${head}^`);
  } catch {
    return run("git", "hash-object", "-t", "tree", "/dev/null");
  }
}

function semverBump(version, level) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Expected a stable semver, received ${version}`);
  let [, major, minor, patch] = match.map(Number);
  if (level === "major") [major, minor, patch] = [major + 1, 0, 0];
  else if (level === "minor") [minor, patch] = [minor + 1, 0];
  else patch += 1;
  return `${major}.${minor}.${patch}`;
}

function bumpLevel(messages) {
  if (/BREAKING[ -]CHANGE|^[a-z]+(?:\([^)]*\))?!:/im.test(messages)) return "major";
  if (/^feat(?:\([^)]*\))?:/im.test(messages)) return "minor";
  return "patch";
}

function readVersion(name) {
  const contents = readFileSync(components[name].versionFile, "utf8");
  if (components[name].versionFile.endsWith(".json")) return JSON.parse(contents).version;
  const match = contents.match(/^version:\s*["']?([^"'\s]+)["']?$/m);
  if (!match) throw new Error(`No version found in ${components[name].versionFile}`);
  return match[1];
}

function writeVersion(name, version) {
  const file = components[name].versionFile;
  const contents = readFileSync(file, "utf8");
  if (file.endsWith(".json")) {
    const parsed = JSON.parse(contents);
    parsed.version = version;
    writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`);
    return;
  }
  writeFileSync(file, contents.replace(/^version:\s*.*$/m, `version: ${version}`));
}

const head = args.get("--head") ?? "HEAD";
const base = resolveBase(args.get("--base"), head);
const changedFiles = run("git", "diff", "--name-only", `${base}..${head}`)
  .split("\n")
  .filter(Boolean);

const affected = new Set();
for (const [name, component] of Object.entries(components)) {
  if (changedFiles.some((file) => component.paths.some((prefix) => file.startsWith(prefix)))) {
    affected.add(name);
  }
}

// Shared runtime dependencies rebuild their consumers. The chart is then updated
// to point at the new immutable image tag. A chart-only change never touches apps.
if (changedFiles.some((file) => file.startsWith("packages/database/"))) {
  affected.add("dashboard");
  affected.add("worker");
}
if (changedFiles.some((file) => file.startsWith("packages/sdk/"))) affected.add("dashboard");
if (changedFiles.includes("config.yaml")) affected.add("worker");
if (
  changedFiles.some((file) =>
    ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".node-version", ".dockerignore"].includes(file),
  )
) {
  affected.add("dashboard");
  affected.add("worker");
}
if (affected.has("dashboard") || affected.has("worker")) affected.add("helm");

const messages = run("git", "log", "--format=%B", `${base}..${head}`);
const level = bumpLevel(messages);
const versions = {};
for (const name of Object.keys(components)) {
  const current = readVersion(name);
  versions[name] = affected.has(name) ? semverBump(current, level) : current;
  if (affected.has(name) && args.has("--write")) writeVersion(name, versions[name]);
}

if (args.has("--write") && affected.has("dashboard")) {
  const chartFile = "charts/simplemailer/Chart.yaml";
  const chart = readFileSync(chartFile, "utf8").replace(
    /^appVersion:\s*.*$/m,
    `appVersion: "${versions.dashboard}"`,
  );
  writeFileSync(chartFile, chart);
  const valuesFile = "charts/simplemailer/values.yaml";
  const values = readFileSync(valuesFile, "utf8").replace(
    /(dashboard:\n(?:.|\n)*?\n\s+tag:)\s*"[^"]*"/,
    `$1 "${versions.dashboard}"`,
  );
  writeFileSync(valuesFile, values);
}
if (args.has("--write") && affected.has("worker")) {
  const valuesFile = "charts/simplemailer/values.yaml";
  const values = readFileSync(valuesFile, "utf8").replace(
    /(worker:\n(?:.|\n)*?\n\s+tag:)\s*"[^"]*"/,
    `$1 "${versions.worker}"`,
  );
  writeFileSync(valuesFile, values);
}

const result = {
  base,
  head,
  level,
  changedFiles,
  affected: [...affected],
  versions,
};
const output = args.get("--github-output");
if (output) {
  appendFileSync(output, `dashboard=${affected.has("dashboard")}\n`);
  appendFileSync(output, `worker=${affected.has("worker")}\n`);
  appendFileSync(output, `helm=${affected.has("helm")}\n`);
  for (const [name, version] of Object.entries(versions)) appendFileSync(output, `${name}_version=${version}\n`);
  appendFileSync(output, `affected=${JSON.stringify([...affected])}\n`);
}
console.log(JSON.stringify(result, null, 2));
