import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useId } from 'react'
import { nativeTablePanelAtom, runNativeTablePanelAtom, type NativeTotalFunction } from '@einfach-excel/spreadsheet-ui-core'

/** 控件直接读写 Table atom；当前函数来自 Rust 的单元格公式投影。 */
export function TableTotals() {
  const { t } = useLingui()
  const functions: readonly [NativeTotalFunction, string][] = [
    ['none', t`None`], ['sum', t`Sum`], ['average', t`Average`], ['count', t`Count`],
    ['countNums', t`Count numbers`], ['max', t`Maximum`], ['min', t`Minimum`],
    ['stdDev', t`Standard deviation`], ['var', t`Variance`],
  ]

  const state = useAtomValue(nativeTablePanelAtom)
  const run = useSetAtom(runNativeTablePanelAtom)
  const id = useId()
  const table = state.currentTable
  if (!table) return null
  return <section className="table-panel-totals" aria-labelledby={`${id}-title`}>
    <div className="table-panel-heading">
      <h3 id={`${id}-title`}><Trans>Totals row</Trans></h3>
      <button type="button" disabled={state.busy}
        onClick={() => void run(table.hasTotals ? 'hide-totals' : 'show-totals')}>
        {table.hasTotals ? t`Hide totals row` : t`Show totals row`}
      </button>
    </div>
    <p>{table.hasTotals
      ? t`Totals use SUBTOTAL and exclude filtered and manually hidden rows.`
      : t`Add a totals row below the table. Existing cells are never overwritten.`}
      {' '}<Trans>Changes apply immediately and can be undone.</Trans></p>
    {table.hasTotals && <>
      <fieldset disabled={state.busy}>
        <label htmlFor={`${id}-column`}><Trans>Total column</Trans></label>
        <select id={`${id}-column`} value={state.totalColumn}
          onChange={(event) => void run({ totalColumn: event.currentTarget.value })}>
          {table.columns.map((column) => <option key={column} value={column}>{column}</option>)}
        </select>
        <label htmlFor={`${id}-function`}><Trans>Total function</Trans></label>
        <select id={`${id}-function`} value={state.totalFunction} onChange={(event) => {
          const option = functions.find(([value]) => value === event.currentTarget.value)
          if (option) void run({ totalFunction: option[0] })
        }}>
          {state.totalFunction === 'custom' && <option value="custom" disabled><Trans>Custom content</Trans></option>}
          {functions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </fieldset>
      <div className="table-panel-actions">
        <button type="button" disabled={state.busy || state.totalFunction === 'custom'}
          onClick={() => void run('save-total')}><Trans>Apply total</Trans></button>
      </div>
    </>}
  </section>
}
