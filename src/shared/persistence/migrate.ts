import "reflect-metadata";
import { AppDataSource } from "./data-source";

/**
 * Tiny programmatic migration runner.
 *
 * Using a script (rather than the TypeORM CLI) keeps migrations reliable across
 * platforms and ts-node/ESM quirks — it reuses the exact same `AppDataSource`
 * the app uses. Driven by an argv command:
 *
 *   npm run migration:run      → apply all pending migrations
 *   npm run migration:revert   → roll back the most recent migration
 *
 * Wired into package.json scripts.
 */
async function main(): Promise<void> {
  const command = process.argv[2];

  await AppDataSource.initialize();

  try {
    if (command === "revert") {
      await AppDataSource.undoLastMigration();
      console.log("Reverted the last migration.");
    } else {
      const applied = await AppDataSource.runMigrations();
      if (applied.length === 0) {
        console.log("No pending migrations. Database is up to date.");
      } else {
        console.log(
          `Applied ${applied.length} migration(s): ${applied
            .map((migration) => migration.name)
            .join(", ")}`
        );
      }
    }
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
