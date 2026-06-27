import "reflect-metadata";
import { AppDataSource } from "../shared/persistence/data-source";
import { runRenewalJob } from "./renewal.job";

/**
 * One-shot CLI entrypoint for the renewal job: `npm run billing:run-renewals`.
 *
 * Owns the DataSource lifecycle (initialize → run → destroy) so it can be
 * invoked standalone, e.g. from cron in production or manually during testing.
 */
async function main(): Promise<void> {
  await AppDataSource.initialize();

  try {
    const summary = await runRenewalJob();
    console.log("Renewal job summary:");
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error("Renewal job failed:", error);
  process.exit(1);
});
