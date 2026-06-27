import { NextFunction, Request, Response } from "express";
import { ZodSchema } from "zod";
import { AppError } from "../errors/app-error";

/**
 * Returns a middleware that validates `req.body` against a Zod schema. On
 * failure it throws a typed `VALIDATION_ERROR` (400) with the field errors; on
 * success it replaces `req.body` with the parsed (and sanitized) data. Paired
 * with `.strict()` schemas this also blocks mass-assignment of unknown fields.
 */
export function validateBody(schema: ZodSchema) {
  return function validationMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      throw new AppError({
        code: "VALIDATION_ERROR",
        message: "Invalid request body",
        statusCode: 400,
        details: result.error.flatten(),
      });
    }

    req.body = result.data;

    return next();
  };
}
