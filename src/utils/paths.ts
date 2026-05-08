const rawBase = import.meta.env.BASE_URL || '/'
const normalizedBase = rawBase === '/' ? '' : rawBase.replace(/\/+$/, '')

export function appPath(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  if (!normalizedBase) return normalizedPath
  if (normalizedPath === '/') return `${normalizedBase}/`
  return `${normalizedBase}${normalizedPath}`
}

export function assetPath(path: string): string {
  const normalizedPath = path.replace(/^\/+/, '').replace(/^assets\//, '')
  if (normalizedPath.startsWith('pokemon-splendor/') || normalizedPath.startsWith('duel-splendor/') || normalizedPath.startsWith('splendor-base/')) {
    return appPath(`/assets/${normalizedPath}`)
  }
  return appPath(`/assets/duel-splendor/${normalizedPath}`)
}
