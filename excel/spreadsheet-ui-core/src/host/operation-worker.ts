import type { RuntimeContext, CommandName } from '../rust-workbook/dispatch/context'
import { createVisibleProjectionRequest } from '../projection/contracts'
import { operationCommands, type WorkbookOperation } from './operation-types'
import type { NativeWorkbookOperationResult } from './operation-types'
import type { CellRange } from '../shared'

/** Adapt a host operation to the same handlers used by the UI, inside the serial Worker queue. */
export async function executeHostOperation(
  context: RuntimeContext,
  input: WorkbookOperation,
  dispatch: (command: CommandName, payload: unknown) => Promise<unknown>,
): Promise<NativeWorkbookOperationResult> {
  if (!input || !Object.hasOwn(operationCommands, input.type))
    throw new Error('INVALID_HOST_OPERATION')
  const current = context.currentWorkbook()
  const before = current.host_mutation_state?.().sequence
  const revision = context.revision
  const sheetId =
    'sheetId' in input
      ? input.sheetId
      : input.type === 'replace'
        ? input.targets[0]?.sheetId
        : [...context.sheetsById.values()].find(item => item.index >= 0)?.id
  const sheet = sheetId && context.sheetsById.get(sheetId)
  if (!sheet || sheet.index < 0) throw new Error('INVALID_SHEET')
  const validate = (range: CellRange, target = sheet) => {
    if (
      !range ||
      ![range.rowStart, range.rowEnd, range.colStart, range.colEnd].every(Number.isSafeInteger) ||
      range.rowStart < 0 ||
      range.colStart < 0 ||
      range.rowEnd < range.rowStart ||
      range.colEnd < range.colStart ||
      range.rowEnd >= (target.rowCount ?? 1_048_576) ||
      range.colEnd >= (target.colCount ?? 16_384)
    )
      throw new Error('INVALID_RANGE')
  }
  if ('range' in input && input.range) validate(input.range)
  if (input.type === 'replace') {
    if (!Array.isArray(input.targets) || !input.targets.length || input.targets.length > 64)
      throw new Error('HOST_READ_BUDGET_EXCEEDED')
    for (const target of input.targets) {
      const found = context.sheetsById.get(target.sheetId)
      if (!found || found.index < 0) throw new Error('INVALID_SHEET')
      validate(target.range, found)
    }
  }
  const projection = createVisibleProjectionRequest({
    sheetId: sheet.id,
    requestId: -1,
    window: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
  })
  const { type, ...args } = input
  let payload: unknown = { ...args, projection }
  if (input.type === 'rich-text') payload = { ...args, revision, projection }
  if (input.type === 'format')
    payload = {
      request: {
        ...args,
        kind: 'set-format-range',
        requestId: -1,
        ...(input.replace || input.format === null ? {} : { writeMode: 'patch' }),
        scope: input.scope ?? 'cell',
      },
      projection,
    }
  if (input.type === 'clear')
    payload = { request: { ...args, requestId: -1, scope: 'cell' }, projection }
  if (input.type === 'merge') payload = { ...args, discard: input.discard ?? false, projection }
  if (input.type === 'conditional-format')
    payload = {
      ...args,
      revision: input.revision ?? current.listConditionalFormats?.(sheet.index).revision,
      projection,
    }
  if (
    input.type === 'sheet-add' ||
    input.type === 'sheet-rename' ||
    input.type === 'sheet-copy' ||
    input.type === 'sheet-hidden' ||
    input.type === 'sheet-color'
  )
    payload = args
  if (input.type === 'sheet-add') {
    const rowCount = input.rowCount ?? sheet.rowCount ?? 1_048_576
    const colCount = input.colCount ?? sheet.colCount ?? 16_384
    if (!Number.isSafeInteger(rowCount) || rowCount < 1 || rowCount > 1_048_576
      || !Number.isSafeInteger(colCount) || colCount < 1 || colCount > 16_384)
      throw new Error('INVALID_SHEET_BOUNDS')
    payload = { ...args, rowCount, colCount }
  }
  if (input.type === 'sheet-delete' || input.type === 'sheet-move')
    payload = { ...args, operation: input.type === 'sheet-delete' ? 'delete' : 'move' }
  let result: { sheetId?: string; sheet?: { id: string }; range?: CellRange;
    acknowledgement?: { affectedRange: CellRange };
    sizes?: Pick<NonNullable<NativeWorkbookOperationResult['geometry']>, 'rowHeights' | 'colWidths'> } = {}
  let displayError: NativeWorkbookOperationResult['displayError']
  try {
    result = (await dispatch(operationCommands[type], payload)) as typeof result
  } catch (error) {
    if (before === undefined || current.host_mutation_state?.().sequence === before) throw error
    if (context.revision === revision) context.revision += 1
    displayError = {
      code: 'DISPLAY_FAILED',
      message: error instanceof Error ? error.message : String(error),
    }
  }
  const geometryRange = result.range ?? result.acknowledgement?.affectedRange
    ?? ('range' in input ? input.range : undefined)
  const geometrySheet = result.sheetId ?? sheet.id
  return {
    changed: before === undefined || current.host_mutation_state?.().sequence !== before,
    revision: context.revision,
    sheets: [...context.sheetsById.values()].filter(item => item.index >= 0)
      .sort((a, b) => a.index - b.index),
    ...(displayError ? { displayError } : {}),
    ...(result.sizes && geometryRange && (context.sheetsById.get(geometrySheet)?.index ?? -1) >= 0
      ? { geometry: { sheetId: geometrySheet, range: geometryRange, ...result.sizes } } : {}),
    ...((result.sheetId ?? result.sheet?.id)
      ? { sheetId: result.sheetId ?? result.sheet?.id }
      : {}),
  }
}
