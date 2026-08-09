import { createHash, randomUUID } from "node:crypto";
import type { UpsertTemplate } from "@bencetotht/simplemailer/contracts";
import { ArtifactFormat, Prisma } from "database";
import { prisma } from "@/lib/db";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

export function managedTemplateDigest(template: UpsertTemplate): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(template)), "utf8")
    .digest("hex");
}

function sourceDigest(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

function formatValue(format: UpsertTemplate["format"]): ArtifactFormat {
  return format === "MJML" ? ArtifactFormat.MJML : ArtifactFormat.HTML;
}

function summarize(template: {
  name: string;
  updatedAt: Date;
  activeVersion: { id: string } | null;
  versions: Array<{
    id: string;
    digest: string;
    format: ArtifactFormat;
    subject: string | null;
    createdAt: Date;
  }>;
}) {
  return {
    name: template.name,
    activeVersion: template.activeVersion?.id ?? null,
    versions: template.versions.map((version) => ({
      version: version.id,
      digest: version.digest,
      format: version.format === ArtifactFormat.MJML ? "MJML" as const : "HTML" as const,
      subject: version.subject,
      createdAt: version.createdAt,
    })),
    updatedAt: template.updatedAt,
  };
}

const templateInclude = {
  activeVersion: { select: { id: true } },
  versions: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      digest: true,
      format: true,
      subject: true,
      createdAt: true,
    },
  },
} as const;

async function audit(
  tx: Prisma.TransactionClient,
  input: {
    projectId: string;
    actorApiKeyId: string;
    action: string;
    targetId: string;
    metadata?: Prisma.InputJsonObject;
  },
) {
  await tx.auditEvent.create({
    data: {
      id: `aud_${randomUUID().replaceAll("-", "")}`,
      projectId: input.projectId,
      actorApiKeyId: input.actorApiKeyId,
      action: input.action,
      targetType: "managed_template",
      targetId: input.targetId,
      metadata: input.metadata ?? {},
    },
  });
}

export async function listProjectTemplates(projectId: string) {
  const templates = await prisma.managedTemplate.findMany({
    where: { projectId },
    orderBy: { name: "asc" },
    include: templateInclude,
  });
  return templates.map(summarize);
}

export async function upsertProjectTemplate(input: {
  projectId: string;
  actorApiKeyId: string;
  template: UpsertTemplate;
}) {
  const digest = managedTemplateDigest(input.template);
  const artifactDigest = sourceDigest(input.template.source);
  const format = formatValue(input.template.format);

  return prisma.$transaction(async (tx) => {
    const alias = await tx.managedTemplate.upsert({
      where: {
        projectId_name: {
          projectId: input.projectId,
          name: input.template.name,
        },
      },
      create: {
        id: `tpla_${randomUUID().replaceAll("-", "")}`,
        projectId: input.projectId,
        name: input.template.name,
      },
      update: {},
    });
    const existing = await tx.managedTemplateVersion.findUnique({
      where: { templateId_digest: { templateId: alias.id, digest } },
    });
    if (existing) {
      return {
        name: alias.name,
        version: existing.id,
        digest,
        created: false,
      };
    }

    const artifact = await tx.contentArtifact.upsert({
      where: {
        projectId_digest_format: {
          projectId: input.projectId,
          digest: artifactDigest,
          format,
        },
      },
      create: {
        projectId: input.projectId,
        digest: artifactDigest,
        format,
        byteLength: Buffer.byteLength(input.template.source),
        content: input.template.source,
      },
      update: {},
    });
    const version = await tx.managedTemplateVersion.create({
      data: {
        id: `tplv_${randomUUID().replaceAll("-", "")}`,
        projectId: input.projectId,
        templateId: alias.id,
        digest,
        format,
        sourceArtifactId: artifact.id,
        subject: input.template.subject ?? null,
        variableSchema: input.template.variableSchema as Prisma.InputJsonValue | undefined,
      },
    });
    await audit(tx, {
      projectId: input.projectId,
      actorApiKeyId: input.actorApiKeyId,
      action: "managed_template.version_created",
      targetId: alias.id,
      metadata: { name: alias.name, version: version.id, digest },
    });
    return {
      name: alias.name,
      version: version.id,
      digest,
      created: true,
    };
  });
}

export async function activateProjectTemplateVersion(input: {
  projectId: string;
  actorApiKeyId: string;
  name: string;
  version: string;
}) {
  return prisma.$transaction(async (tx) => {
    const alias = await tx.managedTemplate.findUnique({
      where: {
        projectId_name: {
          projectId: input.projectId,
          name: input.name,
        },
      },
    });
    if (!alias) return false;
    const version = await tx.managedTemplateVersion.findFirst({
      where: {
        id: input.version,
        templateId: alias.id,
        projectId: input.projectId,
      },
      select: { id: true },
    });
    if (!version) return false;
    await tx.managedTemplate.update({
      where: { id: alias.id },
      data: { activeVersionId: version.id },
    });
    await audit(tx, {
      projectId: input.projectId,
      actorApiKeyId: input.actorApiKeyId,
      action: "managed_template.version_activated",
      targetId: alias.id,
      metadata: { name: alias.name, version: version.id },
    });
    return true;
  });
}
