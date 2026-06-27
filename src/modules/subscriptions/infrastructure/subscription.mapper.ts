import { Subscription } from "../domain/subscription.entity";
import { SubscriptionOrmEntity } from "./subscription.orm-entity";

/**
 * Maps a `SubscriptionOrmEntity` (DB row) to the `Subscription` domain entity,
 * keeping persistence types out of the domain/application layers.
 */
export class SubscriptionMapper {
  static toDomain(orm: SubscriptionOrmEntity): Subscription {
    return new Subscription(
      orm.id,
      orm.userId,
      orm.tier,
      orm.billingCycle,
      orm.maxMessages,
      orm.remainingMessages,
      orm.priceCents,
      orm.startDate,
      orm.endDate,
      orm.renewalDate,
      orm.autoRenew,
      orm.status,
      orm.createdAt,
      orm.updatedAt
    );
  }
}
