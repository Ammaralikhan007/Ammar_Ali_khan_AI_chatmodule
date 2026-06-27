import { BillingCycle, SubscriptionTier } from "../domain/subscription.entity";
import { SubscriptionRepository } from "../domain/subscription.repository";
import {
  computeCycleEndDate,
  getCyclePriceCents,
  getRenewalMessageAllotment,
} from "../domain/billing.policy";

/**
 * Creates a new subscription for a user.
 *
 * Derives the period end, price, and message allotment from the shared billing
 * policy (the same rules renewal uses), then persists an active subscription
 * whose `remainingMessages` starts at the full tier allotment.
 */
export class CreateSubscriptionUseCase {
  constructor(
    private readonly subscriptionRepository: SubscriptionRepository
  ) {}

  async execute(params: {
    userId: string;
    tier: SubscriptionTier;
    billingCycle: BillingCycle;
    autoRenew: boolean;
  }) {
    const now = new Date();
    const endDate = computeCycleEndDate(now, params.billingCycle);

    const maxMessages = getRenewalMessageAllotment(params.tier);
    const priceCents = getCyclePriceCents(params.tier, params.billingCycle);

    const subscription = await this.subscriptionRepository.create({
      userId: params.userId,
      tier: params.tier,
      billingCycle: params.billingCycle,
      maxMessages,
      remainingMessages: maxMessages,
      priceCents,
      startDate: now,
      endDate,
      renewalDate: endDate,
      autoRenew: params.autoRenew,
      status: "active",
    });

    return subscription;
  }
}
