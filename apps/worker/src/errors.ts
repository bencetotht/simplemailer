export class RetryableMailError extends Error {
  // Safe to retry (network issues, SMTP 4xx, temporary outages)
  constructor(message: string) {
    super(message);
    this.name = 'RetryableMailError';
  }
}

export class PermanentMailError extends Error {
  // Do not retry (invalid recipient/account/template/provider 5xx policy failures)
  constructor(message: string) {
    super(message);
    this.name = 'PermanentMailError';
  }
}

export class CircuitOpenError extends RetryableMailError {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

export class ValueError extends PermanentMailError {
  // Permanent failure in config/input/storage layers
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
