-- CreateEnum
CREATE TYPE "public"."STORAGE_TYPE" AS ENUM ('S3', 'LOCAL');

-- DropForeignKey
ALTER TABLE "public"."Template" DROP CONSTRAINT "Template_bucketId_fkey";

-- AlterTable
ALTER TABLE "public"."Template" ADD COLUMN     "storageType" "public"."STORAGE_TYPE" NOT NULL DEFAULT 'LOCAL',
ALTER COLUMN "bucketId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."Template" ADD CONSTRAINT "Template_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "public"."Bucket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
