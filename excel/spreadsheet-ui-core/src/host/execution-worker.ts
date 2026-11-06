import type { RuntimeContext } from '../rust-workbook/dispatch/context'
import { readSizes } from '../rust-workbook/size-io'
import type { HostCommands } from './types'

export function refreshHostWorkbook(
  context: RuntimeContext,
): HostCommands['host.refresh']['result'] {
  const sheets = [...context.sheetsById.values()]
    .filter((sheet) => sheet.index >= 0)
    .sort((a, b) => a.index - b.index)
  // Only sparse axis metadata crosses the boundary; no whole-sheet cell scan or value mirror.
  const range = { rowStart: 0, colStart: 0, rowEnd: 1_048_575, colEnd: 16_383 }
  const geometries = sheets.map((sheet) => ({
    sheetId: sheet.id,
    range,
    ...readSizes(context.currentWorkbook(), sheet.index, range),
  }))
  return { changed: false, revision: context.revision, sheets, geometries }
}

export function controlHostCalculation(
  context: RuntimeContext,
  input: HostCommands['host.calculation']['payload'],
): HostCommands['host.calculation']['result'] {
  const workbook = context.currentWorkbook()
  if (
    !workbook.suspend_calculation ||
    !workbook.resume_calculation ||
    !workbook.calculation_suspension_depth ||
    !workbook.get_calculation_mode
  )
    throw new Error('CALCULATION_CONTROL_UNAVAILABLE')
  if (input.action === 'suspend') workbook.suspend_calculation()
  else if (input.action === 'resume') workbook.resume_calculation()
  else if (input.action === 'recalculate') {
    if (!workbook.recalculate) throw new Error('CALCULATION_CONTROL_UNAVAILABLE')
    workbook.recalculate(
      input.sheetId === undefined ? undefined : context.sheetIndex(input.sheetId),
    )
  } else throw new Error('INVALID_CALCULATION_ACTION')
  context.revision += 1
  return {
    depth: workbook.calculation_suspension_depth(),
    mode: workbook.get_calculation_mode(),
    revision: context.revision,
  }
}
