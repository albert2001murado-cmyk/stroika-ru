/** Browser DOMException.code can be a number; a TypeScript assertion cannot change it. */
export function clientErrorCode(error: unknown): string {
  if (!error || (typeof error !== "object" && typeof error !== "function")) return "";
  try {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : "";
  } catch { return ""; }
}
