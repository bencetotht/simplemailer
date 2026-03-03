/*
  Warnings:

  - Added the required column `bucketId` to the `Template` table without a default value. This is not possible if the table is not empty.
  - Added the required column `filename` to the `Template` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Account" ALTER COLUMN "emailPort" SET DEFAULT 587;

-- AlterTable
ALTER TABLE "public"."Template" ADD COLUMN     "bucketId" TEXT NOT NULL,
ADD COLUMN     "filename" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "public"."Bucket" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "accessKeyId" TEXT NOT NULL,
    "secretAccessKey" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bucket_name_key" ON "public"."Bucket"("name");

-- AddForeignKey
ALTER TABLE "public"."Template" ADD CONSTRAINT "Template_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "public"."Bucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
