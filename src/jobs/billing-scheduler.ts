import { runRenewalJob } from "./renewal.job";

/**
 * Optional in-process scheduler for the renewal job.
 *
 * Disabled by default. When `BILLING_SCHEDULER_ENABLED=true`, the renewal job
 * runs on a fixed interval (`BILLING_SCHEDULER_INTERVAL_MS`, default 1 hour)
 * for the lifetime of the server process. In a real system this would be a
 * proper cron (e.g. a Kubernetes CronJob hitting `run-renewals`), but a timer
 * keeps the project self-contained and easy to demo.
 *
 * The timer is `unref()`'d so it never keeps the process alive on its own.
 */
export function startBillingScheduler(): NodeJS.Timeout | null {
  const enabled =
    (process.env.BILLING_SCHEDULER_ENABLED ?? "false").toLowerCase() === "true";

  if (!enabled) {
    return null;
  }

  const intervalMs = Number(
    process.env.BILLING_SCHEDULER_INTERVAL_MS ?? 3_600_000
  );

  console.log(
    `Billing scheduler enabled — running renewal job every ${intervalMs}ms`
  );

  const timer = setInterval(async () => {
    try {
      const summary = await runRenewalJob();
      console.log("[billing-scheduler] renewal run:", JSON.stringify(summary));
    } catch (error) {
      console.error("[billing-scheduler] renewal run failed:", error);
    }
  }, intervalMs);

  timer.unref();

  return timer;
}
