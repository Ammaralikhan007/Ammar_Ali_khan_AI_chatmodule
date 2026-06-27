export type SubscriptionTier = "basic" | "pro" | "enterprise";
export type BillingCycle = "monthly" | "yearly";
export type SubscriptionStatus = "active" | "cancelled" | "inactive";

/**
 * Domain entity for a subscription bundle. Holds the authoritative
 * `remainingMessages` counter and exposes pure business rules: `isActive`,
 * `isEnterprise` (unlimited), and `hasRemainingQuota`. No framework concerns.
 */
export class Subscription {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly tier: SubscriptionTier,
    public readonly billingCycle: BillingCycle,
    public readonly maxMessages: number | null,
    public readonly remainingMessages: number | null,
    public readonly priceCents: number,
    public readonly startDate: Date,
    public readonly endDate: Date,
    public readonly renewalDate: Date,
    public readonly autoRenew: boolean,
    public readonly status: SubscriptionStatus,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}

  isActive(now = new Date()): boolean {
    return this.status === "active" && this.endDate > now;
  }

  isEnterprise(): boolean {
    return this.tier === "enterprise";
  }

  hasRemainingQuota(): boolean {
    if (this.isEnterprise()) return true;

    return this.remainingMessages !== null && this.remainingMessages > 0;
  }
}
