import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * URLs that only the Vite dev server can answer: unbundled source (`/@fs/…`),
 * `?worker` source imports and pre-bundled dependency chunks such as ECharts.
 */
const DEV_SERVER_URL = /\/@fs|\?worker|\/@id\/|\.vite\/deps|echarts_core/

/**
 * Lists the specs that reach into dev-server URLs, directly or through a local
 * e2e helper. Every other spec runs against the production build.
 */
export function findDevServerSpecs(e2eDir: string): string[] {
  return readdirSync(e2eDir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.spec.ts'))
    .map((file) => path.join(e2eDir, file))
    .filter((file) => usesDevServer(file, e2eDir, new Set()))
    .sort()
}

function usesDevServer(file: string, e2eDir: string, seen: Set<string>): boolean {
  if (seen.has(file)) return false
  seen.add(file)
  const source = readFileSync(file, 'utf8')
  if (DEV_SERVER_URL.test(source)) return true
  for (const [, specifier] of source.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const helper = resolveHelper(path.dirname(file), specifier, e2eDir)
    if (helper && usesDevServer(helper, e2eDir, seen)) return true
  }
  return false
}

/** Follows only helpers inside e2e/: product source is bundled, not fetched by URL. */
function resolveHelper(directory: string, specifier: string, e2eDir: string) {
  for (const suffix of ['', '.ts', '.tsx', '/index.ts']) {
    const candidate = path.resolve(directory, `${specifier}${suffix}`)
    if (!candidate.startsWith(`${e2eDir}${path.sep}`)) return undefined
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return undefined
}
