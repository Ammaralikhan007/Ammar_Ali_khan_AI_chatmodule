import { LessThanOrEqual, Repository } from "typeorm";
import { AppDataSource } from "../../../shared/persistence/data-source";
import { AppError } from "../../../shared/errors/app-error";
import { Subscription } from "../domain/subscription.entity";
import { SubscriptionRepository } from "../domain/subscription.repository";
import { SubscriptionMapper } from "./subscription.mapper";
import { SubscriptionOrmEntity } from "./subscription.orm-entity";

/**
 * TypeORM-backed implementation of the SubscriptionRepository port. This is the
 * only place that knows about the database; it maps ORM rows to/from domain
 * `Subscription` objects so the rest of the app stays persistence-agnostic.
 */
export class TypeOrmSubscriptionRepository implements SubscriptionRepository {
  private readonly repo: Repository<SubscriptionOrmEntity>;

  constructor() {
    this.repo = AppDataSource.getRepository(SubscriptionOrmEntity);
  }

  async create(params: {
    userId: string;
    tier: "basic" | "pro" | "enterprise";
    billingCycle: "monthly" | "yearly";
    maxMessages: number | null;
    remainingMessages: number | null;
    priceCents: number;
    startDate: Date;
    endDate: Date;
    renewalDate: Date;
    autoRenew: boolean;
    status: "active" | "cancelled" | "inactive";
  }): Promise<Subscription> {
    const subscription = this.repo.create(params);

    const savedSubscription = await this.repo.save(subscription);

    return SubscriptionMapper.toDomain(savedSubscription);
  }

  async findByUserId(userId: string): Promise<Subscription[]> {
    const subscriptions = await this.repo.find({
      where: { userId },
      order: { createdAt: "DESC" },
    });

    return subscriptions.map(SubscriptionMapper.toDomain);
  }

  async findById(id: string): Promise<Subscription | null> {
    const subscription = await this.repo.findOne({
      where: { id },
    });

    return subscription ? SubscriptionMapper.toDomain(subscription) : null;
  }

  async cancel(id: string): Promise<Subscription> {
    const subscription = await this.repo.findOne({
      where: { id },
    });

    if (!subscription) {
      throw new AppError({
        code: "NOT_FOUND",
        message: "Subscription not found",
        statusCode: 404,
      });
    }

    subscription.autoRenew = false;
    subscription.status = "cancelled";

    const savedSubscription = await this.repo.save(subscription);

    return SubscriptionMapper.toDomain(savedSubscription);
  }

  async findDueForRenewal(now: Date): Promise<Subscription[]> {
    const subscriptions = await this.repo.find({
      where: {
        status: "active",
        autoRenew: true,
        renewalDate: LessThanOrEqual(now),
      },
      order: { renewalDate: "ASC" },
    });

    return subscriptions.map(SubscriptionMapper.toDomain);
  }

  async renew(params: {
    id: string;
    endDate: Date;
    renewalDate: Date;
    remainingMessages: number | null;
  }): Promise<Subscription> {
    const subscription = await this.repo.findOne({
      where: { id: params.id },
    });

    if (!subscription) {
      throw new AppError({
        code: "NOT_FOUND",
        message: "Subscription not found",
        statusCode: 404,
      });
    }

    subscription.endDate = params.endDate;
    subscription.renewalDate = params.renewalDate;
    subscription.remainingMessages = params.remainingMessages;
    subscription.status = "active";

    const savedSubscription = await this.repo.save(subscription);

    return SubscriptionMapper.toDomain(savedSubscription);
  }

  async deactivate(id: string): Promise<Subscription> {
    const subscription = await this.repo.findOne({
      where: { id },
    });

    if (!subscription) {
      throw new AppError({
        code: "NOT_FOUND",
        message: "Subscription not found",
        statusCode: 404,
      });
    }

    subscription.status = "inactive";
    subscription.autoRenew = false;

    const savedSubscription = await this.repo.save(subscription);

    return SubscriptionMapper.toDomain(savedSubscription);
  }
}
