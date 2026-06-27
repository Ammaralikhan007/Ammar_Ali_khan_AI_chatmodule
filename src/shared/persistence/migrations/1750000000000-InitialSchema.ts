import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Initial database schema.
 *
 * This replaces TypeORM's `synchronize: true` (which silently mutates the DB to
 * match entities — unsafe for anything beyond local dev). The schema below is
 * the explicit, reviewable, version-controlled source of truth and mirrors the
 * five ORM entities exactly:
 *   users · subscriptions · chat_messages · monthly_free_usage · usage_ledger
 *
 * Run it with `npm run migration:run`. Revert with `npm run migration:revert`.
 */
export class InitialSchema1750000000000 implements MigrationInterface {
  name = "InitialSchema1750000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // `uuid_generate_v4()` (used as the PK default) lives in uuid-ossp.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ---- users ----------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "external_auth_id" varchar NOT NULL,
        "email" varchar NOT NULL,
        "role" varchar NOT NULL DEFAULT 'user',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_external_auth_id" UNIQUE ("external_auth_id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);

    // ---- subscriptions --------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "subscriptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "tier" varchar NOT NULL,
        "billing_cycle" varchar NOT NULL,
        "max_messages" int,
        "remaining_messages" int,
        "price_cents" int NOT NULL,
        "start_date" TIMESTAMP NOT NULL,
        "end_date" TIMESTAMP NOT NULL,
        "renewal_date" TIMESTAMP NOT NULL,
        "auto_renew" boolean NOT NULL DEFAULT false,
        "status" varchar NOT NULL DEFAULT 'active',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_subscriptions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_subscriptions_user_id" ON "subscriptions" ("user_id")`
    );

    // ---- chat_messages --------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "chat_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "question" text NOT NULL,
        "answer" text NOT NULL,
        "prompt_tokens" int NOT NULL,
        "completion_tokens" int NOT NULL,
        "total_tokens" int NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_messages" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_chat_messages_user_id" ON "chat_messages" ("user_id")`
    );

    // ---- monthly_free_usage --------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "monthly_free_usage" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "usage_month" varchar NOT NULL,
        "used_messages" int NOT NULL DEFAULT 0,
        "free_limit" int NOT NULL DEFAULT 3,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_monthly_free_usage" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_monthly_free_usage_user_month" UNIQUE ("user_id", "usage_month")
      )
    `);

    // ---- usage_ledger (append-only audit of every quota deduction) ------
    await queryRunner.query(`
      CREATE TABLE "usage_ledger" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "subscription_id" uuid,
        "chat_message_id" uuid,
        "source" varchar NOT NULL,
        "amount" int NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_usage_ledger" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_usage_ledger_user_id" ON "usage_ledger" ("user_id")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse dependency order. CASCADE clears the indexes too.
    await queryRunner.query(`DROP TABLE "usage_ledger"`);
    await queryRunner.query(`DROP TABLE "monthly_free_usage"`);
    await queryRunner.query(`DROP TABLE "chat_messages"`);
    await queryRunner.query(`DROP TABLE "subscriptions"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
