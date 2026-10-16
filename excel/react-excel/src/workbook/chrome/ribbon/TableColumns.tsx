import { Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useId } from 'react'
import { nativeTablePanelAtom, runNativeTablePanelAtom } from '@einfach/spreadsheet-ui-core'

/** 列名草稿属于 UI Core；提交后只显示 Rust 返回的表头定义。 */
export function TableColumns() {
  const state = useAtomValue(nativeTablePanelAtom)
  const run = useSetAtom(runNativeTablePanelAtom)
  const id = useId()
  const table = state.currentTable
  if (!table) return null
  return <section className="table-panel-columns" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}><Trans>Column names</Trans></h3>
    <p><Trans>Rename a column here or edit its header cell.
      Formulas update with the name.</Trans></p>
    <form onSubmit={(event) => { event.preventDefault(); void run('save-column') }}>
      <fieldset disabled={state.busy}>
        <label htmlFor={`${id}-column`}><Trans>Column</Trans></label>
        <select id={`${id}-column`} value={state.column}
          onChange={(event) => void run({ column: event.currentTarget.value })}>
          {table.columns.map((column) => <option key={column} value={column}>{column}</option>)}
        </select>
        <label htmlFor={`${id}-name`}><Trans>New column name</Trans></label>
        <input id={`${id}-name`} value={state.newColumnName} required autoComplete="off"
          onChange={(event) => void run({ newColumnName: event.currentTarget.value })} />
      </fieldset>
      <div className="table-panel-actions">
        <button type="submit" disabled={state.busy}><Trans>Rename column</Trans></button>
      </div>
    </form>
  </section>
}
