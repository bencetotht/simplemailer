import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const packageDirectories = ["packages/sdk", "packages/cli"];

for (const directory of packageDirectories) {
  const manifest = JSON.parse(
    await readFile(resolve(directory, "package.json"), "utf8"),
  );
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(manifest.name)}/${encodeURIComponent(manifest.version)}`,
  );
  if (response.ok) {
    throw new Error(`${manifest.name}@${manifest.version} is already published`);
  }
  if (response.status !== 404) {
    throw new Error(
      `Could not verify ${manifest.name}@${manifest.version}: npm returned ${response.status}`,
    );
  }
  process.stdout.write(`${manifest.name}@${manifest.version} is available\n`);
}
