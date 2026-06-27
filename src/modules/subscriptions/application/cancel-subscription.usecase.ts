import { AppError } from "../../../shared/errors/app-error";
import { SubscriptionRepository } from "../domain/subscription.repository";

/**
 * Cancels a subscription after verifying ownership (a user can only cancel
 * their own). Throws 404 if missing, 403 if it belongs to someone else. The
 * row and its usage-ledger history are kept — cancellation just flips status
 * and turns off auto-renew.
 */
export class CancelSubscriptionUseCase {
  constructor(
    private readonly subscriptionRepository: SubscriptionRepository
  ) {}

  async execute(params: { subscriptionId: string; currentUserId: string }) {
    const subscription = await this.subscriptionRepository.findById(
      params.subscriptionId
    );

    if (!subscription) {
      throw new AppError({
        code: "NOT_FOUND",
        message: "Subscription not found",
        statusCode: 404,
      });
    }

    if (subscription.userId !== params.currentUserId) {
      throw new AppError({
        code: "FORBIDDEN",
        message: "You cannot cancel another user's subscription",
        statusCode: 403,
      });
    }

    return this.subscriptionRepository.cancel(subscription.id);
  }
}
