import { RibbonItem } from './RibbonItem'
import { activeCellFormatAtom, applySelectionFormatAtom } from '@einfach-excel/spreadsheet-ui-core'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react/macro'
import { NumberFormatTools } from './NumberFormatTools'
import { ToolButton } from './ToolButton'

/** 数字组：上行常规、日期、千分位与格式设置，下行百分比、货币与小数位。 */
export function NumberTools() {
  const { t } = useLingui()
  const activeFormat = useAtomValue(activeCellFormatAtom)
  const applyFormat = useSetAtom(applySelectionFormatAtom)
  return (
    <>
      <div className="ribbon-row">
        <RibbonItem id="format.general-format">
          <ToolButton
            itemId="format.general-format"
            icon="123"
            label={t`General format`}
            onClick={() => void applyFormat('general-format')}
            pressed={!activeFormat.numberFormat || activeFormat.numberFormat.kind === 'general'}
          />
        </RibbonItem>
        <RibbonItem id="format.date-format">
          <ToolButton
            itemId="format.date-format"
            icon="▦"
            label={t`Date format`}
            onClick={() => void applyFormat('date-format')}
            pressed={activeFormat.numberFormat?.kind === 'date'}
          />
        </RibbonItem>
        <RibbonItem id="format.thousands-format">
          <ToolButton
            itemId="format.thousands-format"
            icon=",0"
            label={t`Thousands format`}
            onClick={() => void applyFormat('thousands-format')}
            pressed={
              (activeFormat.numberFormat?.kind === 'number' ||
                activeFormat.numberFormat?.kind === 'decimal') &&
              activeFormat.numberFormat.thousands === true
            }
          />
        </RibbonItem>
        <NumberFormatTools />
      </div>
      <div className="ribbon-row">
        <RibbonItem id="format.percent-format">
          <ToolButton
            itemId="format.percent-format"
            icon="%"
            label={t`Percent format`}
            onClick={() => void applyFormat('percent-format')}
            pressed={
              activeFormat.numberFormat?.kind === 'percent' ||
              activeFormat.numberFormat?.kind === 'percentage'
            }
          />
        </RibbonItem>
        <RibbonItem id="format.currency-format">
          <ToolButton
            itemId="format.currency-format"
            icon="$"
            label={t`Currency format`}
            onClick={() => void applyFormat('currency-format')}
            pressed={activeFormat.numberFormat?.kind === 'currency'}
          />
        </RibbonItem>
        <RibbonItem id="format.increase-decimal-places">
          <ToolButton
            itemId="format.increase-decimal-places"
            icon=".0+"
            label={t`Increase decimal places`}
            onClick={() => void applyFormat('increase-decimal')}
          />
        </RibbonItem>
        <RibbonItem id="format.decrease-decimal-places">
          <ToolButton
            itemId="format.decrease-decimal-places"
            icon=".0−"
            label={t`Decrease decimal places`}
            onClick={() => void applyFormat('decrease-decimal')}
          />
        </RibbonItem>
      </div>
    </>
  )
}
