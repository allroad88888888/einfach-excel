import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { nativeConditionalFormatPanelAtom, runNativeConditionalFormatAtom,
  type ConditionalFormatThreshold } from '@einfach-excel/spreadsheet-ui-core'

type Slot = 'minThreshold' | 'midThreshold' | 'maxThreshold' | 'lowerThreshold' | 'upperThreshold'
interface Props { idPrefix: string; slot: Slot }

/** One threshold input writes only the existing native rule draft. */
export function ThresholdFields({ idPrefix, slot }: Props) {
  const { t } = useLingui()
  const state = useAtomValue(nativeConditionalFormatPanelAtom)
  const run = useSetAtom(runNativeConditionalFormatAtom)
  const rule = state.rule
  if (rule.kind !== 'color-scale' && rule.kind !== 'data-bar' && rule.kind !== 'icon-set') return null
  const threshold = (rule as Partial<Record<Slot, ConditionalFormatThreshold>>)[slot]
  const labels = {
    minThreshold: [t`Minimum threshold type`, t`Minimum threshold value`],
    midThreshold: [t`Midpoint threshold type`, t`Midpoint threshold value`],
    maxThreshold: [t`Maximum threshold type`, t`Maximum threshold value`],
    lowerThreshold: [t`Lower icon threshold type`, t`Lower icon threshold value`],
    upperThreshold: [t`Upper icon threshold type`, t`Upper icon threshold value`],
  }
  const typeId = `${idPrefix}-${slot}-type`
  const valueId = `${idPrefix}-${slot}-value`
  const hasValue = threshold && 'value' in threshold
  function changeType(type: string) {
    const value: ConditionalFormatThreshold | undefined = type === 'auto' ? undefined
      : type === 'min' || type === 'max' ? { type }
      : { type: type as 'number' | 'percent' | 'percentile' | 'formula',
        value: type === 'formula' ? '=0' : slot === 'upperThreshold' ? '67' : slot === 'midThreshold' ? '50' : slot === 'lowerThreshold' ? '33' : '0' }
    void run({ type: 'draft', rule: { [slot]: value } })
  }
  return <>
    <label htmlFor={typeId}>{labels[slot][0]}</label>
    <select id={typeId} value={threshold?.type ?? 'auto'} onChange={(event) => changeType(event.currentTarget.value)}>
      <option value="auto"><Trans>Automatic</Trans></option>
      <option value="min"><Trans>Lowest value</Trans></option>
      <option value="max"><Trans>Highest value</Trans></option>
      <option value="number"><Trans>Number</Trans></option>
      <option value="percent"><Trans>Percent</Trans></option>
      <option value="percentile"><Trans>Percentile</Trans></option>
      <option value="formula"><Trans>Formula</Trans></option>
    </select>
    {hasValue && <>
      <label htmlFor={valueId}>{labels[slot][1]}</label>
      <input id={valueId} value={threshold.value} spellCheck={false}
        inputMode={threshold.type === 'formula' ? 'text' : 'decimal'}
        onChange={(event) => void run({ type: 'draft', rule: {
          [slot]: { ...threshold, value: event.currentTarget.value },
        } })} />
    </>}
  </>
}
