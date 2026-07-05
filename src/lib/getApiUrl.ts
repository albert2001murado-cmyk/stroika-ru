export function getApiUrl(path: string) {
  if (typeof window === "undefined") {
    return path;
  }

  const url = new URL(path, window.location.origin);

  url.username = "";
  url.password = "";

  return url.toString();
}
