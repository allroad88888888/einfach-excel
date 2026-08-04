import backendReadme from '../../../spreadsheet-ui-core/src/backend/README.md?raw'
import backendTypes from '../../../spreadsheet-ui-core/src/backend/types.ts?raw'
import customFormulasReadme from '../../../spreadsheet-ui-core/src/custom-formulas/README.md?raw'
import selectionReadme from '../../../spreadsheet-ui-core/src/selection/README.md?raw'
import viewportReadme from '../../../spreadsheet-ui-core/src/viewport/README.md?raw'

const repositorySourceBase = 'https://github.com/allroad88888888/einfach-excel/blob/main/'

export interface AtomFeatureDoc {
  id: 'viewport' | 'selection' | 'custom-formulas'
  title: string
  sourcePath: string
  source: string
}

export const backendTypesPath = 'excel/spreadsheet-ui-core/src/backend/types.ts'
export const backendContract = declarationFor(backendTypes, 'SpreadsheetBackend')
export const backendOverview = firstLines(backendReadme, 80)

export const atomFeatureDocs: readonly AtomFeatureDoc[] = [
  {
    id: 'viewport',
    title: 'Viewport atoms',
    sourcePath: 'excel/spreadsheet-ui-core/src/viewport/README.md',
    source: firstLines(viewportReadme, 110),
  },
  {
    id: 'selection',
    title: 'Selection atoms',
    sourcePath: 'excel/spreadsheet-ui-core/src/selection/README.md',
    source: firstLines(selectionReadme, 80),
  },
  {
    id: 'custom-formulas',
    title: 'Custom formula atoms',
    sourcePath: 'excel/spreadsheet-ui-core/src/custom-formulas/README.md',
    source: firstLines(customFormulasReadme, 130),
  },
]

export function sourceUrl(sourcePath: string): string {
  return repositorySourceBase + sourcePath
}

export function findAtomFeature(id: string): AtomFeatureDoc {
  const feature = atomFeatureDocs.find((candidate) => candidate.id === id)
  if (!feature) throw new Error(`Unknown atom feature: ${id}`)
  return feature
}

function declarationFor(source: string, name: string): string {
  const start = source.indexOf(`export interface ${name}`)
  if (start < 0) throw new Error(`Missing source declaration: ${name}`)
  const openingBrace = source.indexOf('{', start)
  let depth = 0
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') depth -= 1
    if (depth === 0) return source.slice(start, index + 1)
  }
  throw new Error(`Unclosed source declaration: ${name}`)
}

function firstLines(source: string, count: number): string {
  return source.split('\n').slice(0, count).join('\n')
}
