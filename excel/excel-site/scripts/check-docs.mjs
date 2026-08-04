import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const backendTypesPath = path.resolve(siteRoot, '..', 'spreadsheet-ui-core', 'src', 'backend', 'types.ts')
const backendTypes = await readFile(backendTypesPath, 'utf8')
const requiredPorts = ['readVisibleProjection', 'readRangeProjection', 'setCellInput']

for (const port of requiredPorts) {
  if (!backendTypes.includes(port)) throw new Error(`Missing backend port in source: ${port}`)
}

console.log(`Docs source projection verified: ${requiredPorts.join(', ')}`)
