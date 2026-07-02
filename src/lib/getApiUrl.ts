export function getApiUrl(path: string) {
  if (typeof window === "undefined") {
    return path;
  }

  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  // ВАЖНО:
  // Не используем window.location.href и document.baseURI.
  // Если сайт открыт через адрес с user:password@host,
  // fetch падает с ошибкой:
  // "Request cannot be constructed from a URL that includes credentials".
  //
  // protocol + host дают чистый адрес без логина/пароля.
  return `${window.location.protocol}//${window.location.host}${cleanPath}`;
}

export default getApiUrl;
