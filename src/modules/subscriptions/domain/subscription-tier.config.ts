import { BillingCycle, SubscriptionTier } from "./subscription.entity";

/**
 * The product catalog: message allotment and pricing per tier/cycle. Single
 * source of truth used by both subscription creation and renewal. `basic`=10,
 * `pro`=100, `enterprise`=unlimited (null).
 */

type TierConfig = {
  maxMessages: number | null;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
};

export const SUBSCRIPTION_TIER_CONFIG: Record<SubscriptionTier, TierConfig> = {
  basic: {
    maxMessages: 10,
    monthlyPriceCents: 500,
    yearlyPriceCents: 5000,
  },

  pro: {
    maxMessages: 100,
    monthlyPriceCents: 2000,
    yearlyPriceCents: 20000,
  },

  enterprise: {
    maxMessages: null,
    monthlyPriceCents: 10000,
    yearlyPriceCents: 100000,
  },
};

export function getSubscriptionPriceCents(
  tier: SubscriptionTier,
  billingCycle: BillingCycle
): number {
  const config = SUBSCRIPTION_TIER_CONFIG[tier];

  if (billingCycle === "monthly") {
    return config.monthlyPriceCents;
  }

  return config.yearlyPriceCents;
}

export function getSubscriptionMaxMessages(
  tier: SubscriptionTier
): number | null {
  return SUBSCRIPTION_TIER_CONFIG[tier].maxMessages;
}
