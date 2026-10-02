export function publicationShareUrl(kind: "listing" | "request", id: string) {
  if (!id.trim() || /[\/\\]/.test(id)) throw new Error("Некорректное объявление");
  return `https://stroika-ru.ru/${kind === "request" ? "requests" : "listing"}/${encodeURIComponent(id)}`;
}
