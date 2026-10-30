export class VerificationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly retryAt = 0,
  ) {
    super(message);
  }
}
