import "reflect-metadata";
import dotenv from "dotenv";
import { DataSource } from "typeorm";
import { UserOrmEntity } from "../../modules/users/infrastructure/user.orm-entity";
import { SubscriptionOrmEntity } from "../../modules/subscriptions/infrastructure/subscription.orm-entity";
import { ChatMessageOrmEntity } from "../../modules/chat/infrastructure/chat-message.orm-entity";
import { MonthlyFreeUsageOrmEntity } from "../../modules/chat/infrastructure/monthly-free-usage.orm-entity";
import { UsageLedgerOrmEntity } from "../../modules/subscriptions/infrastructure/usage-ledger.orm-entity";
import { InitialSchema1750000000000 } from "./migrations/1750000000000-InitialSchema";

dotenv.config();

/** Coerce an env flag ("true"/"false") to boolean with a default. */
function envFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw.toLowerCase() === "true";
}

/**
 * The single TypeORM DataSource for the whole app and for the migration CLI.
 *
 * Schema management:
 *  - `synchronize` is now OFF by default. The schema is owned by explicit
 *    migrations (see ./migrations) which are run via `npm run migration:run`.
 *  - For throwaway local experiments you can still set `DB_SYNCHRONIZE=true`,
 *    but never do that against a real database — migrations are the contract.
 *
 * `migrations` are registered explicitly (not via glob) so resolution works
 * identically under ts-node and compiled JS on every platform.
 */
export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT),
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,

  entities: [
    UserOrmEntity,
    SubscriptionOrmEntity,
    ChatMessageOrmEntity,
    MonthlyFreeUsageOrmEntity,
    UsageLedgerOrmEntity,
  ],

  migrations: [InitialSchema1750000000000],
  migrationsTableName: "migrations_history",

  synchronize: envFlag("DB_SYNCHRONIZE", false),
  logging: envFlag("DB_LOGGING", false),
});
