import { atom } from '@einfach/core'
import type { Getter } from '@einfach/core'
import type { CellRange } from '../shared'
import { snapshotRange } from './identity'
import { textToColumnsSessionAtom, textToColumnsWizardAtom } from './state'
import { effectiveTextToColumnsConfig, tokenize } from './tokenize'
import type { ImportCellPlan, TextToColumnsCommitPlan } from './types'
import { DEFAULT_DELIMITED_CONFIG, DEFAULT_FIXED_CONFIG } from './wizard-domain'

export function buildTextToColumnsCommitPlan(get: Getter): TextToColumnsCommitPlan | null {
  const wizard = get(textToColumnsWizardAtom)
  const session = get(textToColumnsSessionAtom)
  if (session === null || wizard.step !== 'step-3') return null
  const config = effectiveTextToColumnsConfig(wizard, {
    delimited: DEFAULT_DELIMITED_CONFIG, fixed: DEFAULT_FIXED_CONFIG,
  })
  const keepIndices: number[] = []
  for (let index = 0; index < wizard.formats.length; index += 1) {
    if (wizard.formats[index] !== 'skip') keepIndices.push(index)
  }
  const cells: ImportCellPlan[] = []
  for (const row of session.rows) {
    const tokens = tokenize(row.text, config)
    let outputCol = 0
    for (const sourceTokenIndex of keepIndices) {
      const format = wizard.formats[sourceTokenIndex]
      const baseCell = { row: row.sourceRow, col: session.anchor.col + outputCol,
        input: tokens[sourceTokenIndex] ?? '' }
      cells.push(Object.freeze(format === 'text' ? { ...baseCell, preserveAsText: true } : baseCell))
      outputCol += 1
    }
  }
  return Object.freeze({
    sheetId: session.sheetId,
    anchor: Object.freeze({ row: session.anchor.row, col: session.anchor.col }),
    sourceRange: session.sourceRange,
    outputColumnCount: keepIndices.length,
    cells: Object.freeze(cells),
  })
}

export function textToColumnsCommitTargetRange(plan: TextToColumnsCommitPlan): CellRange | null {
  if (plan.outputColumnCount <= 0 || plan.cells.length === 0) return null
  return snapshotRange({
    rowStart: plan.sourceRange.rowStart, rowEnd: plan.sourceRange.rowEnd,
    colStart: plan.anchor.col, colEnd: plan.anchor.col + plan.outputColumnCount - 1,
  })
}

export const confirmTextToColumnsAtom = atom(null, (get): TextToColumnsCommitPlan | null =>
  buildTextToColumnsCommitPlan(get),
)
confirmTextToColumnsAtom.debugLabel = 'spreadsheet.textToColumns.commit'
