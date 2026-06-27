import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export type SubscriptionOrmTier = "basic" | "pro" | "enterprise";
export type SubscriptionOrmBillingCycle = "monthly" | "yearly";
export type SubscriptionOrmStatus = "active" | "cancelled" | "inactive";

/**
 * TypeORM persistence model for the `subscriptions` table. Mirrors the
 * `Subscription` domain entity; mapped to the domain type by
 * `SubscriptionMapper`.
 */
@Entity("subscriptions")
export class SubscriptionOrmEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ type: "varchar" })
  tier!: SubscriptionOrmTier;

  @Column({ name: "billing_cycle", type: "varchar" })
  billingCycle!: SubscriptionOrmBillingCycle;

  @Column({ name: "max_messages", type: "int", nullable: true })
  maxMessages!: number | null;

  @Column({ name: "remaining_messages", type: "int", nullable: true })
  remainingMessages!: number | null;

  @Column({ name: "price_cents", type: "int" })
  priceCents!: number;

  @Column({ name: "start_date", type: "timestamp" })
  startDate!: Date;

  @Column({ name: "end_date", type: "timestamp" })
  endDate!: Date;

  @Column({ name: "renewal_date", type: "timestamp" })
  renewalDate!: Date;

  @Column({ name: "auto_renew", type: "boolean", default: false })
  autoRenew!: boolean;

  @Column({ type: "varchar", default: "active" })
  status!: SubscriptionOrmStatus;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
