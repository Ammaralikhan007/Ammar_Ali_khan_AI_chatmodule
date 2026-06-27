/**
 * The closed set of machine-readable error codes the API can return. Each maps
 * to a stable HTTP status (set per-throw via `statusCode`) and lets clients
 * branch on `error.code` without parsing human-readable messages.
 */
export type AppErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "QUOTA_EXCEEDED"
  | "RATE_LIMITED"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "REQUEST_TIMEOUT"
  | "INTERNAL_SERVER_ERROR";

/**
 * The single application-level error type. Throwing an `AppError` anywhere in
 * the request lifecycle is caught by the global `errorHandlerMiddleware`, which
 * renders it as a typed JSON envelope `{ code, message, requestId, details? }`
 * with the given `statusCode`. Anything that is NOT an `AppError` is treated as
 * an unexpected fault and rendered as a generic 500 (no internals leaked).
 */
export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(params: {
    code: AppErrorCode;
    message: string;
    statusCode: number;
    details?: unknown;
  }) {
    super(params.message);

    this.code = params.code;
    this.statusCode = params.statusCode;
    this.details = params.details;

    Object.setPrototypeOf(this, AppError.prototype);
  }
}
