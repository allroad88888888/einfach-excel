import { useAtomValue, useSetAtom } from '@einfach/react'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  NUMBER_FORMAT_SPECIAL_PRESETS, numberFormatPanelAtom, runNumberFormatPanelAtom,
  type SpecialNumberFormatLocale,
} from '@einfach-excel/spreadsheet-ui-core'

/** Region and preset are one UI Core draft; no numeric formatting runs in React. */
export function SpecialNumberFormatFields({ id }: { readonly id: string }) {
  const { t } = useLingui()
  const state = useAtomValue(numberFormatPanelAtom)
  const run = useSetAtom(runNumberFormatPanelAtom)
  const { specialLocale, specialPreset } = state.draft
  const choices: readonly string[] = Object.hasOwn(NUMBER_FORMAT_SPECIAL_PRESETS, specialLocale)
    ? NUMBER_FORMAT_SPECIAL_PRESETS[specialLocale as SpecialNumberFormatLocale] : []
  const label = (preset: string) => preset === 'zip-code' ? t`ZIP Code`
    : preset === 'zip-plus-4' ? t`ZIP Code + 4` : preset === 'phone-us' ? t`Phone Number`
      : preset === 'ssn-us' ? t`Social Security Number` : t`Postal Code`
  return <>
    <label htmlFor={`${id}-special-locale`}><Trans>Locale (location)</Trans></label>
    <select id={`${id}-special-locale`} value={specialLocale} disabled={state.busy}
      onChange={event => void run({ type: 'draft', patch: { specialLocale: event.currentTarget.value } })}>
      <option value="en-US"><Trans>English (United States)</Trans></option>
      <option value="zh-CN"><Trans>Chinese (China)</Trans></option>
      {!Object.hasOwn(NUMBER_FORMAT_SPECIAL_PRESETS, specialLocale) &&
        <option value={specialLocale} disabled>{specialLocale}</option>}
    </select>
    <label htmlFor={`${id}-special-type`}><Trans>Special format type</Trans></label>
    <select id={`${id}-special-type`} value={specialPreset} disabled={state.busy}
      onChange={event => void run({ type: 'draft', patch: { specialPreset: event.currentTarget.value } })}>
      {choices.map(preset => <option key={preset} value={preset}>{label(preset)}</option>)}
      {!choices.includes(specialPreset) &&
        <option value={specialPreset} disabled>{specialPreset}</option>}
    </select>
    <p className="number-format-hint"><Trans>
      Changes numeric display only. Existing text and the original values stay unchanged.
    </Trans></p>
  </>
}
