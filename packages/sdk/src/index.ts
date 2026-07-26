export {
  MessagesClient,
  SendersClient,
  SimpleMailer,
  TemplatesClient,
  type SimpleMailerOptions,
  type SimpleMailerTransportOptions,
} from "./client.js";
export { SimpleMailerError, type SimpleMailerErrorOptions } from "./errors.js";
export {
  FetchTransport,
  type FetchTransportOptions,
  type HttpTransport,
  type RequestOptions,
  type RetryOptions,
  type TransportRequest,
} from "./transport.js";
export {
  applyMailerSync,
  defineMailer,
  diffMailerDefinition,
  planMailerSync,
  resolveMailerDefinition,
  templateDigest,
  type ReadTemplateSource,
  type ResolvedMailerDefinition,
  type ResolvedTemplate,
  type SyncOperation,
  type SyncPlan,
} from "./sync.js";
export { SDK_VERSION } from "./version.js";
export type {
  ApiErrorResponse,
  CreateInlineMessage,
  MailerManifest,
  MessageStatus,
  MessageSummary,
  Sender,
  Template,
  UpsertSender,
  UpsertTemplate,
} from "@simplemailer/contracts";
