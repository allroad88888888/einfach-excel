import { readFile } from 'node:fs/promises'

const lockfile = await readFile(new URL('../../../pnpm-lock.yaml', import.meta.url), 'utf8')
const versions = [...new Set([...lockfile.matchAll(/^  solid-js@([0-9.]+):$/gm)].map((match) => match[1]))]

if (versions.length !== 1 || versions[0] !== '1.9.12') {
  throw new Error(`Expected one solid-js@1.9.12 package snapshot; found: ${versions.join(', ') || 'none'}`)
}

console.log(`Solid runtime singleton verified: ${versions[0]}`)
