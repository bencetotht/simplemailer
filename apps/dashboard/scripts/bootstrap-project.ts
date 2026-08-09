import { prisma } from "database";
import { apiKeyScopeSchema } from "@simplemailer/contracts";
import { generateApiKey } from "../lib/api-keys";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const slug = required("SIMPLEMAILER_PROJECT_SLUG");
const name = process.env.SIMPLEMAILER_PROJECT_NAME?.trim() || slug;
const keyName = process.env.SIMPLEMAILER_API_KEY_NAME?.trim() || "bootstrap";
const scopes = (process.env.SIMPLEMAILER_API_KEY_SCOPES || "messages:send,messages:read")
  .split(",")
  .map((scope) => scope.trim())
  .filter(Boolean)
  .map((scope) => apiKeyScopeSchema.parse(scope));

const project = await prisma.project.upsert({
  where: { slug },
  create: { slug, name },
  update: { name },
});
const senderAlias = process.env.SIMPLEMAILER_SENDER_ALIAS?.trim();
if (senderAlias) {
  const accountId = required("SIMPLEMAILER_ACCOUNT_ID");
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  await prisma.sender.upsert({
    where: { projectId_alias: { projectId: project.id, alias: senderAlias } },
    create: {
      projectId: project.id,
      alias: senderAlias,
      displayName: process.env.SIMPLEMAILER_SENDER_NAME?.trim() || name,
      fromAddress: process.env.SIMPLEMAILER_FROM_ADDRESS?.trim() || account.username,
      replyTo: process.env.SIMPLEMAILER_REPLY_TO?.trim() || null,
      accountId,
      verifiedAt: new Date(),
    },
    update: {},
  });
}
const generated = await generateApiKey();
await prisma.apiKey.create({
  data: {
    projectId: project.id,
    name: keyName,
    prefix: generated.prefix,
    keyHash: generated.keyHash,
    scopes,
  },
});

console.log(`Project: ${project.slug} (${project.id})`);
console.log(`API key (shown once): ${generated.secret}`);
console.log(`Scopes: ${scopes.join(", ")}`);
if (senderAlias) console.log(`Sender alias: ${senderAlias}`);
await prisma.$disconnect();
