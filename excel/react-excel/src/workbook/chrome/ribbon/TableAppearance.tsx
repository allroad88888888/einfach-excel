import { Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useId } from 'react'
import { DEFAULT_NATIVE_TABLE_STYLE, NATIVE_TABLE_STYLE_PRESETS,
  nativeTablePanelAtom, runNativeTablePanelAtom } from '@einfach/spreadsheet-ui-core'

/** 显示 Rust 返回的样式配置；控件不保存第二份工作簿状态。 */
export function TableAppearance() {
  const state = useAtomValue(nativeTablePanelAtom)
  const run = useSetAtom(runNativeTablePanelAtom)
  const id = useId()
  if (!state.currentTable) return null
  const style = state.currentTable.style ?? DEFAULT_NATIVE_TABLE_STYLE
  return <section className="table-panel-appearance" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}><Trans>Table style</Trans></h3>
    <p><Trans>Changes apply immediately.
      Manual cell, row and column formatting stays in place.</Trans></p>
    <p id={`${id}-headers-hint`}><Trans>Hiding headers keeps column names and clears this table’s filter.</Trans></p>
    <fieldset disabled={state.busy}>
      <label className="table-style-option">
        <input type="checkbox" checked={state.currentTable.hasHeaders}
          aria-describedby={`${id}-headers-hint`}
          onChange={(event) => void run(event.currentTarget.checked ? 'show-headers' : 'hide-headers')} /><Trans>
        Header row
      </Trans></label>
      <label htmlFor={`${id}-preset`}><Trans>Style preset</Trans></label>
      <select id={`${id}-preset`} value={style.preset} onChange={(event) => {
        const value = event.currentTarget.value
        const preset = NATIVE_TABLE_STYLE_PRESETS.find((option) => option === value)
        if (preset) void run({ style: { preset } })
      }}>
        <option value="none"><Trans>None</Trans></option><option value="blue"><Trans>Blue</Trans></option>
        <option value="green"><Trans>Green</Trans></option><option value="gray"><Trans>Gray</Trans></option>
      </select>
      <label className="table-style-option">
        <input type="checkbox" checked={style.bandedRows} disabled={style.preset === 'none'}
        onChange={(event) => void run({ style: { bandedRows: event.currentTarget.checked } })} />
        <Trans>
        Banded rows
      </Trans></label>
      <label className="table-style-option">
        <input type="checkbox" checked={style.bandedColumns ?? false}
          disabled={style.preset === 'none'}
          onChange={(event) => void run({
            style: { bandedColumns: event.currentTarget.checked },
          })} /><Trans>
        Banded columns
      </Trans></label>
      <label className="table-style-option">
        <input type="checkbox" checked={style.firstColumn} disabled={style.preset === 'none'}
        onChange={(event) => void run({ style: { firstColumn: event.currentTarget.checked } })} />
        <Trans>
        First column emphasis
      </Trans></label>
      <label className="table-style-option">
        <input type="checkbox" checked={style.lastColumn ?? false} disabled={style.preset === 'none'}
        onChange={(event) => void run({ style: { lastColumn: event.currentTarget.checked } })} />
        <Trans>
        Last column emphasis
      </Trans></label>
    </fieldset>
  </section>
}
