import { EntityManager } from "typeorm";
import { AppError } from "../../../shared/errors/app-error";
import { getCurrentUsageMonth } from "../../../shared/date/get-current-usage-month";
import { MonthlyFreeUsageOrmEntity } from "../infrastructure/monthly-free-usage.orm-entity";
import { SubscriptionOrmEntity } from "../../subscriptions/infrastructure/subscription.orm-entity";

/**
 * The quota engine. Decides where a chat message's cost is charged and deducts
 * it atomically.
 *
 * Strategy (in `deductQuota`): try FREE monthly quota first (3/month), then
 * fall back to an active SUBSCRIPTION (highest remaining first), else throw a
 * typed `QUOTA_EXCEEDED` (402). Every read uses a `pessimistic_write` row lock
 * inside the caller's transaction so two concurrent requests can't both spend
 * the last credit (no double-spend).
 */
export class QuotaService {
  async deductQuota(params: {
    userId: string;
    manager: EntityManager;
  }): Promise<
    | {
        source: "free";
        remainingFreeMessages: number;
      }
    | {
        source: "subscription";
        subscriptionId: string;
        remainingMessages: number | null;
      }
  > {
    try {
      return await this.deductFreeQuota(params);
    } catch (freeError) {
      if (!(
        freeError instanceof AppError && freeError.code === "QUOTA_EXCEEDED"
      )) {
        throw freeError;
      }
    }

    try {
      return await this.deductSubscriptionQuota(params);
    } catch (subError) {
      if (subError instanceof AppError && subError.code === "QUOTA_EXCEEDED") {
        throw new AppError({
          code: "QUOTA_EXCEEDED",
          message:
            "No quota available. Please purchase a subscription or wait for your quota to reset.",
          statusCode: 402,
          details: {
            requiredAction: "CREATE_SUBSCRIPTION",
          },
        });
      }

      throw subError;
    }
  }

  async deductFreeQuota(params: {
    userId: string;
    manager: EntityManager;
  }): Promise<{
    source: "free";
    remainingFreeMessages: number;
  }> {
    const usageMonth = getCurrentUsageMonth();

    const repo = params.manager.getRepository(MonthlyFreeUsageOrmEntity);

    let usage = await repo.findOne({
      where: {
        userId: params.userId,
        usageMonth,
      },
      lock: {
        mode: "pessimistic_write",
      },
    });

    if (!usage) {
      usage = repo.create({
        userId: params.userId,
        usageMonth,
        usedMessages: 0,
        freeLimit: 3,
      });

      usage = await repo.save(usage);
    }

    if (usage.usedMessages >= usage.freeLimit) {
      throw new AppError({
        code: "QUOTA_EXCEEDED",
        message: "Free monthly quota exceeded",
        statusCode: 402,
        details: {
          usageMonth,
          freeLimit: usage.freeLimit,
          usedMessages: usage.usedMessages,
          requiredAction: "CREATE_SUBSCRIPTION",
        },
      });
    }

    usage.usedMessages += 1;

    const savedUsage = await repo.save(usage);

    return {
      source: "free",
      remainingFreeMessages: savedUsage.freeLimit - savedUsage.usedMessages,
    };
  }

  async deductSubscriptionQuota(params: {
    userId: string;
    manager: EntityManager;
  }): Promise<{
    source: "subscription";
    subscriptionId: string;
    remainingMessages: number | null;
  }> {
    const subscriptionRepo = params.manager.getRepository(
      SubscriptionOrmEntity
    );

    const subscription = await subscriptionRepo.findOne({
      where: {
        userId: params.userId,
        status: "active",
      },
      order: {
        remainingMessages: "DESC",
        endDate: "DESC",
      },
      lock: {
        mode: "pessimistic_write",
      },
    });

    if (!subscription) {
      throw new AppError({
        code: "QUOTA_EXCEEDED",
        message: "No active subscription quota available",
        statusCode: 402,
        details: {
          requiredAction: "CREATE_SUBSCRIPTION",
        },
      });
    }

    const now = new Date();

    if (subscription.endDate <= now) {
      throw new AppError({
        code: "QUOTA_EXCEEDED",
        message: "Subscription has expired",
        statusCode: 402,
        details: {
          subscriptionId: subscription.id,
          requiredAction: "RENEW_SUBSCRIPTION",
        },
      });
    }

    if (subscription.tier === "enterprise") {
      return {
        source: "subscription",
        subscriptionId: subscription.id,
        remainingMessages: null,
      };
    }

    if (
      subscription.remainingMessages === null ||
      subscription.remainingMessages <= 0
    ) {
      throw new AppError({
        code: "QUOTA_EXCEEDED",
        message: "Subscription quota exhausted",
        statusCode: 402,
        details: {
          subscriptionId: subscription.id,
          requiredAction: "CREATE_SUBSCRIPTION",
        },
      });
    }

    subscription.remainingMessages -= 1;

    const savedSubscription = await subscriptionRepo.save(subscription);

    return {
      source: "subscription",
      subscriptionId: savedSubscription.id,
      remainingMessages: savedSubscription.remainingMessages,
    };
  }
}
