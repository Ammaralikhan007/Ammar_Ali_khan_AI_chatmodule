import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";

/**
 * Tracks a user's free-tier usage for one month (`usageMonth` = "YYYY-MM").
 * The unique (user, month) constraint guarantees a single counter row per user
 * per month; `QuotaService` locks and increments it for free-quota deductions.
 */
@Entity("monthly_free_usage")
@Unique(["userId", "usageMonth"])
export class MonthlyFreeUsageOrmEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ name: "usage_month", type: "varchar" })
  usageMonth!: string;

  @Column({ name: "used_messages", type: "int", default: 0 })
  usedMessages!: number;

  @Column({ name: "free_limit", type: "int", default: 3 })
  freeLimit!: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
