import { Trans, useLingui } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { runTextColumnsPanelAtom, textColumnsPanelAtom } from '@einfach-excel/spreadsheet-ui-core'

/** 编辑源字段类型；跳过后的目标映射及转换样本只取 Rust 返回值。 */
export function TextColumnTypes() {
  const { t } = useLingui()
  const TYPES = [
    ['preserve', t`Keep text (existing format)`], ['general', t`General`], ['text', t`Text`],
    ['dateMdy', t`Date — MDY`], ['dateDmy', t`Date — DMY`], ['dateYmd', t`Date — YMD`],
    ['dateMyd', t`Date — MYD`], ['dateDym', t`Date — DYM`], ['dateYdm', t`Date — YDM`],
    ['skip', t`Skip field`],
  ] as const

  const state = useAtomValue(textColumnsPanelAtom)
  const run = useSetAtom(runTextColumnsPanelAtom)
  const column = Number(state.columnNumber) - 1
  const invalid = !Number.isSafeInteger(column) || column < 0 || column >= 16_384
  const kind = state.draft.columnTypes.find((rule) => rule.column === column)?.kind ?? 'preserve'
  return <fieldset disabled={state.status !== 'idle'}>
    <legend><Trans>Field types</Trans></legend>
    <div className="text-columns-fields">
      <label><Trans>Source field number
        </Trans><input type="number" min={1} max={16384} step={1} value={state.columnNumber}
          onChange={(event) => void run({ type: 'columnNumber', value: event.currentTarget.value })} />
      </label>
      <label><Trans>Field type
        </Trans><select disabled={invalid} value={kind} onChange={(event) => void run({
          type: 'columnType', kind: event.currentTarget.value as typeof kind,
        })}>{TYPES.map(([value, label]) =>
            <option key={value} value={value}>{label}</option>,
          )}</select>
      </label>
    </div>
    <p className="text-columns-hint">
      {state.preview && t`${state.preview.sourceColumnCount} source fields. `}<Trans>
      Field numbers refer to the source, before skipping. Unspecified fields keep text.
      General converts recognized numbers, booleans and unambiguous dates; formulas stay text.
      Date uses the chosen order; invalid dates stay text.
      Two-digit years: 00–29 = 2000–2029, 30–99 = 1930–1999.
      Skip packs remaining fields left. Changing split rules resets field types.
    </Trans></p>
    {state.draft.columnTypes.length > 0 && <ul className="text-columns-type-summary" aria-label={t`Configured field types`}>
      {state.draft.columnTypes.map((rule) => <li key={rule.column}><Trans>
        Field </Trans>{rule.column + 1}: {TYPES.find(([value]) => value === rule.kind)?.[1]}
      </li>)}
    </ul>}
  </fieldset>
}
