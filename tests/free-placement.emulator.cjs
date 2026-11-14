const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const ts = require("typescript");

const projectId = "demo-strova-free-placement";
assert.match(process.env.FIRESTORE_EMULATOR_HOST || "", /^127\.0\.0\.1:\d+$/);
assert.notEqual(process.env.NODE_ENV, "production");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (id, ...args) {
  return resolve.call(this, id.startsWith("@/") ? path.resolve(__dirname, "../src", id.slice(2)) : id, ...args);
};
require.extensions[".ts"] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);

const app = require("firebase-admin/app").initializeApp({ projectId });
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const db = getFirestore(app);
const { FREE_CATALOGS } = require("../src/lib/free-placement.ts");
const { oneCalendarMonthAfter, publicationExpiryMillis } = require("../src/lib/publication-lifetime.ts");
const { getFreePlacement, activateFreeCatalog } = require("../src/lib/free-placement-server.ts");
const { createPublication } = require("../src/lib/publication-create-server.ts");
const { renewOwnedPublication } = require("../src/lib/publication-renewal-server.ts");
const { getCatalogFormCategories } = require("../src/data/catalogForm.ts");
const accessRoute = require("../src/app/api/publications/access/route.ts");
const { NextRequest } = require("next/server");
const { verificationFormError, EMPTY_VERIFICATION_FORM } = require("../src/lib/accountVerification.ts");

let seq = 0, passed = 0;
async function check(message, run) { await run(); passed++; console.log("PASS", message); }
async function user() {
  const uid = randomUUID();
  await db.doc("users/" + uid).set({ displayName: "Тест", phone: "+79001234567", accountType: "ooo" });
  return uid;
}
function input(catalog, kind = "listing", differentEquipment = 0) {
  const category = getCatalogFormCategories(catalog).find(cat => cat.subcategories.length >= (catalog === "equipment" ? 4 : 1));
  assert.ok(category);
  return { kind, requestId: randomUUID(), publication: {
    title: "Тест размещения " + (++seq), description: "Тестовое описание для тестов размещения " + seq,
    city: "Нижний Новгород", catalogSection: catalog, catalogCategoryId: category.id,
    category: category.category, subcategory: category.subcategories[differentEquipment], catalogGroupId: category.groupId,
  } };
}
const doc = (id, kind = "listing") => db.doc((kind === "listing" ? "listings/" : "customerRequests/") + id);
const code = (wanted) => (error) => error.code === wanted;
async function expires(id, kind = "listing") {
  const ms = Date.now() - 5_000;
  await doc(id, kind).update({ expiresAt: Timestamp.fromMillis(ms) });
  return publicationExpiryMillis((await doc(id, kind).get()).data());
}
function renew(uid, id, expectedExpiresAt, kind = "listing") {
  return renewOwnedPublication({ uid, kind, publicationId: id, authTime: Date.now() / 1000, expectedExpiresAt });
}

