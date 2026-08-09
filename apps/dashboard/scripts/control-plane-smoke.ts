import { randomUUID } from "node:crypto";
import { prisma } from "database";
import {
  createProjectApiKey,
  listProjectApiKeys,
  revokeProjectApiKey,
} from "../lib/project-api-keys";
import {
  listProjectSenders,
  upsertProjectSender,
} from "../lib/project-senders";
import {
  activateProjectTemplateVersion,
  listProjectTemplates,
  upsertProjectTemplate,
} from "../lib/project-templates";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
const suffix = randomUUID().replaceAll("-", "");
const account = await prisma.account.create({
  data: {
    name: `Control plane smoke ${suffix}`,
    username: `smoke-${suffix}@example.com`,
    emailHost: "smtp.example.com",
    emailPort: 587,
  },
});
const project = await prisma.project.create({
  data: {
    slug: `control-plane-smoke-${suffix}`,
    name: "Control plane smoke",
  },
});
const actor = await prisma.apiKey.create({
  data: {
    projectId: project.id,
    name: "smoke actor",
    prefix: suffix.slice(0, 16),
    keyHash: "smoke-test-only",
    scopes: ["keys:read", "keys:write", "senders:read", "senders:write", "templates:read", "templates:write"],
  },
});

process.env.SIMPLEMAILER_SMOKE_ACCOUNT = account.username;
const sender = await upsertProjectSender({
  projectId: project.id,
  actorApiKeyId: actor.id,
  sender: {
    alias: "transactional",
    displayName: "SimpleMailer",
    fromAddress: account.username,
    credential: { env: "SIMPLEMAILER_SMOKE_ACCOUNT" },
  },
});
assert(sender.kind === "upserted", "sender upsert failed");
assert((await listProjectSenders(project.id)).length === 1, "sender list failed");

const templateInput = {
  name: "welcome",
  format: "HTML" as const,
  source: "<p>Hello {{name}}</p>",
  subject: "Welcome",
  variableSchema: { type: "object", required: ["name"] },
};
const firstVersion = await upsertProjectTemplate({
  projectId: project.id,
  actorApiKeyId: actor.id,
  template: templateInput,
});
const replayedVersion = await upsertProjectTemplate({
  projectId: project.id,
  actorApiKeyId: actor.id,
  template: templateInput,
});
assert(firstVersion.created, "template version was not created");
assert(!replayedVersion.created, "identical template created a duplicate version");
assert(firstVersion.version === replayedVersion.version, "template deduplication changed version");
assert(
  await activateProjectTemplateVersion({
    projectId: project.id,
    actorApiKeyId: actor.id,
    name: "welcome",
    version: firstVersion.version,
  }),
  "template activation failed",
);
const templates = await listProjectTemplates(project.id);
assert(templates[0]?.activeVersion === firstVersion.version, "active template was not listed");

const generated = await createProjectApiKey({
  projectId: project.id,
  actorApiKeyId: actor.id,
  name: "application",
  scopes: ["messages:send"],
});
assert(generated.secret.startsWith("sm_live_"), "API key secret was not generated");
assert((await listProjectApiKeys(project.id)).length === 2, "API key list failed");
assert(
  await revokeProjectApiKey({
    projectId: project.id,
    actorApiKeyId: actor.id,
    id: generated.key.id,
  }) === "revoked",
  "API key revocation failed",
);

process.stdout.write("Database-backed control-plane smoke test passed.\n");
await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
