import { useAtomValue, useSetAtom } from '@einfach/react'
import { useId } from 'react'
import { nativeTablePanelAtom, runNativeTablePanelAtom, type NativeTotalFunction } from '@einfach/spreadsheet-ui-core'

const functions: readonly [NativeTotalFunction, string][] = [
  ['none', 'None'], ['sum', 'Sum'], ['average', 'Average'], ['count', 'Count'],
  ['countNums', 'Count numbers'], ['max', 'Maximum'], ['min', 'Minimum'],
  ['stdDev', 'Standard deviation'], ['var', 'Variance'],
]

/** 控件直接读写 Table atom；当前函数来自 Rust 的单元格公式投影。 */
export function TableTotals() {
  const state = useAtomValue(nativeTablePanelAtom)
  const run = useSetAtom(runNativeTablePanelAtom)
  const id = useId()
  const table = state.currentTable
  if (!table) return null
  return <section className="table-panel-totals" aria-labelledby={`${id}-title`}>
    <div className="table-panel-heading">
      <h3 id={`${id}-title`}>Totals row</h3>
      <button type="button" disabled={state.busy}
        onClick={() => void run(table.hasTotals ? 'hide-totals' : 'show-totals')}>
        {table.hasTotals ? 'Hide totals row' : 'Show totals row'}
      </button>
    </div>
    <p>{table.hasTotals
      ? 'Totals use SUBTOTAL and exclude filtered and manually hidden rows.'
      : 'Add a totals row below the table. Existing cells are never overwritten.'}
      {' '}Changes apply immediately and can be undone.</p>
    {table.hasTotals && <>
      <fieldset disabled={state.busy}>
        <label htmlFor={`${id}-column`}>Total column</label>
        <select id={`${id}-column`} value={state.totalColumn}
          onChange={(event) => void run({ totalColumn: event.currentTarget.value })}>
          {table.columns.map((column) => <option key={column} value={column}>{column}</option>)}
        </select>
        <label htmlFor={`${id}-function`}>Total function</label>
        <select id={`${id}-function`} value={state.totalFunction} onChange={(event) => {
          const option = functions.find(([value]) => value === event.currentTarget.value)
          if (option) void run({ totalFunction: option[0] })
        }}>
          {state.totalFunction === 'custom' && <option value="custom" disabled>Custom content</option>}
          {functions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </fieldset>
      <div className="table-panel-actions">
        <button type="button" disabled={state.busy || state.totalFunction === 'custom'}
          onClick={() => void run('save-total')}>Apply total</button>
      </div>
    </>}
  </section>
}
