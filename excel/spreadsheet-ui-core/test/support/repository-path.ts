import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

function findRepositoryRoot(start: string): string {
  let current = resolve(start)
  while (true) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current
    const parent = dirname(current)
    if (parent === current) throw new Error('Unable to locate the spreadsheet repository root.')
    current = parent
  }
}

const REPOSITORY_ROOT = findRepositoryRoot(process.cwd())

/** Resolves a path from the repository root without depending on the shell working directory. */
export function repositoryPath(...segments: readonly string[]): string {
  return resolve(REPOSITORY_ROOT, ...segments)
}
