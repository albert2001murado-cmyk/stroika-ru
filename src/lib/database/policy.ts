/** Translation of the supplied production Firestore rules. Default: deny.
 * Administrator database access is never delegated to the browser or phone. */
import { Timestamp, GeoPoint } from "firebase-admin/firestore";
import { assertAccountSession } from "../account-security-session";
import type { DecodedIdToken } from "firebase-admin/auth";
import { decode, encode, equal, type Mutation, type Selection, type Value } from "./value";
import { DatabaseError } from "./mutations";
import type { PostgresFirestore } from "./postgres";
const deny = () => { throw new DatabaseError("permission-denied", "Нет доступа к этим данным.", 403); };
const dataOf = (value: Value | null): any => value ? decode(value, { timestamp: (s,n) => new Timestamp(s,n), bytes: b => b, reference: path => ({path}), geopoint: (a,b) => new GeoPoint(a,b) }) : null;
const same = (a: any,b: any) => a === undefined || b === undefined ? a === b : equal(encode(a),encode(b));
const changed = (before: any,after: any) => [...new Set([...Object.keys(before || {}),...Object.keys(after || {})])].filter(k => !same(before?.[k],after?.[k]));
const only = (keys: string[], allowed: string[]) => keys.every(k => allowed.includes(k));
const unchanged = (before: any, after: any, fields: string[]) => fields.every(k => same(before?.[k],after?.[k]));
const map = (v: any) => !!v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Timestamp);
const stamp = (v: any) => v instanceof Timestamp;
const owner = (v: any) => v?.authorId ?? v?.userId ?? v?.ownerId ?? v?.creatorId ?? v?.uid ?? "";
const idsFields = ["buyerId","sellerId","clientId","customerId","contractorId","authorId","ownerId"];
const immutableChat = ["participantIds","participants","users",...idsFields,"adminIds","adminPermissions","inviteToken","inviteEnabled","chatType","isGroup","memberCount","groupTitle","groupAvatarUrl","groupAvatarPath","memberTags","archived"];
const profileFields = ["phone","verified","isVerified","verificationStatus","verifiedAt","verifiedBy","verificationRequestId","authorVerified","customerVerified","userVerified","profileVerified","identityVerificationStatus","verification","role","isAdmin","isModerator","moderationStatus","moderationBlockedAt","moderationBlockedBy","companyInn","companyKpp","companyOgrn","companyOfficialName","companyShortName","companyLegalAddress","companyRegistryType","companyRegistryStatus","ratingAverage","averageRating","reviewsCount","accountType","companyName"];
const publicationFields = ["createdAt","publishedAt","expiresAt","firstCreatedAt","renewedAt","renewalCount","billingManaged","publicationTermDays","engagementTopicKey","catalogSection","catalogCategoryId","catalogGroupId","category","subcategory"];
const publicRoots = ["listings","reviews","customerRequests","portfolio","availability"];
export class DocumentPolicy {
  readonly uid: string;
  readonly moderator: boolean;
  private active = false;
  private documents = new Map<string,Promise<any>>();
  constructor(readonly db: PostgresFirestore, readonly token: DecodedIdToken | null) {
    this.uid = token?.uid || ""; this.moderator = !!token && (token.admin === true || token.moderator === true);
  }
  async initialize() {
    if (!this.token) return;
    await assertAccountSession(this.db as any, this.token);
    const revoked = (await this.db.doc(`authRevocations/${this.uid}`).get()).data();
    if (revoked && !(this.token.auth_time > revoked.validAfter)) deny();
    const profile = await this.get(`users/${this.uid}`);
    this.active = !!profile && profile.moderationStatus !== "blocked";
  }
  private own(uid: any) { return !!this.uid && uid === this.uid; }
  private get(path: string) { if (!this.documents.has(path)) this.documents.set(path,this.db.doc(path).get().then(v => v.data())); return this.documents.get(path)!; }
  private participant(v: any) {
    return !!this.uid && !!v && (["participantIds","participants","users"].some(k => Array.isArray(v[k]) ? v[k].includes(this.uid) : map(v[k]) && Object.hasOwn(v[k],this.uid)) || idsFields.some(k => v[k] === this.uid));
  }
  private async inChat(id: string) { return this.participant(await this.get(`chats/${id}`)); }
  private async blocked(v: any) {
    const ids = v?.participantIds ?? v?.participants;
    if (!Array.isArray(ids) || ids.length !== 2) return false;
    if (!ids.every(id => typeof id === "string" && id && !id.includes("/"))) return true;
    const [a,b] = await Promise.all([this.get(`users/${ids[0]}/blocked/${ids[1]}`),this.get(`users/${ids[1]}/blocked/${ids[0]}`)]);
    return !!a || !!b;
  }
  async read(path: string, value: Value | null) {
    const p = path.split("/"), [root,id,child] = p, v = dataOf(value);
    if (p.length === 2 && publicRoots.includes(root)) return;
    if (root === "availability" && p.length === 4 && child === "days") return;
    if (root === "users") {
      if (p.length === 2 && (this.own(id) || this.moderator)) return;
      if (p.length === 4 && ["favorites","notificationSettings","pushTokens","notifications"].includes(child) && (this.own(id) || ["pushTokens","notifications"].includes(child) && this.moderator)) return;
      if (p.length === 4 && child === "blocked" && (this.own(id) || this.own(p[3]) || this.moderator)) return;
    }
    if (p.length === 2 && root === "companyInnClaims" && this.uid) return;
    if (p.length === 2 && root === "comparisonSelections" && this.own(id)) return;
    if (root === "chats" && (p.length === 2 ? this.participant(v) : p.length === 4 && child === "messages" && await this.inChat(id))) return;
    if (root === "verificationRequests" && p.length === 2 && (this.own(v?.userId) || this.moderator)) return;
    if (["reports","supportRequests"].includes(root) && p.length === 2 && this.moderator) return;
    if (["offers","deals"].includes(root) && p.length === 2 && (this.own(v?.clientId) || this.own(v?.workerId) || this.moderator)) return;
    if (root === "customerRequests" && p.length === 4 && child === "offers" && (this.moderator || this.own(v?.contractorId) || this.own((await this.get(`customerRequests/${id}`))?.customerId))) return;
    if (["listingAnalytics","requestAnalytics"].includes(root) && (p.length === 2 || p.length === 4 && child === "events")) {
      const listing = root === "listingAnalytics";
      const parent = await this.get(`${listing ? "listings" : "customerRequests"}/${id}`);
      if (this.own(parent?.[listing ? "authorId" : "customerId"])) return;
    }
    deny();
  }
  /** Rules constrain the query itself, including empty results. Never fetch all
   * private documents and filter them after the read. */
  async query(selection: Selection) {
    if (selection.group || selection.select) deny();
    const p = selection.path.split("/"), [root,id,child] = p;
    if (p.length === 1 && publicRoots.includes(root)) return;
    if (root === "availability" && p.length === 3 && child === "days") return;
    const proof = (field: string[], ops = ["=="]) => !!this.uid && (selection.filters || []).some(f => JSON.stringify(f.field) === JSON.stringify(field) && ops.includes(f.op) && same(dataOf(f.value),this.uid));
    if (root === "users") {
      if (p.length === 1 && this.moderator) return;
      if (p.length === 3 && ["favorites","blocked","notificationSettings","pushTokens","notifications"].includes(child) && (this.own(id) || ["blocked","pushTokens","notifications"].includes(child) && this.moderator)) return;
    }
    if (root === "chats") {
      if (p.length === 1 && (["participantIds","participants","users"].some(k => proof([k],["array-contains"])) || idsFields.some(k => proof([k])) || ["participants","users"].some(k => proof([k,this.uid,"uid"])))) return;
      if (p.length === 3 && child === "messages" && await this.inChat(id)) return;
    }
    if (p.length === 1 && root === "verificationRequests" && (this.moderator || proof(["userId"]))) return;
    if (p.length === 1 && ["reports","supportRequests"].includes(root) && this.moderator) return;
    if (p.length === 1 && ["offers","deals"].includes(root) && (this.moderator || proof(["clientId"]) || proof(["workerId"]))) return;
    if (root === "customerRequests" && p.length === 3 && child === "offers" && (this.moderator || proof(["contractorId"]) || this.own((await this.get(`customerRequests/${id}`))?.customerId))) return;
    if (["listingAnalytics","requestAnalytics"].includes(root) && p.length === 3 && child === "events") { await this.read(`${selection.path}/_query`,null); return; }
    deny();
  }
  private marker(before: any, after: any, field: string) {
    const a = after?.[field] ?? {}, b = before?.[field] ?? (Array.isArray(a) ? [] : {});
    if (same(a,b)) return true;
    if (map(a) && map(b)) return only(changed(b,a),[this.uid]) && (a[this.uid] == null || (field === "typingAt" ? stamp(a[this.uid]) : typeof a[this.uid] === "boolean"));
    return Array.isArray(a) && Array.isArray(b) && a.every(x => b.includes(x) || x === this.uid) && b.every(x => a.includes(x) || x === this.uid);
  }
  private initial(v: any) { return Array.isArray(v) ? v.every(x => x === this.uid) : map(v) && only(Object.keys(v),[this.uid]) && typeof (v[this.uid] ?? false) === "boolean"; }
  async write(mutation: Mutation, old: Value | null, next: Value | null, now: Value) {
    const p = mutation.path.split("/"), [root,id,child] = p, before = dataOf(old), after = dataOf(next), time = dataOf(now);
    const remove = mutation.kind === "delete", create = !old && !remove, update = !!old && !remove;
    const keys = changed(before,after);
    if (root === "users") {
      if (p.length === 2) {
        if (remove && (this.own(id) && this.active || this.moderator)) return;
        if (update && (this.own(id) && unchanged(before,after,profileFields) || this.moderator && unchanged(before,after,["role","isAdmin","isModerator","phone"]))) return;
      }
      if (p.length === 4 && child === "favorites" && this.own(id)) return;
      if (p.length === 4 && child === "blocked" && (this.own(id) || this.moderator)) return;
      if (p.length === 4 && child === "notifications" && (remove && (this.own(id) || this.moderator) || update && this.own(id) && only(keys,["read","readAt","updatedAt"]))) return;
      if (p.length === 4 && child === "pushTokens") {
        if (remove && (this.own(id) || this.moderator)) return;
        if (!remove && this.own(id) && this.active && only(Object.keys(after),["userId","token","platform","enabled","createdAt","updatedAt"]) && after.userId === id && typeof after.token === "string" && after.token.length <= 255 && /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(after.token) && ["ios","android","web"].includes(after.platform) && typeof after.enabled === "boolean" && stamp(after.createdAt) && stamp(after.updatedAt)) return;
      }
    }
    if (p.length === 2 && ["listings","customerRequests"].includes(root)) {
      const owns = this.own(root === "listings" ? owner(before) : before?.customerId);
      if (remove && (this.moderator || owns && (root === "customerRequests" || this.active))) return;
      if (update && (this.moderator && unchanged(before,after,publicationFields) || this.active && owns && only(keys,["status","updatedAt"]) && ["closed","inactive","completed","active"].includes(after.status) && (after.status !== "active" || before.status === "active"))) return;
    }
    if (root === "reviews" && p.length === 2) {
      const valid = after && Number.isInteger(after.rating) && after.rating >= 1 && after.rating <= 5 && typeof after.text === "string" && after.text.length >= 3 && after.text.length <= 1000 && after.moderationStatus === "pending" && (after.moderationStage ?? "queued") === "queued";
      if (create && this.active && this.own(after.authorId) && this.own(after.userId ?? this.uid) && valid && (after.moderationReviewedBy ?? "") === "" && after.moderationReviewedAt == null) return;
      if (update && (this.moderator || this.active && this.own(before.authorId ?? before.userId) && valid && only(keys,["text","rating","updatedAt","moderationStatus","moderationStage","moderationReason"]))) return;
      if (remove && (this.moderator || this.active && this.own(before?.authorId ?? before?.userId))) return;
    }
    if (root === "chats") {
      if (p.length === 2) {
        if (remove && this.moderator) return;
        if (update && this.active && this.participant(before) && unchanged(before,after,immutableChat) && ["typingBy","typingAt","pinnedBy"].every(k => this.marker(before,after,k))) return;
        if (create && this.active) {
          const ids = after.participantIds ?? after.participants;
          const matches = (v: any) => (Array.isArray(v) ? v.length === 2 && new Set(v).size === 2 && v.every(x => ids.includes(x)) : map(v) && Object.keys(v).length === 2 && Object.keys(v).every(x => ids.includes(x)));
          if (Array.isArray(ids) && ids.length === 2 && new Set(ids).size === 2 && ids.includes(this.uid) && ids.every(x => typeof x === "string" && x && !x.includes("/")) && after.chatType !== "group" && (after.isGroup ?? false) === false && matches(after.participants ?? ids) && matches(after.users ?? ids) && idsFields.every(k => !after[k] || ids.includes(after[k])) && !await this.blocked(after)) return;
        }
      }
      if (p.length === 4 && child === "messages" && await this.inChat(id)) {
        if (remove && (this.own(before?.senderId) || this.moderator)) return;
        if (this.active && create) {
          const bounded = ["chatId","senderId","senderName","senderAvatarUrl","text","type","mediaUrl","mediaPath","mediaType","fileName","imageUrl","imagePath","hiddenFor","pinned","readBy","deliveredTo","createdAt","updatedAt","status"];
          const lengths: Record<string,number> = {senderName:256,senderAvatarUrl:2000,mediaUrl:2000,imageUrl:2000,mediaPath:800,imagePath:800,mediaType:100,fileName:256};
          if (this.own(after.senderId) && only(Object.keys(after),bounded) && (after.chatId ?? id) === id && Object.entries(lengths).every(([k,n]) => typeof (after[k] ?? "") === "string" && (after[k] ?? "").length <= n) && same(after.createdAt ?? time,time) && stamp(after.updatedAt ?? time) && ["text","image","video","audio","document","mixed"].includes(after.type) && typeof (after.text ?? "") === "string" && (after.text ?? "").length <= 10000 && this.initial(after.readBy ?? {}) && this.initial(after.deliveredTo ?? {}) && Object.keys(after.hiddenFor ?? {}).length === 0 && (after.pinned ?? false) === false && (after.status ?? "sent") === "sent" && !await this.blocked(await this.get(`chats/${id}`))) return;
        }
        if (this.active && update) {
          if (only(keys,["hiddenFor","pinned","readBy","deliveredTo","status","updatedAt"]) && ["hiddenFor","readBy","deliveredTo"].every(k => this.marker(before,after,k)) && typeof (after.pinned ?? false) === "boolean" && ["sent","delivered","read","seen"].includes(after.status ?? "sent") && (!keys.includes("updatedAt") || stamp(after.updatedAt))) return;
          if (this.own(before.senderId) && before.type === "text" && typeof after.text === "string" && after.text.length > 0 && after.text.length <= 10000 && stamp(after.editedAt ?? time) && stamp(after.updatedAt ?? time) && only(keys,["text","editedAt","updatedAt"])) return;
        }
      }
    }
    if (root === "comparisonSelections" && p.length === 2 && this.own(id)) {
      if (remove) return;
      const ids = after.listingIds ?? [];
      if (only(Object.keys(after),["schemaVersion","listingIds","updatedAt"]) && after.schemaVersion === 2 && Array.isArray(ids) && ids.length <= 3 && new Set(ids).size === ids.length && ids.every(x => typeof x === "string" && x.length > 0 && x.length <= 128 && !x.includes("/") && x !== "." && x !== "..") && same(after.updatedAt,time)) return;
    }
    if (root === "customerRequests" && p.length === 4 && child === "offers") {
      const allowed = this.own((await this.get(`customerRequests/${id}`))?.customerId) || this.own(before?.contractorId) || this.moderator;
      if (create && this.active && this.own(after.contractorId) || remove && allowed || update && allowed && unchanged(before,after,["contractorId","customerId","requestId"])) return;
    }
    if (["listingAnalytics","requestAnalytics"].includes(root) && p.length === 4 && child === "events") {
      const listing = root === "listingAnalytics", field = listing ? "listingId" : "requestId";
      if (create && this.own(after.userId) && after[field] === id && (listing ? ["view","phone","chat"] : ["view","chat"]).includes(after.type)) return;
      if (update && this.own(before.userId) && unchanged(before,after,["userId",field,"type","dayKey"]) && before[field] === id && before.type === "view") return;
    }
    if (["reports","supportRequests"].includes(root) && p.length === 2) {
      if (create && this.active && this.own(after[root === "reports" ? "reporterId" : "userId"]) || !create && this.moderator) return;
    }
    if (root === "portfolio" && p.length === 2) {
      if (create && this.active && this.own(after.userId) || remove && (this.moderator || this.active && this.own(before?.userId)) || update && (this.moderator || this.active && this.own(before.userId) && unchanged(before,after,["userId"]))) return;
    }
    if (root === "availability") {
      if (p.length === 2 && (remove ? this.own(id) || this.moderator : this.own(id))) return;
      if (p.length === 4 && child === "days" && (this.own(id) || this.moderator)) return;
    }
    if (["offers","deals"].includes(root) && p.length === 2) {
      const participant = this.own(before?.clientId) || this.own(before?.workerId) || this.moderator;
      if (remove && this.moderator || update && participant && unchanged(before,after,["clientId","workerId"])) return;
      if (create && this.active && typeof after.clientId === "string" && typeof after.workerId === "string" && after.clientId !== after.workerId && (root === "offers" ? this.own(after.workerId) : this.own(after.clientId) || this.own(after.workerId))) return;
    }
    deny();
  }
}
