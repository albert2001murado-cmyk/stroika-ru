import { loadEnvConfig } from "@next/env";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "../src/lib/firebase-admin";
loadEnvConfig(process.cwd());
/** Run on the existing server cron. No paid Cloud Scheduler/TTL service is required. */
async function main() {
  const dryRun = process.argv.includes("--dry-run"), db = getAdminDb(), counts: Record<string, number> = {};
  for (const [collection, field] of [
    ["accountSecurityChallenges", "expiresAt"], ["accountSecuritySessions", "expiresAt"], ["accountSecurityLimits", "until"],
  ]) {
    counts[collection] = 0;
    for (let page = 0; page < (dryRun ? 1 : 10); page++) {
      const snapshot = await db.collection(collection).where(field, "<=", Timestamp.now()).limit(200).get();
      if (snapshot.empty) break;
      counts[collection] += snapshot.size;
      if (dryRun) break;
      const batch = db.batch();
      for (const item of snapshot.docs) batch.delete(item.ref, { lastUpdateTime: item.updateTime! });
      await batch.commit();
    }
  }
  // No UID, email, OTP secret, password hash or recovery code is written to logs.
  console.log(JSON.stringify({ dryRun, counts }));
}
main().catch(() => { console.error("Не удалось очистить истёкшие сессии защиты"); process.exitCode = 1; });
