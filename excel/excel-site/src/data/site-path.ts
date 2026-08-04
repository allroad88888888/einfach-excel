const siteBase = import.meta.env.BASE_URL.replace(/\/?$/, '/')

/** Builds an internal URL that remains inside the GitHub Pages project base. */
export function sitePath(path = ''): string {
  return siteBase + path.replace(/^\//, '')
}
