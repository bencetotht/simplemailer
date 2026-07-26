import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openApiDocument } from "../lib/legacy-contract";

const output = resolve(process.cwd(), "openapi.json");

async function main(): Promise<void> {
  await writeFile(output, `${JSON.stringify(openApiDocument, null, 2)}\n`, "utf8");
}

void main();
