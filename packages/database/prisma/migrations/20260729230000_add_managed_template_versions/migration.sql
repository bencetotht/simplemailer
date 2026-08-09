CREATE TABLE "public"."ManagedTemplate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "activeVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManagedTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."ManagedTemplateVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "format" "public"."ArtifactFormat" NOT NULL,
    "sourceArtifactId" TEXT NOT NULL,
    "subject" TEXT,
    "variableSchema" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManagedTemplateVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManagedTemplate_activeVersionId_key"
ON "public"."ManagedTemplate"("activeVersionId");
CREATE UNIQUE INDEX "ManagedTemplate_projectId_name_key"
ON "public"."ManagedTemplate"("projectId", "name");
CREATE INDEX "ManagedTemplate_projectId_updatedAt_idx"
ON "public"."ManagedTemplate"("projectId", "updatedAt");
CREATE UNIQUE INDEX "ManagedTemplateVersion_templateId_digest_key"
ON "public"."ManagedTemplateVersion"("templateId", "digest");
CREATE INDEX "ManagedTemplateVersion_projectId_createdAt_idx"
ON "public"."ManagedTemplateVersion"("projectId", "createdAt");
CREATE INDEX "ManagedTemplateVersion_sourceArtifactId_idx"
ON "public"."ManagedTemplateVersion"("sourceArtifactId");

ALTER TABLE "public"."ManagedTemplate"
ADD CONSTRAINT "ManagedTemplate_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."ManagedTemplateVersion"
ADD CONSTRAINT "ManagedTemplateVersion_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."ManagedTemplateVersion"
ADD CONSTRAINT "ManagedTemplateVersion_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "public"."ManagedTemplate"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."ManagedTemplateVersion"
ADD CONSTRAINT "ManagedTemplateVersion_sourceArtifactId_fkey"
FOREIGN KEY ("sourceArtifactId") REFERENCES "public"."ContentArtifact"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."ManagedTemplate"
ADD CONSTRAINT "ManagedTemplate_activeVersionId_fkey"
FOREIGN KEY ("activeVersionId") REFERENCES "public"."ManagedTemplateVersion"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
