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
    <h3 id={`${id}-title`}>Table style</h3>
    <p>Changes apply immediately. Manual cell, row and column formatting stays in place.</p>
    <fieldset disabled={state.busy}>
      <label htmlFor={`${id}-preset`}>Style preset</label>
      <select id={`${id}-preset`} value={style.preset} onChange={(event) => {
        const value = event.currentTarget.value
        const preset = NATIVE_TABLE_STYLE_PRESETS.find((option) => option === value)
        if (preset) void run({ style: { preset } })
      }}>
        <option value="none">None</option><option value="blue">Blue</option>
        <option value="green">Green</option><option value="gray">Gray</option>
      </select>
      <label className="table-style-option">
        <input type="checkbox" checked={style.bandedRows} disabled={style.preset === 'none'}
          onChange={(event) => void run({ style: { bandedRows: event.currentTarget.checked } })} />
        Banded rows
      </label>
      <label className="table-style-option">
        <input type="checkbox" checked={style.firstColumn} disabled={style.preset === 'none'}
          onChange={(event) => void run({ style: { firstColumn: event.currentTarget.checked } })} />
        First column emphasis
      </label>
    </fieldset>
  </section>
}