async function main() {
  const uid = await user();
  const customer = await user();
  await check("access requires authentication for read and activation", async () => {
    const url = "http://localhost/api/publications/access";
    assert.equal((await accessRoute.GET(new NextRequest(url))).status, 401);
    assert.equal((await accessRoute.POST(new NextRequest(url, { method: "POST", body: "{}" }))).status, 401);
  });
  await check("no creation bypass via role, quota, payment or status fields", async () => {
    const body = input("materials");
    Object.assign(body.publication, { role: "customer", funding: "free", limit: 999, moderationStatus: "approved" });
    await assert.rejects(createPublication(uid, body), code("activation-required"));
    assert.equal((await getFreePlacement(uid)).materials.active, false);
  });
  await check("customer creates and renews without activation or quota debit", async () => {
    const { id } = await createPublication(customer, input("equipment", "request"));
    for (let i = 0; i < 2; i++) {
      const r = await renew(customer, id, await expires(id, "request"), "request");
      assert.equal(r.expiresAt, oneCalendarMonthAfter(r.createdAt));
      assert.equal(r.renewalCount, i + 1);
    }
    assert.equal((await db.doc("freePlacementAccounts/" + customer).get()).exists, false);
  });
  const ids = {};
  await check("four separate activated catalogs, each with exactly three free creations", async () => {
    for (const catalog of FREE_CATALOGS) {
      assert.equal((await getFreePlacement(uid))[catalog].active, false);
      assert.deepEqual((await activateFreeCatalog(uid, catalog))[catalog], { active: true, remaining: 3 });
      ids[catalog] = [];
      for (let i = 0; i < 3; i++) {
        const body = input(catalog, "listing", catalog === "equipment" ? i : 0);
        const { id } = await createPublication(uid, body);
        assert.equal((await createPublication(uid, body)).id, id);
        ids[catalog].push(id);
        const data = (await doc(id).get()).data();
        assert.equal(data.moderationStatus, "pending");
        assert.equal(data.moderationStage, "queued");
        assert.equal(data.expiresAt.toMillis(), oneCalendarMonthAfter(data.createdAt.toMillis()));
        assert.equal(data.paymentMethods, undefined);
      }
      await assert.rejects(createPublication(uid, input(catalog)), code("free-limit-used"));
    }
  });
  await check("deletion and reactivation do not restore used placements", async () => {
    await doc(ids.materials[2]).delete();
    assert.equal((await activateFreeCatalog(uid, "materials")).materials.remaining, 0);
    await assert.rejects(createPublication(uid, input("materials")), code("free-limit-used"));
  });
  await check("each listing gets one renewal, without spending a placement", async () => {
    for (const id of ids.materials.slice(0, 2)) {
      const deadline = await expires(id);
      const r = await renew(uid, id, deadline);
      assert.equal(r.renewalCount, 1);
      assert.equal(r.expiresAt, oneCalendarMonthAfter(r.createdAt));
      assert.equal(r.moderationStatus, "pending");
      assert.equal((await renew(uid, id, deadline)).alreadyRenewed, true);
      await assert.rejects(renew(uid, id, await expires(id)), code("renewal-used"));
    }
    assert.equal((await getFreePlacement(uid)).materials.remaining, 0);
  });
  await check("legacy listings may renew without having to create a new allowance", async () => {
    const legacy = await user(), id = randomUUID();
    await doc(id).set({ ...input("services").publication, authorId: legacy, createdAt: Timestamp.fromMillis(Date.now() - 40 * 86_400_000), moderationStatus: "approved", publicationTermDays: 30 });
    const deadline = await expires(id);
    const r = await renew(legacy, id, deadline);
    assert.equal(r.renewalCount, 1);
    assert.equal((await doc(id).get()).get("publicationTermDays"), undefined);
    assert.equal((await getFreePlacement(legacy)).services.active, false);
    await assert.rejects(renew(customer, id, r.expiresAt), e => e.status === 403);
  });
  await check("equipment duplicate is blocked even in a different city", async () => {
    const owner = await user();
    await activateFreeCatalog(owner, "equipment");
    await createPublication(owner, input("equipment"));
    const duplicate = input("equipment"); duplicate.publication.city = "Москва";
    await assert.rejects(createPublication(owner, duplicate), code("equipment-duplicate"));
    assert.equal((await getFreePlacement(owner)).equipment.remaining, 2);
  });
  await check("identical materials and customer duplicates are blocked", async () => {
    const owner = await user();
    await activateFreeCatalog(owner, "materials");
    for (const kind of ["listing", "request"]) {
      const post = input("materials", kind);
      await createPublication(owner, post);
      await assert.rejects(createPublication(owner, { ...post, requestId: randomUUID() }), code("duplicate-publication"));
    }
  });
  await check("concurrent creates cannot both consume the last placement", async () => {
    const owner = await user();
    await activateFreeCatalog(owner, "services");
    for (let i = 0; i < 2; i++) await createPublication(owner, input("services"));
    const r = await Promise.allSettled([createPublication(owner, input("services")), createPublication(owner, input("services"))]);
    assert.equal(r.filter(x => x.status === "fulfilled").length, 1);
    assert.equal(r.filter(x => x.status === "rejected" && x.reason.code === "free-limit-used").length, 1);
  });
  await check("blocked account cannot activate catalog or publish", async () => {
    await db.doc("users/" + customer).update({ moderationStatus: "blocked" });
    await assert.rejects(activateFreeCatalog(customer, "solutions"), e => e.status === 403);
    await assert.rejects(createPublication(customer, input("solutions", "request")), e => e.status === 403);
  });
  await check("company verification only accepts an owner or manager", async () => {
    const company = { ...EMPTY_VERIFICATION_FORM, accountType: "ooo", name: "Тестовый Руководитель", city: "Москва", phone: "+79001234567", documentConsent: true,
      attachments: [{ id: randomUUID(), kind: "registration", size: 9 }] };
    assert.match(verificationFormError({ ...company, companyRole: "representative" }), /владельцу или руководителю/);
    assert.equal(verificationFormError({ ...company, companyRole: "owner" }), "");
  });
  console.log(passed + " checks passed");
}

main().then(() => db.terminate()).catch(async error => { console.error(error); await db.terminate(); process.exitCode = 1; });
