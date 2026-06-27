import { NextFunction, Request, Response } from "express";
import { AppError } from "./app-error";

/**
 * The global error handler (registered last in main.ts). Renders every thrown
 * `AppError` as a typed JSON envelope `{ success:false, error:{ code, message,
 * requestId, details? } }` with its status code. Unknown errors become a
 * generic 500 — internal messages/stack traces are only included in
 * development, never leaked in production.
 *
 * `_next` is unused but the 4-argument signature is REQUIRED for Express to
 * recognize this as an error-handling middleware.
 */
export function errorHandlerMiddleware(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const isDevelopment = process.env.NODE_ENV === "development";

  if (error instanceof AppError) {
    console.error({
      requestId: req.requestId,
      code: error.code,
      message: error.message,
      details: error.details,
    });

    return res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        requestId: req.requestId,
        ...(error.details ? { details: error.details } : {}),
      },
    });
  }

  const errorMessage = error instanceof Error ? error.message : "Unknown error";
  const errorStack = error instanceof Error ? error.stack : undefined;

  console.error({
    requestId: req.requestId,
    message: errorMessage,
    stack: errorStack,
  });

  return res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: isDevelopment ? errorMessage : "Something went wrong",
      requestId: req.requestId,
      ...(isDevelopment && {
        stack: errorStack,
      }),
    },
  });
}
