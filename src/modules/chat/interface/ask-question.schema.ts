import { z } from "zod";
import { sanitizeText } from "../../../shared/security/sanitize";

/**
 * Validation + sanitization schema for the "ask a question" request body.
 *
 * `.strict()` rejects any unknown fields (mass-assignment protection). The
 * `.transform()` runs our sanitizer AFTER length validation so the stored
 * question is free of control characters and HTML — important because the mock
 * AI echoes the question back into the stored answer, which could otherwise
 * persist a stored-XSS payload.
 */
export const askQuestionSchema = z
  .object({
    question: z
      .string()
      .min(1)
      .max(2000)
      .transform((value) => sanitizeText(value, { maxLength: 2000 })),
  })
  .strict();
