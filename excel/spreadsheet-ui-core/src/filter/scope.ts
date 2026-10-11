import { atom } from '@einfach/core'
import { projectionSnapshotAtom } from '../projection/state'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { selectionSnapshotAtom } from '../selection'
import { parseA1Range } from '../name-box/address'

/** 筛选对象只读 Rust 目录，不另存 Table 范围或已提交条件。 */
const filterProjectionAtom = atom((get) => {
  const result = get(projectionSnapshotAtom).result
  return result?.kind === 'visible-window' && result.sheetId === get(activeWorkbookSheetAtom)?.id
    ? result : undefined
})
export const nativeFilterRulesAtom = atom((get) => get(filterProjectionAtom)?.filterRules ?? [])
export const nativeFilterRangeAtom = atom((get) => get(filterProjectionAtom)?.filterRange)

export const nativeTableFiltersAtom = atom((get) => {
  const sheet = get(activeWorkbookSheetAtom)
  return (get(filterProjectionAtom)?.tables ?? []).flatMap((table) => {
    const range = parseA1Range(table.range)
    return table.sheetIndex === sheet?.index && table.hasHeaders && range
      ? [{ table: table.name, range, rules: table.autoFilter?.rules ?? [] }] : []
  })
})

/** 工具栏依据活动格选作用域；表头按钮另传明确表名，不跟随此前选区。 */
export const nativeFilterTargetAtom = atom((get) => {
  const { row, col } = get(selectionSnapshotAtom).activeCell
  return get(nativeTableFiltersAtom).find(({ range }) =>
    row >= range.rowStart && row <= range.rowEnd && col >= range.colStart && col <= range.colEnd)
    ?? { table: undefined, range: get(nativeFilterRangeAtom), rules: get(nativeFilterRulesAtom) }
})
