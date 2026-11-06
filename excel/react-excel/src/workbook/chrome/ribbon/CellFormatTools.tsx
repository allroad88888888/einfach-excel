import { RichTextTools } from '../../rich-text/RichTextTools'
import { RibbonItem } from './RibbonItem'
import { activeCellFormatAtom, applySelectionFormatAtom } from '@einfach-excel/spreadsheet-ui-core'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react/macro'
import { FontSizeTools } from './FontSizeTools'
import { BorderTools } from './BorderTools'
import { ColorTools } from './ColorTools'
import { ConditionalFormatTools } from './ConditionalFormatTools'
import { AlternatingColorsTools } from './AlternatingColorsTools'
import { TextLayoutTools } from './TextLayoutTools'
import { MergeTools } from './MergeTools'
import { NumberFormatTools } from './NumberFormatTools'
import { ClearTools } from './ClearTools'

interface ToolButtonProps {
  readonly itemId: string
  readonly icon: string
  readonly label: string
  readonly onClick?: () => void
  readonly pressed?: boolean
  readonly disabled?: boolean
}

const FONT_FAMILIES = ['Arial', 'Calibri', 'Georgia', 'Times New Roman']

function ToolButton({ itemId, icon, label, onClick, pressed, disabled }: ToolButtonProps) {
  return (
    <button
      data-ribbon-item={itemId}
      aria-label={label}
      aria-pressed={pressed}
      className="tool-button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  )
}

/** Native cell format commands exposed by the ribbon. */
export function CellFormatTools() {
  const { t } = useLingui()
  const activeFormat = useAtomValue(activeCellFormatAtom)
  const applyFormat = useSetAtom(applySelectionFormatAtom)
  return (
    <>
      <span className="tool-separator" aria-hidden="true" />
      <RibbonItem id="format.font-family">
        <select
          data-ribbon-item="format.font-family"
          aria-label={t`Font family`}
          className="tool-select font-family-select"
          onChange={(event) =>
            void applyFormat({ type: 'font-family', value: event.currentTarget.value })
          }
          value={activeFormat.fontFamily ?? 'Arial'}
        >
          {FONT_FAMILIES.map((fontFamily) => (
            <option key={fontFamily} value={fontFamily}>
              {fontFamily}
            </option>
          ))}
        </select>
      </RibbonItem>
      <FontSizeTools />
      <RichTextTools />
      <RibbonItem id="format.bold">
        <ToolButton
          itemId="format.bold"
          icon="B"
          label={t`Bold`}
          onClick={() => void applyFormat('bold')}
          pressed={Boolean(activeFormat.bold)}
        />
      </RibbonItem>
      <RibbonItem id="format.italic">
        <ToolButton
          itemId="format.italic"
          icon="𝐼"
          label={t`Italic`}
          onClick={() => void applyFormat('italic')}
          pressed={Boolean(activeFormat.italic)}
        />
      </RibbonItem>
      <RibbonItem id="format.underline">
        <ToolButton
          itemId="format.underline"
          icon="U̲"
          label={t`Underline`}
          onClick={() => void applyFormat('underline')}
          pressed={Boolean(activeFormat.underline)}
        />
      </RibbonItem>
      <RibbonItem id="format.strikethrough">
        <ToolButton
          itemId="format.strikethrough"
          icon="S̶"
          label={t`Strikethrough`}
          onClick={() => void applyFormat('strikethrough')}
          pressed={Boolean(activeFormat.strikethrough)}
        />
      </RibbonItem>
      <RibbonItem id="format.borders">
        <ToolButton
          itemId="format.borders"
          icon="▦"
          label={t`Borders`}
          onClick={() => void applyFormat('all-borders')}
          pressed={Object.values(activeFormat.borders ?? {}).some((b) => b && b.style !== 'none')}
        />
      </RibbonItem>
      <BorderTools />
      <ColorTools kind="fill-color" />
      <ColorTools kind="text-color" />
      <ConditionalFormatTools />
      <AlternatingColorsTools />
      <span className="tool-separator" aria-hidden="true" />
      <TextLayoutTools />
      <RibbonItem id="format.decrease-indent">
        <ToolButton
          itemId="format.decrease-indent"
          icon="⇤"
          label={t`Decrease indent`}
          onClick={() => void applyFormat('decrease-indent')}
        />
      </RibbonItem>
      <RibbonItem id="format.increase-indent">
        <ToolButton
          itemId="format.increase-indent"
          icon="⇥"
          label={t`Increase indent`}
          onClick={() => void applyFormat('increase-indent')}
        />
      </RibbonItem>
      <RibbonItem id="format.wrap-text">
        <ToolButton
          itemId="format.wrap-text"
          icon="↵"
          label={t`Wrap text`}
          onClick={() => void applyFormat('wrap-text')}
          pressed={Boolean(activeFormat.wrap)}
        />
      </RibbonItem>
      <MergeTools />
      <span className="tool-separator" aria-hidden="true" />
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
      <NumberFormatTools />
      <ClearTools />
    </>
  )
}
