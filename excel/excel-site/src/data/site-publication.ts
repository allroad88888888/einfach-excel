/** Defines the public GitHub Pages addresses emitted by static publication endpoints. */
const publicOrigin = 'https://allroad88888888.github.io/einfach-excel'

export const indexedSitePaths = [
  '/',
  '/zh/',
  '/docs/getting-started/',
  '/docs/backend-port/',
  '/docs/atoms/viewport/',
  '/docs/atoms/selection/',
  '/docs/atoms/custom-formulas/',
  '/api/',
  '/zh/docs/getting-started/',
  '/zh/docs/backend-port/',
  '/zh/docs/atoms/viewport/',
  '/zh/docs/atoms/selection/',
  '/zh/docs/atoms/custom-formulas/',
  '/zh/api/',
  '/demos/viewport-projection/',
  '/demos/lazy-formulas/',
  '/demos/lazy-area/',
  '/demos/formula-engine/',
  '/demos/custom-formulas/',
  '/demos/clean-messy-data/',
  '/demos/hand-off-a-form/',
  '/demos/bring-your-own-backend/',
  '/demos/collaboration/',
  '/demos/workbench/',
] as const

/** Builds a canonical public URL while preserving the GitHub Pages project path. */
export function publicUrl(path = '/'): string {
  return publicOrigin + (path.startsWith('/') ? path : '/' + path)
}
