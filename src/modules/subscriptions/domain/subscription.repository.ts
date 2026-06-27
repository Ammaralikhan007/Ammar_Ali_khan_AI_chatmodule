import { Subscription } from "./subscription.entity";

/**
 * Repository PORT for subscriptions (implemented by infrastructure/TypeORM).
 * The application layer depends on this interface only — never on TypeORM.
 */
export interface SubscriptionRepository {
  create(params: {
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
  }): Promise<Subscription>;

  findByUserId(userId: string): Promise<Subscription[]>;

  findById(id: string): Promise<Subscription | null>;

  cancel(id: string): Promise<Subscription>;

  /**
   * Subscriptions eligible for auto-renewal: active, `autoRenew = true`, and
   * whose `renewalDate` has arrived (<= now). Used by the renewal job.
   */
  findDueForRenewal(now: Date): Promise<Subscription[]>;

  /**
   * Apply a successful renewal: extend the period, top up the message
   * allotment, and keep the subscription active.
   */
  renew(params: {
    id: string;
    endDate: Date;
    renewalDate: Date;
    remainingMessages: number | null;
  }): Promise<Subscription>;

  /**
   * Deactivate a subscription (e.g. after a failed renewal charge). The row and
   * its usage-ledger history are preserved; it simply stops being active.
   */
  deactivate(id: string): Promise<Subscription>;
}
