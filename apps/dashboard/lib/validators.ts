import { z } from "zod";

export const mailJobSchema = z.object({
  accountId: z.string().min(1),
  templateId: z.string().min(1),
  recipient: z.string().email(),
  values: z.record(z.unknown()),
});

export const accountSchema = z.object({
  name: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  emailHost: z.string().min(1),
  emailPort: z.number(),
});

export const bucketSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  region: z.string().min(1),
});

export const templateCreateSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  content: z.string(),
  storageType: z.enum(["LOCAL", "S3"]).default("LOCAL"),
});

export const templateUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  subject: z.string().min(1).optional(),
  content: z.string().optional(),
});
