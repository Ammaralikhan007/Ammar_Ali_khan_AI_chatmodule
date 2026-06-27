import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export type UserOrmRole = "user" | "admin";

/**
 * TypeORM persistence model for the `users` table. `external_auth_id` and
 * `email` are unique. Mapped to the `User` domain entity by `UserMapper`.
 */
@Entity("users")
export class UserOrmEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "external_auth_id", type: "varchar", unique: true })
  externalAuthId!: string;

  @Column({ type: "varchar", unique: true })
  email!: string;

  @Column({
    type: "varchar",
    default: "user",
  })
  role!: UserOrmRole;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
