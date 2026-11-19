import type { RustSortCommands, SortMovement } from './sort-commands'
import type { WasmWorkbook } from './wasm-types'
import { withHistory } from './history-io'

/** Rust owns comparison, record placement and history snapshots. */
export function sortRange(
  workbook: WasmWorkbook, sheet: number, input: RustSortCommands['range.sort']['payload'],
): SortMovement {
  const { range, keys, hasHeader, orientation } = input
  const horizontal = orientation === 'left-to-right'
  const { caseSensitive = false, emptyFirst = false } = input
  if (orientation !== undefined && !horizontal && orientation !== 'top-to-bottom')
    throw new Error('Choose a valid sort orientation.')
  if (typeof caseSensitive !== 'boolean' || typeof emptyFirst !== 'boolean')
    throw new Error('Choose valid case and empty-cell sort options.')
  const rows = range.rowEnd - range.rowStart + 1
  const cols = range.colEnd - range.colStart + 1
  if (input.sheetId !== input.projection.sheetId) throw new Error('PROJECTION_SHEET_MISMATCH')
  if (![range.rowStart, range.rowEnd, range.colStart, range.colEnd]
    .every(offset => Number.isSafeInteger(offset) && offset >= 0) ||
    range.rowEnd >= 1_048_576 || range.colEnd >= 16_384 || rows * cols > 1_048_576 ||
    typeof hasHeader !== 'boolean' || (horizontal ? rows < 1 || cols < 2 || hasHeader
      : rows < 2 + Number(hasHeader) || cols < 1))
    throw new Error(horizontal ? 'Select at least two data columns, up to 1,048,576 cells.'
      : 'Select at least two data rows, up to 1,048,576 cells.')
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > 8)
    throw new Error('Choose 1–8 sort levels inside the selected range.')
  const start = horizontal ? range.rowStart : range.colStart
  const end = horizontal ? range.rowEnd : range.colEnd
  const positions = horizontal ? ['left', 'right'] : ['top', 'bottom']
  const valueCoordinates = new Set<number>()
  let valueKeyCount = 0
  for (const key of keys) {
    if (!key || typeof key !== 'object' || ('row' in key) === ('col' in key) ||
      ('row' in key) !== horizontal)
      throw new Error(horizontal ? 'Choose sort keys on the selected axis.'
        : 'Choose 1–8 sort levels inside the selected range.')
    const coordinate = 'row' in key ? key.row : key.col
    if (!Number.isSafeInteger(coordinate) || coordinate < start || coordinate > end)
      throw new Error('Choose 1–8 sort levels inside the selected range.')
    if ('sortOn' in key) {
      if (key.sortOn === 'icon') {
        if (!positions.includes(key.position) ||
          (key.icon !== null && (!key.icon || typeof key.icon !== 'object' ||
            !['three-arrows', 'three-traffic-lights', 'three-flags'].includes(key.icon.set) ||
            ![0, 1, 2].includes(key.icon.index))))
          throw new Error('Choose a valid icon sort target and position.')
        continue
      }
      if ((key.sortOn !== 'cell-color' && key.sortOn !== 'font-color') ||
        !positions.includes(key.position) || (key.color !== null &&
          (typeof key.color !== 'string' || key.color.length !== 7 || !/^#[\da-f]{6}$/i.test(key.color))))
        throw new Error('Choose a valid color sort target and position.')
    } else if (key.direction !== 'asc' && key.direction !== 'desc') {
      throw new Error('Choose a valid sort direction.')
    } else {
      valueKeyCount += 1
      valueCoordinates.add(coordinate)
    }
  }
  if (valueCoordinates.size !== valueKeyCount)
    throw new Error(horizontal ? 'Choose 1–8 different rows inside the selected range.'
      : 'Choose 1–8 different columns inside the selected range.')
  if (!workbook.sortRange || !workbook.history_begin || !workbook.history_finish ||
    !workbook.read_sparse_range || !workbook.snapshot_format_range)
    throw new Error('Rust sort command is unavailable.')
  const data = { ...range, rowStart: range.rowStart + Number(hasHeader) }
  return withHistory(workbook, sheet, data, 'Sort selection', true, () => {
    const result = workbook.sortRange!(sheet, {
      range: { startRow: data.rowStart, endRow: data.rowEnd,
        startCol: data.colStart, endCol: data.colEnd },
      keys: keys.map(key => 'sortOn' in key ? key : { ...key, caseSensitive, emptyFirst }),
      ...(horizontal ? { orientation } : {}),
      excludedRows: [],
    })
    if (!result.ok) throw new Error(result.code === 'spill-in-range'
      ? 'The range contains an array spill. Remove the array before sorting.'
      : result.code === 'merge-in-range' ? 'Unmerge cells before sorting this range.'
        : result.message || `Sort rejected: ${result.code}`)
    return horizontal
      ? { movedRows: 0, movedColumns: result.movedColumns ?? 0 }
      : { movedRows: result.movedRows }
  })
}
