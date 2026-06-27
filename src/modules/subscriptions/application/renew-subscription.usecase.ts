import { Subscription } from "../domain/subscription.entity";
import { SubscriptionRepository } from "../domain/subscription.repository";
import { PaymentGateway } from "../domain/payment-gateway";
import {
  computeCycleEndDate,
  getRenewalMessageAllotment,
} from "../domain/billing.policy";

/** Outcome of attempting to renew a single subscription. */
export interface RenewalOutcome {
  subscriptionId: string;
  result: "renewed" | "payment_failed";
  /** Present when renewed — the new period end. */
  newEndDate?: Date;
  /** Present when failed — why the charge was declined. */
  failureReason?: string;
}

/**
 * Renews ONE subscription, simulating the billing charge.
 *
 * Flow (mirrors SYSTEM_DESIGN §6.4):
 *   1. Charge the configured price via the payment gateway (mock).
 *   2. On success → extend the period from the current end date, top the
 *      message allotment back up to the tier's limit, keep it active.
 *   3. On failure → deactivate the subscription. The row and its usage-ledger
 *      history are preserved; it just stops being active (no auto-retry).
 *
 * It deals with a single subscription so it's trivially unit-testable; the job
 * layer handles iterating over all due subscriptions.
 */
export class RenewSubscriptionUseCase {
  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly paymentGateway: PaymentGateway
  ) {}

  async execute(subscription: Subscription): Promise<RenewalOutcome> {
    const charge = await this.paymentGateway.charge({
      amountCents: subscription.priceCents,
      subscriptionId: subscription.id,
      description: `Renewal of ${subscription.tier} (${subscription.billingCycle}) subscription`,
    });

    if (!charge.success) {
      await this.subscriptionRepository.deactivate(subscription.id);

      return {
        subscriptionId: subscription.id,
        result: "payment_failed",
        failureReason: charge.failureReason,
      };
    }

    // Extend from the existing end date so no time is lost between periods.
    const newEndDate = computeCycleEndDate(
      subscription.endDate,
      subscription.billingCycle
    );

    const renewed = await this.subscriptionRepository.renew({
      id: subscription.id,
      endDate: newEndDate,
      renewalDate: newEndDate,
      remainingMessages: getRenewalMessageAllotment(subscription.tier),
    });

    return {
      subscriptionId: renewed.id,
      result: "renewed",
      newEndDate: renewed.endDate,
    };
  }
}
