import { loadEnvConfig } from "@next/env";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "../src/lib/firebase-admin";
import { appleConfigured, yookassaConfigured, publicationBillingPath, billingHash } from "../src/lib/billing-server";
import { APPLE_BILLING_PRODUCTS } from "../src/lib/billing";
loadEnvConfig(process.cwd());

async function main() {
  const args = new Set(process.argv.slice(2)), db = getAdminDb();
  if (args.has("--products")) { console.log(JSON.stringify(APPLE_BILLING_PRODUCTS.map(p => ({ ...p, type: "NON_RENEWING_SUBSCRIPTION", durationDays: 30 })), null, 2)); return; }
  if (args.has("--enable")) {
    if ((process.env.BILLING_IDENTITY_SECRET || "").length < 32) throw new Error("Set a permanent BILLING_IDENTITY_SECRET of at least 32 random characters first");
    if (!yookassaConfigured() && !appleConfigured()) throw new Error("Configure at least one real payment provider before enforcing tariffs");
    await db.runTransaction(async tx => { const ref = db.doc("billingConfiguration/main"), existing = await tx.get(ref); tx.set(ref, { enabled: true, schemaVersion: 1, newAccountsFrom: existing.get("newAccountsFrom") || Timestamp.now(), enabledAt: Timestamp.now() }, { merge: true }); });
    console.log("Tariffs enabled. Existing launch cohort date has been preserved");
  }
  if (args.has("--enable-totp")) {
    throw new Error("Для новой защиты не нужен Firebase MFA. Выполните node scripts/configure-strova-security.cjs, затем npm install и npm run security:check");
  }
  if (args.has("--migrate-catalog")) {
    let updated = 0, skipped = 0;
    for (const name of ["listings", "customerRequests"]) {
      let cursor = "";
      for (;;) {
        let query = db.collection(name).orderBy(FieldPath.documentId()).limit(200);
        if (cursor) query = query.startAfter(cursor);
        const page = await query.get(); if (page.empty) break;
        for (const saved of page.docs) {
          try {
            const path = publicationBillingPath(saved.data()), engagementTopicKey = billingHash(`${path.catalogSection}:${path.catalogCategoryId}:${path.subcategory}`);
            if (saved.get("subcategory") !== path.subcategory || saved.get("engagementTopicKey") !== engagementTopicKey) { await saved.ref.update({ ...path, engagementTopicKey }, { lastUpdateTime: saved.updateTime! }); updated++; }
          } catch { skipped++; }
          cursor = saved.id;
        }
        if (page.size < 200) break;
      }
    }
    console.log(JSON.stringify({ updated, skipped, note: "Unknown or concurrently edited records were left untouched; no documents were copied or deleted" }));
  }
  const status = await db.doc("billingConfiguration/main").get();
  console.log(JSON.stringify({ enabled: status.get("enabled") === true, yookassaReady: yookassaConfigured(), appleReady: appleConfigured(), identitySecretReady: (process.env.BILLING_IDENTITY_SECRET || "").length >= 32, cronReady: (process.env.CRON_SECRET || "").length >= 32 }));
}
main().catch(error => { console.error("Setup failed:", String(error?.code || error?.message || "unavailable")); process.exitCode = 1; });
