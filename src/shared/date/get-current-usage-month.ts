/**
 * Returns the current usage period as a stable `YYYY-MM` string in UTC. This is
 * the key the free-quota counter is bucketed by, so a user's 3 free messages
 * reset at the start of each calendar month regardless of server timezone.
 */
export function getCurrentUsageMonth(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}
