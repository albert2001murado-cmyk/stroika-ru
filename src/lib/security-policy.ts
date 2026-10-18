// Authorization must use signed Firebase Auth claims, never editable profile fields.
export function hasModeratorClaim(claims: Record<string, unknown>): boolean {
  return claims.admin === true || claims.moderator === true;
}

export function pushPreview(type: string, title: string, body: string) {
  return type === "message"
    ? { title: "Строва.ру", body: "Новое сообщение" }
    : { title, body };
}

export function safeFileExtension(name: string, contentType: string): string {
  const extension = name.includes(".") ? name.split(".").pop()?.toLowerCase() : "";
  if (extension && /^[a-z0-9]{1,8}$/.test(extension)) return extension;
  const subtype = contentType.split("/").pop()?.toLowerCase();
  return subtype && /^[a-z0-9]{1,8}$/.test(subtype) ? subtype : "bin";
}

export function validExpoPushToken(value: unknown): value is string {
  return typeof value === "string" && value.length <= 255 &&
    /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(value);
}

export function isDocumentId(value: string): boolean {
  return value.length > 0 && value.length <= 128 && value !== "." &&
    value !== ".." && !/[\/\u0000-\u001f\u007f]/.test(value);
}

export function safeInternalUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 300 ||
      !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) {
    return "/notifications";
  }
  // Reject encoded slashes/backslashes/control characters too.
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(decoded)) return "/notifications";
  } catch { return "/notifications"; }
  return value;
}
