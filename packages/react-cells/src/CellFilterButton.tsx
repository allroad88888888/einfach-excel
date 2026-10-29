import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  configureNativeFilterAtom,
  editingSessionAtom,
  getColumnLabel,
  nativeFilterFeedbackAtom,
  nativeFilterRulesAtom,
  nativeTableFiltersAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import './cell-filter.css'

/** 数据表头的入口；拦住网格拖选/编辑事件，键盘仍能正常聚焦和激活。 */
export function CellFilterButton({ col, table }: { col: number; table?: string }) {
  const regionRules = useAtomValue(nativeFilterRulesAtom)
  const tables = useAtomValue(nativeTableFiltersAtom)
  const rules = table ? tables.find((target) => target.table === table)?.rules ?? [] : regionRules
  const busy = useAtomValue(nativeFilterFeedbackAtom).busy
  const editing = useAtomValue(editingSessionAtom).source !== null
  const configure = useSetAtom(configureNativeFilterAtom)
  const active = rules.some((rule) => rule.colIndex === col)
  return (
    <button
      type="button"
      className="cell-filter-button"
      data-filtered={active}
      aria-label={`Filter ${table ? `${table} ` : ''}column ${getColumnLabel(col)}`}
      aria-haspopup="dialog"
      title={active ? 'Edit column filter' : 'Filter this column'}
      disabled={busy || editing}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        void configure({ type: 'open-column', col, ...(table ? { table } : {}) })
      }}
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12">
        <path d={active ? 'M2 3h12L9 8v5l-2-1V8z' : 'M4 6l4 4 4-4z'} fill="currentColor" />
      </svg>
    </button>
  )
}
