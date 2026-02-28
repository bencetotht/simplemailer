export class MailerError extends Error {
  // thrown when the mailer is not able to send the mail due to an error, but the error may resolve by retrying
  constructor(message: string) {
    super(message);
  }
}

export class MailerMaxRetriesError extends Error {
  // the mailer max reached it max retry limit
  constructor(message: string) {
    super(message);
  }
}
