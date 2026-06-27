import { TypeOrmSubscriptionRepository } from "../modules/subscriptions/infrastructure/typeorm-subscription.repository";
import { MockPaymentGateway } from "../modules/subscriptions/infrastructure/mock-payment.gateway";
import {
  RenewSubscriptionUseCase,
  RenewalOutcome,
} from "../modules/subscriptions/application/renew-subscription.usecase";

/** Aggregate result of one renewal run. */
export interface RenewalJobSummary {
  due: number;
  renewed: number;
  failed: number;
  outcomes: RenewalOutcome[];
}

/**
 * The billing renewal job.
 *
 * Finds every subscription due for auto-renewal and processes each one through
 * the RenewSubscriptionUseCase (charge → renew or deactivate). Subscriptions
 * are processed sequentially to keep the (mock) payment load predictable and
 * the summary deterministic.
 *
 * This function assumes the DataSource is already initialized — its callers
 * (the runner script, the scheduler, the admin endpoint) own that lifecycle.
 */
export async function runRenewalJob(
  now = new Date()
): Promise<RenewalJobSummary> {
  const subscriptionRepository = new TypeOrmSubscriptionRepository();
  const paymentGateway = new MockPaymentGateway();
  const renewSubscription = new RenewSubscriptionUseCase(
    subscriptionRepository,
    paymentGateway
  );

  const dueSubscriptions = await subscriptionRepository.findDueForRenewal(now);

  const outcomes: RenewalOutcome[] = [];
  for (const subscription of dueSubscriptions) {
    outcomes.push(await renewSubscription.execute(subscription));
  }

  return {
    due: dueSubscriptions.length,
    renewed: outcomes.filter((o) => o.result === "renewed").length,
    failed: outcomes.filter((o) => o.result === "payment_failed").length,
    outcomes,
  };
}
