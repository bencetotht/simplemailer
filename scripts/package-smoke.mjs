import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const temporaryRoot = await mkdtemp(join(tmpdir(), "simplemailer-package-smoke-"));
const tarballRoot = join(temporaryRoot, "tarballs");
const consumerRoot = join(temporaryRoot, "consumer");

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
    env: process.env,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

try {
  await mkdir(tarballRoot, { recursive: true });
  await mkdir(consumerRoot, { recursive: true });

  const packageName = "@bencetotht/simplemailer";
  const output = run(
    "pnpm",
    ["--filter", packageName, "pack", "--pack-destination", tarballRoot],
  );
  const filename = output.split("\n").at(-1);
  if (!filename) throw new Error(`No tarball was produced for ${packageName}`);
  const tarball = resolve(filename);

  await writeFile(
    join(consumerRoot, "package.json"),
    `${JSON.stringify({
      name: "simplemailer-package-smoke",
      private: true,
      type: "module",
      dependencies: { [packageName]: `file:${tarball}` },
      pnpm: {
        overrides: { [packageName]: `file:${tarball}` },
      },
    }, null, 2)}\n`,
  );
  run("pnpm", ["install", "--ignore-workspace"], consumerRoot);

  await writeFile(
    join(consumerRoot, "smoke.mjs"),
    [
      'import { SimpleMailer, defineMailer } from "@bencetotht/simplemailer";',
      'import { API_VERSION } from "@bencetotht/simplemailer/contracts";',
      'if (API_VERSION !== "v1") throw new Error("SDK contracts export failed");',
      'const client = new SimpleMailer({',
      '  transport: { request: async () => ({ data: [] }) },',
      '});',
      'if (!client.messages || !client.webhooks) throw new Error("SDK import failed");',
      'defineMailer({ apiVersion: "simplemailer/v1", senders: [], templates: [] });',
      'process.stdout.write("package smoke test passed\\n");',
      "",
    ].join("\n"),
  );
  run("node", ["smoke.mjs"], consumerRoot);

  const manifest = JSON.parse(
    run("tar", ["-xOf", tarball, "package/package.json"]),
  );
  for (const dependency of Object.values(manifest.dependencies ?? {})) {
    if (String(dependency).startsWith("workspace:")) {
      throw new Error(`${manifest.name} tarball contains an unresolved workspace dependency`);
    }
  }

  process.stdout.write("External package installation and imports passed.\n");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
