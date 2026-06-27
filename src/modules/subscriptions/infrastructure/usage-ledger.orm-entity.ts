import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

/**
 * Append-only audit of every quota deduction (one row per chat message). Records
 * whether the unit came from `free` or `subscription` quota and links to the
 * chat message. Never updated/deleted — cancelling a subscription preserves all
 * historical usage here.
 */
@Entity("usage_ledger")
export class UsageLedgerOrmEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ name: "subscription_id", type: "uuid", nullable: true })
  subscriptionId!: string | null;

  @Column({ name: "chat_message_id", type: "uuid", nullable: true })
  chatMessageId!: string | null;

  @Column({ type: "varchar" })
  source!: "free" | "subscription";

  @Column({ type: "int", default: 1 })
  amount!: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
