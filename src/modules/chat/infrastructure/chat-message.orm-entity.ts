import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

/**
 * TypeORM persistence model for the `chat_messages` table. Mirrors the
 * `ChatMessage` domain entity (snake_case columns) and is mapped to/from it by
 * `ChatMessageMapper` so domain code never touches the ORM type directly.
 */
@Entity("chat_messages")
export class ChatMessageOrmEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ type: "text" })
  question!: string;

  @Column({ type: "text" })
  answer!: string;

  @Column({ name: "prompt_tokens", type: "int" })
  promptTokens!: number;

  @Column({ name: "completion_tokens", type: "int" })
  completionTokens!: number;

  @Column({ name: "total_tokens", type: "int" })
  totalTokens!: number;

  @Column({ type: "jsonb", default: {} })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
