import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const script = resolve("scripts/bump-versions.mjs");
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "simplemailer-release-"));
  for (const path of ["apps/dashboard", "apps/worker", "charts/simplemailer", "packages/database"]) mkdirSync(join(cwd, path), { recursive: true });
  writeFileSync(join(cwd, "apps/dashboard/package.json"), '{"version":"1.2.3"}\n');
  writeFileSync(join(cwd, "apps/worker/package.json"), '{"version":"2.3.4"}\n');
  writeFileSync(join(cwd, "charts/simplemailer/Chart.yaml"), "version: 0.4.0\n");
  writeFileSync(join(cwd, "charts/simplemailer/values.yaml"), 'dashboard:\n  image:\n    tag: "1.2.3"\nworker:\n  image:\n    tag: "2.3.4"\n');
  git(cwd, "init", "-q");
  git(cwd, "config", "user.email", "test@example.com");
  git(cwd, "config", "user.name", "Test");
  git(cwd, "add", ".");
  git(cwd, "commit", "-qm", "initial");
  return cwd;
}

test("a chart-only change does not release either runtime", () => {
  const cwd = fixture();
  const base = git(cwd, "rev-parse", "HEAD");
  writeFileSync(join(cwd, "charts/simplemailer/README.md"), "changed\n");
  git(cwd, "add", ".");
  git(cwd, "commit", "-qm", "fix: chart docs");
  const result = JSON.parse(execFileSync("node", [script, "--base", base, "--head", "HEAD", "--write"], { cwd, encoding: "utf8" }));
  assert.deepEqual(result.affected, ["helm"]);
  assert.equal(result.versions.helm, "0.4.1");
});

test("a database feature releases both consumers and the chart", () => {
  const cwd = fixture();
  const base = git(cwd, "rev-parse", "HEAD");
  writeFileSync(join(cwd, "packages/database/index.ts"), "export {};\n");
  git(cwd, "add", ".");
  git(cwd, "commit", "-qm", "feat: extend schema");
  const result = JSON.parse(execFileSync("node", [script, "--base", base, "--head", "HEAD", "--write"], { cwd, encoding: "utf8" }));
  assert.deepEqual(result.affected, ["dashboard", "worker", "helm"]);
  assert.equal(result.versions.dashboard, "1.3.0");
  assert.equal(result.versions.worker, "2.4.0");
  assert.match(readFileSync(join(cwd, "charts/simplemailer/values.yaml"), "utf8"), /tag: "1\.3\.0"[\s\S]*tag: "2\.4\.0"/);
});
