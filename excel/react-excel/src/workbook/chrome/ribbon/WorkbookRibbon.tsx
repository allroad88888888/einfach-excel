import {
  activeCellFormatAtom,
  applySelectionFormatAtom,
  SELECTION_FILL_COLOR,
  SELECTION_TEXT_COLOR,
} from '@einfach/spreadsheet-ui-core'
import { useAtomValue, useSetAtom } from '@einfach/react'
import './ribbon.css'

interface ToolButtonProps {
  readonly icon: string
  readonly label: string
  readonly onClick?: () => void
  readonly pressed?: boolean
}

const TABS = ['Start', 'Insert', 'Formulas', 'Data', 'View']
const FONT_FAMILIES = ['Arial', 'Calibri', 'Georgia', 'Times New Roman']
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36]

function ToolButton({ icon, label, onClick, pressed }: ToolButtonProps) {
  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      className="tool-button"
      onClick={onClick}
      title={label}
      type="button"
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  )
}

/** Renders a Univer-inspired collapsed spreadsheet toolbar. */
export function WorkbookRibbon() {
  const activeFormat = useAtomValue(activeCellFormatAtom)
  const applyFormat = useSetAtom(applySelectionFormatAtom)

  return (
    <div className="ribbon-shell">
      <div className="ribbon-tabs" role="tablist" aria-label="Workbook commands">
        {TABS.map((tab) => (
          <button
            aria-selected={tab === 'Start'}
            className={tab === 'Start' ? 'ribbon-tab active' : 'ribbon-tab'}
            key={tab}
            role="tab"
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>
      <span className="toolbar-divider" aria-hidden="true" />
      <div className="ribbon-tools" role="toolbar" aria-label="Start tools">
        <ToolButton icon="▣" label="Paste" />
        <ToolButton icon="✂" label="Cut" />
        <ToolButton icon="▤" label="Copy" />
        <span className="tool-separator" aria-hidden="true" />
        <select
          aria-label="Font family"
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
        <select
          aria-label="Font size"
          className="tool-select font-size-select"
          onChange={(event) =>
            void applyFormat({ type: 'font-size', value: Number(event.currentTarget.value) })
          }
          value={activeFormat.fontSize ?? 10}
        >
          {FONT_SIZES.map((fontSize) => (
            <option key={fontSize} value={fontSize}>
              {fontSize}
            </option>
          ))}
        </select>
        <ToolButton
          icon="B"
          label="Bold"
          onClick={() => void applyFormat('bold')}
          pressed={Boolean(activeFormat.bold)}
        />
        <ToolButton
          icon="𝐼"
          label="Italic"
          onClick={() => void applyFormat('italic')}
          pressed={Boolean(activeFormat.italic)}
        />
        <ToolButton
          icon="U̲"
          label="Underline"
          onClick={() => void applyFormat('underline')}
          pressed={Boolean(activeFormat.underline)}
        />
        <ToolButton
          icon="▦"
          label="Borders"
          onClick={() => void applyFormat('all-borders')}
          pressed={Boolean(activeFormat.borders && Object.keys(activeFormat.borders).length)}
        />
        <ToolButton
          icon="▰"
          label="Fill color"
          onClick={() => void applyFormat('fill-color')}
          pressed={activeFormat.bgColor === SELECTION_FILL_COLOR}
        />
        <ToolButton
          icon="A̲"
          label="Text color"
          onClick={() => void applyFormat('text-color')}
          pressed={activeFormat.fgColor === SELECTION_TEXT_COLOR}
        />
        <span className="tool-separator" aria-hidden="true" />
        <ToolButton
          icon="☷"
          label="Horizontal alignment"
          onClick={() => void applyFormat('horizontal-alignment')}
          pressed={activeFormat.align !== undefined && activeFormat.align !== 'default'}
        />
        <ToolButton
          icon="↕"
          label="Vertical alignment"
          onClick={() => void applyFormat('vertical-alignment')}
          pressed={activeFormat.verticalAlign !== undefined}
        />
        <ToolButton
          icon="↗"
          label="Text rotation"
          onClick={() => void applyFormat('text-rotation')}
          pressed={activeFormat.rotation !== undefined && activeFormat.rotation !== 0}
        />
        <ToolButton
          icon="↵"
          label="Wrap text"
          onClick={() => void applyFormat('wrap-text')}
          pressed={Boolean(activeFormat.wrap)}
        />
        <ToolButton icon="⊞" label="Merge cells" />
        <span className="tool-separator" aria-hidden="true" />
        <button className="tool-select number-format-select" type="button">
          General <span>⌄</span>
        </button>
        <ToolButton icon="%" label="Percent format" />
        <ToolButton icon="Σ" label="Auto sum" />
        <div className="toolbar-spacer" />
        <ToolButton icon="⌕" label="Find" />
        <ToolButton icon="⋮" label="More tools" />
      </div>
    </div>
  )
}
