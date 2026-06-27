import { BillingCycle, SubscriptionTier } from "./subscription.entity";
import {
  getSubscriptionMaxMessages,
  getSubscriptionPriceCents,
} from "./subscription-tier.config";

/**
 * Pure billing rules shared by subscription creation and renewal. Keeping the
 * cycle math in one place means "what does a monthly/yearly period mean" and
 * "how much quota does a renewal grant" are defined once and can't drift apart.
 */

/** The end of a billing period that starts at `from`, given the cycle. */
export function computeCycleEndDate(from: Date, cycle: BillingCycle): Date {
  const end = new Date(from);

  if (cycle === "monthly") {
    end.setMonth(end.getMonth() + 1);
  } else {
    end.setFullYear(end.getFullYear() + 1);
  }

  return end;
}

/**
 * The message allotment granted for a tier at the start of each period.
 * `null` means unlimited (enterprise).
 */
export function getRenewalMessageAllotment(
  tier: SubscriptionTier
): number | null {
  return getSubscriptionMaxMessages(tier);
}

/** The price charged for a tier + cycle, in cents. */
export function getCyclePriceCents(
  tier: SubscriptionTier,
  cycle: BillingCycle
): number {
  return getSubscriptionPriceCents(tier, cycle);
}
