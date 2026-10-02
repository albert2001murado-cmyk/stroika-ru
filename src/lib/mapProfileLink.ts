export function mapProfileLink(item: { id: string; authorId?: string; userId?: string; ownerId?: string; creatorId?: string; uid?: string; customerId?: string }) {
  const owner = [item.authorId, item.customerId, item.userId, item.ownerId, item.creatorId, item.uid]
    .find(value => typeof value === "string" && value.trim());
  return owner ? `/user/${encodeURIComponent(owner.trim())}` : `/listing/${encodeURIComponent(item.id)}`;
}
