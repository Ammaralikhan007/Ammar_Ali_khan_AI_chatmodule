import { z } from "zod";

/**
 * Validation schema for creating a subscription. `.strict()` rejects any field
 * not listed here — this is the mass-assignment guard, so a client can't sneak
 * in `priceCents`, `status`, etc. Price/allotment are derived server-side from
 * the tier, never trusted from the client.
 */
export const createSubscriptionSchema = z
  .object({
    tier: z.enum(["basic", "pro", "enterprise"]),
    billingCycle: z.enum(["monthly", "yearly"]),
    autoRenew: z.boolean(),
  })
  .strict();
