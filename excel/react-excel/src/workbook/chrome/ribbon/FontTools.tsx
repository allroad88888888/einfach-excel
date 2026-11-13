import { RichTextTools } from '../../rich-text/RichTextTools'
import { RibbonItem } from './RibbonItem'
import { activeCellFormatAtom, applySelectionFormatAtom } from '@einfach-excel/spreadsheet-ui-core'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react/macro'
import { FontSizeTools } from './FontSizeTools'
import { BorderTools } from './BorderTools'
import { ColorTools } from './ColorTools'
import { FontBaselineTools } from './FontBaselineTools'
import { ToolButton } from './ToolButton'

const FONT_FAMILIES = ['Arial', 'Calibri', 'Georgia', 'Times New Roman']

/** 字体组：上行字体、字号与富文本，下行字形、边框与颜色。 */
export function FontTools() {
  const { t } = useLingui()
  const activeFormat = useAtomValue(activeCellFormatAtom)
  const applyFormat = useSetAtom(applySelectionFormatAtom)
  return (
    <>
      <div className="ribbon-row">
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
        <FontBaselineTools />
      </div>
      <div className="ribbon-row">
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
        <RichTextTools />
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
      </div>
    </>
  )
}
