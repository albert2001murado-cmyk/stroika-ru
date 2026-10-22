export function isPublicationOwner(
  publication: unknown,
  viewerId: string | null | undefined,
  kind: "listing" | "request" = "listing"
): boolean {
  if (!viewerId || !publication || typeof publication !== "object") return false;
  const ownerId = (publication as Record<string, unknown>)[kind === "request" ? "customerId" : "authorId"];
  return typeof ownerId === "string" && ownerId === viewerId;
}
