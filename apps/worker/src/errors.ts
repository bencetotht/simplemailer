export class MailerError extends Error {
  // Thrown when sending fails transiently — safe to retry
  constructor(message: string) {
    super(message);
    this.name = 'MailerError';
  }
}

export class MailerMaxRetriesError extends Error {
  // Thrown when all retry attempts are exhausted
  constructor(message: string) {
    super(message);
    this.name = 'MailerMaxRetriesError';
  }
}

export class ValueError extends Error {
  // Thrown for permanent failures (bad input, missing record) — do not retry
  constructor(message: string) {
    super(message);
    this.name = 'ValueError';
  }
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}
