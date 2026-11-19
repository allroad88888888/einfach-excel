import type { Getter, Setter } from '@einfach/core'
import type { VisibleProjectionRequest } from '../contracts'
import { applyVisibleProjectionAtom } from '../projection'
import { validateProjectionResult } from '../projection/contracts'
import { applyProjectionSizes } from '../projection/projection-sizes'
import type { ProjectionSnapshot } from '../projection/types'
import type { RustWorkbookCommands, RustWorkbookSheet } from './commands'
import { structureProjectionRequest, structureSizeRange } from './structure-geometry'
import { publishWorkbookSheetAtom, syncWorkbookCanvasAtom, type WorkbookDocumentSheet } from '../runtime/workbook-document'
import { applySheetVisibility, validSheetVisibility } from '../viewport/hidden-state'

export function publishStructureProjection(
  get: Getter,
  set: Setter,
  input: {
    readonly before: WorkbookDocumentSheet
    readonly expected: RustWorkbookSheet
    readonly projection: VisibleProjectionRequest
    readonly witness: ProjectionSnapshot
    readonly result: RustWorkbookCommands['sheet.editStructure']['result']
  },
) {
  const { before, expected, projection, witness, result } = input
  const request = structureProjectionRequest(projection, expected)
  const sizeRange = structureSizeRange(before, expected)
  if (
    result.sheet.id !== expected.id ||
    result.sheet.key !== expected.key ||
    result.sheet.index !== expected.index ||
    result.sheet.name !== expected.name ||
    result.sheet.rowCount !== expected.rowCount ||
    result.sheet.colCount !== expected.colCount ||
    !validateProjectionResult(result.projection, { request }).ok ||
    !validSheetVisibility(result.projection.visibility) ||
    Object.entries(sizeRange).some(
      ([key, value]) => result.range[key as keyof typeof sizeRange] !== value,
    )
  ) throw new Error('Rust returned a mismatched structural result.')
  applyProjectionSizes(get, set, {
    ...result.projection,
    window: result.range,
    ...result.sizes,
  })
  applySheetVisibility(get, set, before.id, result.projection.visibility!)
  set(publishWorkbookSheetAtom, { ...before, ...result.sheet })
  set(applyVisibleProjectionAtom, { witness, request, result: result.projection })
  set(syncWorkbookCanvasAtom)
}
