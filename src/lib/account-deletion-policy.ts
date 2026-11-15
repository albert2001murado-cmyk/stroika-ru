import type { DocumentData } from 'firebase-admin/firestore';

export const DELETION_ROOTS = [
  'listings', 'customerRequests', 'portfolio', 'reviews', 'chats', 'users', 'listingAnalytics', 'requestAnalytics',
  'offers', 'deals', 'reports', 'supportRequests', 'verificationRequests', 'verificationAttachments', 'verificationUploadLimits',
  'availability', 'comparisonSelections', 'freePlacementAccounts', 'billingAccounts', 'billingOrders', 'billingTransactions',
  'billingUsages', 'billingIntroIdentities', 'companyInnClaims', 'phoneClaims', 'appPushTokenOwners', 'engagementProfiles',
  'engagementDeliveries', 'nearbyMatchDeliveries', 'publicationNotificationJobs', 'profileAvatarSyncJobs', 'moderationLogs',
  'accountSecurity', 'accountSecuritySessions', 'accountSecurityChallenges', 'appleExternalTokens', 'appleExternalReports', 'accountMedia',
] as const;
const UID_DOCUMENTS = new Set(['users', 'availability', 'comparisonSelections', 'freePlacementAccounts', 'billingAccounts', 'engagementProfiles', 'profileAvatarSyncJobs', 'accountSecurity', 'verificationUploadLimits']);
const OWNER_FIELDS: Record<string, string[]> = { listings: ['authorId', 'userId', 'ownerId', 'creatorId', 'uid'], customerRequests: ['customerId', 'userId', 'ownerId', 'uid'], portfolio: ['userId', 'ownerId', 'uid'], reviews: ['authorId', 'userId'] };
export type DeletedEntities = { listings: Set<string>; requests: Set<string>; reviews: Set<string>; chats: Set<string> };
export const emptyEntities = (): DeletedEntities => ({ listings: new Set(), requests: new Set(), reviews: new Set(), chats: new Set() });
export type DeletionPlan = { remove: boolean; value?: DocumentData };
function hasUid(value: unknown, uid: string) {
  return Array.isArray(value) ? value.includes(uid) : Boolean(value && typeof value === 'object' && Object.hasOwn(value, uid));
}
function withoutUid(value: unknown, uid: string) {
  if (value === uid) return '';
  if (Array.isArray(value)) return value.filter(v => v !== uid);
  if (value && typeof value === 'object') { const result = { ...value }; delete (result as DocumentData)[uid]; return result; }
  return value;
}
function chatMemberIds(data: DocumentData) {
  const out = new Set<string>();
  for (const field of ['participantIds', 'participants', 'users']) {
    const value = data[field];
    if (Array.isArray(value)) value.forEach(v => { if (typeof v === 'string') out.add(v); });
    else if (value && typeof value === 'object') Object.keys(value).forEach(v => out.add(v));
  }
  for (const field of ['ownerId', 'buyerId', 'sellerId', 'clientId', 'customerId', 'contractorId', 'authorId']) if (typeof data[field] === 'string' && data[field]) out.add(data[field]);
  return [...out];
}
function related(d: DocumentData, e: DeletedEntities) {
  return e.listings.has(d.listingId) || e.requests.has(d.requestId) || e.reviews.has(d.reviewId) || e.chats.has(d.chatId)
    || d.kind === 'listing' && e.listings.has(d.publicationId) || d.kind === 'request' && e.requests.has(d.publicationId)
    || d.kind === 'review' && e.reviews.has(d.publicationId);
}
export function deletionPlan(path: string, data: DocumentData, uid: string, entities: DeletedEntities): DeletionPlan {
  const parts = path.split('/'), root = parts[0], id = parts[1], collection = parts.at(-2);
  if (UID_DOCUMENTS.has(root) && id === uid) return { remove: true };
  if (root === 'listingAnalytics' && entities.listings.has(id) || root === 'requestAnalytics' && entities.requests.has(id)) return { remove: true };
  if (root === 'chats' && entities.chats.has(id) || root === 'customerRequests' && entities.requests.has(id)) return { remove: true };
  if (parts.length === 2 && OWNER_FIELDS[root]) {
    const owner = OWNER_FIELDS[root].map(f => data[f]).find(v => typeof v === 'string' && v.length > 0);
    return { remove: owner === uid || root === 'reviews' && (data.targetUserId === uid || data.listingAuthorId === uid || related(data, entities)) };
  }
  if (root === 'phoneClaims') {
    const owners = Array.isArray(data.owners) ? data.owners : data.ownerUid ? [data.ownerUid] : [];
    if (!owners.includes(uid)) return { remove: false };
    const remaining = owners.filter((v: string) => v !== uid);
    return remaining.length ? { remove: false, value: { ...data, owners: remaining, ownerUid: remaining.length === 1 ? remaining[0] : null } } : { remove: true };
  }
  if (root === 'chats' && parts.length === 2) {
    const ids = chatMemberIds(data);
    if (!ids.includes(uid)) return { remove: false };
    const remaining = ids.filter(v => v !== uid).sort();
    if (!(data.isGroup === true || data.chatType === 'group') || !remaining.length) return { remove: true };
    const value = { ...data };
    for (const f of ['participantIds', 'participants', 'users', 'adminIds', 'adminPermissions', 'memberTags', 'pinnedBy', 'mutedBy', 'hiddenFor', 'unreadBy', 'unreadCounts', 'typingAt', 'readBy', 'deliveredTo']) if (f in value) value[f] = withoutUid(value[f], uid);
    for (const f of ['buyerId', 'sellerId', 'clientId', 'customerId', 'contractorId', 'authorId', 'createdBy']) if (value[f] === uid) delete value[f];
    if (value.ownerId === uid) {
      const admins = Array.isArray(value.adminIds) ? value.adminIds : [];
      value.ownerId = remaining.find(v => admins.includes(v)) || remaining[0];
      value.adminIds = [...new Set([...admins, value.ownerId])];
      value.adminPermissions = { ...(value.adminPermissions || {}), [value.ownerId]: { editInfo: true, inviteMembers: true, kickMembers: true, manageTags: true } };
      value.groupAvatarUrl = ''; value.groupAvatarPath = '';
    }
    value.memberCount = remaining.length;
    if (value.lastSenderId === uid) { value.lastSenderId = ''; value.lastMessageText = ''; value.lastMessageType = 'text'; }
    return { remove: false, value };
  }
  if (collection === 'messages') {
    if (data.senderId === uid || data.authorId === uid) return { remove: true };
    const value = { ...data };
    for (const f of ['readBy', 'deliveredTo', 'hiddenFor', 'reactions']) if (hasUid(value[f], uid)) value[f] = withoutUid(value[f], uid);
    for (const f of ['replyTo', 'forwardedFrom', 'reply', 'forward']) if (value[f]?.senderId === uid || value[f]?.authorId === uid) delete value[f];
    return { remove: false, value };
  }
  if (root === 'users' && parts.length === 2) return { remove: false };
  if (collection === 'blocked' && parts.at(-1) === uid) return { remove: true };
  if (collection === 'favorites' && entities.listings.has(parts.at(-1)!)) return { remove: true };
  if (root === 'comparisonSelections' && Array.isArray(data.listingIds)) return { remove: false, value: { ...data, listingIds: data.listingIds.filter((v: string) => !entities.listings.has(v)) } };
  const fields = ['uid', 'userId', 'ownerUid', 'ownerId', 'authorId', 'senderId', 'recipientId', 'actorId', 'reporterId', 'targetOwnerId', 'targetUserId', 'clientId', 'customerId', 'workerId', 'contractorId'];
  if (fields.some(f => data[f] === uid) || related(data, entities)) return { remove: true };
  if (root === 'reports' && (entities.listings.has(data.targetId) && data.targetType === 'listing' || entities.requests.has(data.targetId) && data.targetType === 'request' || entities.chats.has(data.targetId) && data.targetType === 'chat' || entities.reviews.has(data.targetId) && data.targetType === 'review')) return { remove: true };
  return { remove: false };
}
