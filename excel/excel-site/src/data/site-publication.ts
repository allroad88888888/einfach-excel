import { demos } from './demo-catalog'

/** Defines the public GitHub Pages addresses emitted by static publication endpoints. */
const publicOrigin = 'https://allroad88888888.github.io/einfach-excel'

const coreSitePaths = [
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
] as const

const demoSitePaths = demos.flatMap((demo) => [`/demos/${demo.id}/`, `/zh/demos/${demo.id}/`])

export const indexedSitePaths = [...coreSitePaths, ...demoSitePaths]

/** Builds a canonical public URL while preserving the GitHub Pages project path. */
export function publicUrl(path = '/'): string {
  return publicOrigin + (path.startsWith('/') ? path : '/' + path)
}
