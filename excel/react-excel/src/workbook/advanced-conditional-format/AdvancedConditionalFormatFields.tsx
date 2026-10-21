import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { nativeConditionalFormatPanelAtom, runNativeConditionalFormatAtom,
  type IconSetRule } from '@einfach/spreadsheet-ui-core'
import type { ReactElement } from 'react'
import { ThresholdFields } from './ThresholdFields'

export interface AdvancedConditionalFormatFieldsProps { idPrefix: string }

/** Advanced fields share the old editor's draft, busy state, focus trap and native save. */
export function AdvancedConditionalFormatFields({
  idPrefix,
}: AdvancedConditionalFormatFieldsProps): ReactElement | null {
  const { t } = useLingui()
  const { rule } = useAtomValue(nativeConditionalFormatPanelAtom)
  const run = useSetAtom(runNativeConditionalFormatAtom)
  if (rule.kind !== 'color-scale' && rule.kind !== 'data-bar' && rule.kind !== 'icon-set')
    return null
  if (rule.kind === 'icon-set')
    return (
      <>
        <label htmlFor={`${idPrefix}-icon-set`}>
          <Trans>Icon style</Trans>
        </label>
        <select
          id={`${idPrefix}-icon-set`}
          value={rule.iconSet}
          onChange={(event) =>
            void run({
              type: 'draft',
              rule: { iconSet: event.currentTarget.value as IconSetRule['iconSet'] },
            })
          }
        >
          <option value="three-arrows">
            <Trans>Three arrows</Trans>
          </option>
          <option value="three-traffic-lights">
            <Trans>Three traffic lights</Trans>
          </option>
          <option value="three-flags">
            <Trans>Three flags</Trans>
          </option>
        </select>
        <ThresholdFields idPrefix={idPrefix} slot="lowerThreshold" />
        <ThresholdFields idPrefix={idPrefix} slot="upperThreshold" />
        <label htmlFor={`${idPrefix}-reverse-icons`}>
          <Trans>Reverse icon order</Trans>
        </label>
        <input
          id={`${idPrefix}-reverse-icons`}
          type="checkbox"
          checked={rule.reverse ?? false}
          onChange={(event) =>
            void run({ type: 'draft', rule: { reverse: event.currentTarget.checked } })
          }
        />
        <label htmlFor={`${idPrefix}-only-icons`}>
          <Trans>Show icon only</Trans>
        </label>
        <input
          id={`${idPrefix}-only-icons`}
          type="checkbox"
          checked={rule.showValue === false}
          onChange={(event) =>
            void run({ type: 'draft', rule: { showValue: !event.currentTarget.checked } })
          }
        />
        <p>{t`Automatic icon thresholds are 33% and 67% of the full numeric range. Equal values enter the higher band.`}</p>
      </>
    )
  return (
    <>
      <ThresholdFields idPrefix={idPrefix} slot="minThreshold" />
      {rule.kind === 'color-scale' && rule.midColor && (
        <ThresholdFields idPrefix={idPrefix} slot="midThreshold" />
      )}
      <ThresholdFields idPrefix={idPrefix} slot="maxThreshold" />
      <p>
        <Trans>
          Percent uses the minimum-to-maximum span; percentile uses the sorted numeric values.
          Threshold formulas use the first range’s top-left cell.
        </Trans>
      </p>
    </>
  )
}
