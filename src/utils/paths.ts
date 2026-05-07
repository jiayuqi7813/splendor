export function appPath(path: string) {
  const base = import.meta.env.BASE_URL ?? "/";
  const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${cleanBase}${cleanPath}` || "/";
}

export function assetPath(path: string) {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return appPath(`/assets/${cleanPath}`);
}
