import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

function parseEnvValue(contents: string, key: string): string | null {
  const line = contents
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${key}=`));
  if (!line) return null;
  const [, ...rest] = line.split('=');
  if (rest.length === 0) return null;
  return rest.join('=').trim().replace(/^['"]|['"]$/g, '');
}

function tryReadFromFile(filePath: string, key: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const contents = fs.readFileSync(filePath, 'utf8');
  return parseEnvValue(contents, key);
}

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const configDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(configDir, '.env'),
    path.resolve(configDir, '../.env'),
    path.resolve(configDir, '../../.env'),
    path.resolve(configDir, '../../../.env'),
  ];

  for (const candidate of candidates) {
    const value = tryReadFromFile(candidate, 'DATABASE_URL');
    if (value) return value;
  }

  throw new Error(
    'DATABASE_URL is not set. Set it in the environment or in a reachable .env file.',
  );
}

export default defineConfig({
  datasource: {
    url: resolveDatabaseUrl(),
  },
});
