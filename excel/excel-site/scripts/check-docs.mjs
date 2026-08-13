import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const backendTypesPath = path.resolve(
  siteRoot,
  '..',
  'spreadsheet-ui-core',
  'src',
  'backend',
  'types.ts',
)
const aiContentPath = path.resolve(siteRoot, 'src', 'data', 'ai-content.ts')
const backendTypes = await readFile(backendTypesPath, 'utf8')
const aiContent = await readFile(aiContentPath, 'utf8')
const requiredPorts = ['readVisibleProjection', 'readRangeProjection', 'setCellInput']
const agentGuidanceMarkers = [
  '## Agent integration',
  ...requiredPorts,
  'workbook facts',
  'implementation choice',
]

for (const port of requiredPorts) {
  if (!backendTypes.includes(port)) throw new Error(`Missing backend port in source: ${port}`)
}

for (const marker of agentGuidanceMarkers) {
  if (!aiContent.includes(marker)) {
    throw new Error(`Missing agent integration guidance: ${marker}`)
  }
}

const guidanceUsageCount = aiContent.match(/\$\{agentIntegrationGuidance\}/g)?.length ?? 0
if (guidanceUsageCount !== 2) {
  throw new Error('Agent integration guidance must be included in both llms outputs')
}

console.log(`Docs source projection and agent guidance verified: ${requiredPorts.join(', ')}`)
