import {
  activeCellFormatAtom,
  applySelectionFormatAtom,
  workbookRibbonTabAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { ClipboardTools } from './ClipboardTools'
import { ClearTools } from './ClearTools'
import { FormatPainterTools } from './FormatPainterTools'
import { SelectionSizeTools } from './SelectionSizeTools'
import { HistoryTools } from './HistoryTools'
import { VisibilityTools } from './VisibilityTools'
import { OutlineTools } from './OutlineTools'
import { FillTools } from './FillTools'
import { FillSeriesTools } from './FillSeriesTools'
import { SortTools } from './SortTools'
import { FilterTools } from './FilterTools'
import { TextColumnsTools } from './TextColumnsTools'
import { RemoveDuplicatesTools } from './RemoveDuplicatesTools'
import { StructureTools } from './StructureTools'
import { MergeTools } from './MergeTools'
import { FreezeTools } from './FreezeTools'
import { FindReplaceTools } from './FindReplaceTools'
import { GoToTools } from './GoToTools'
import { GoToSpecialTools } from './GoToSpecialTools'
import { QuickFormulaTools } from './QuickFormulaTools'
import { InsertFunctionTools } from './InsertFunctionTools'
import { CalculationTools } from './CalculationTools'
import { SpillTools } from './SpillTools'
import { NamedRangeTools } from './NamedRangeTools'
import { TableTools } from './TableTools'
import { ConditionalFormatTools } from './ConditionalFormatTools'
import { DataValidationTools } from './DataValidationTools'
import { ColorTools } from './ColorTools'
import { TextLayoutTools } from './TextLayoutTools'
import { FontSizeTools } from './FontSizeTools'
import { NumberFormatTools } from './NumberFormatTools'
import { BorderTools } from './BorderTools'
import { HyperlinkTools } from '../../hyperlink/HyperlinkTools'
import { NoteTools } from '../../notes/NoteTools'
import { CommentTools } from '../../comments/CommentTools'
import { ProtectionTools } from '../../protection/ProtectionTools'
import { CustomFormulaTools } from '../../custom-formulas/CustomFormulaTools'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useId, useLayoutEffect, useRef } from 'react'
import { RibbonTabs, ribbonTabLabels } from './RibbonTabs'
import { useLingui } from '@lingui/react/macro'
import './ribbon.css'

interface ToolButtonProps {
  readonly icon: string
  readonly label: string
  readonly onClick?: () => void
  readonly pressed?: boolean
  readonly disabled?: boolean
}

const FONT_FAMILIES = ['Arial', 'Calibri', 'Georgia', 'Times New Roman']

function ToolButton({ icon, label, onClick, pressed, disabled }: ToolButtonProps) {
  return (
    <button
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

/** Renders a Univer-inspired collapsed spreadsheet toolbar. */
export function WorkbookRibbon() {
  const { i18n, t } = useLingui()
  const tab = useAtomValue(workbookRibbonTabAtom)
  const tabLabel = i18n._(ribbonTabLabels[tab])
  const id = useId()
  const all = tab === 'Start'
  const toolsRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (toolsRef.current) toolsRef.current.scrollLeft = 0
  }, [tab])
  const activeFormat = useAtomValue(activeCellFormatAtom)
  const applyFormat = useSetAtom(applySelectionFormatAtom)

  return (
    <div className="ribbon-shell">
      <RibbonTabs id={id} />
      <span className="toolbar-divider" aria-hidden="true" />
      <div
        className="ribbon-panel"
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${tab}`}
      >
        <div ref={toolsRef} className="ribbon-tools" role="toolbar" aria-label={t`${tabLabel} tools`}>
          <div className="ribbon-tool-group" data-inactive={!all}>
            <ClipboardTools />
            <FormatPainterTools />
          </div>
          <HistoryTools />
          <div className="ribbon-tool-group" data-inactive={!all && tab !== 'Data'}>
            <FillTools />
            <FillSeriesTools />
            <SortTools />
            <FilterTools />
            <TextColumnsTools />
            <RemoveDuplicatesTools />
            <DataValidationTools />
            <ProtectionTools />
          </div>
          <div className="ribbon-tool-group" data-inactive={!all && tab !== 'View'}>
            <VisibilityTools />
            <OutlineTools />
            <FreezeTools />
            <SelectionSizeTools />
          </div>
          <div className="ribbon-tool-group" data-inactive={!all && tab !== 'Insert'}>
            <StructureTools />
            <TableTools />
            <HyperlinkTools />
            <NoteTools />
            <CommentTools />
          </div>
          <div className="ribbon-tool-group" data-inactive={!all}>
            <span className="tool-separator" aria-hidden="true" />
            <select
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
            <FontSizeTools />
            <ToolButton
              icon="B"
              label={t`Bold`}
              onClick={() => void applyFormat('bold')}
              pressed={Boolean(activeFormat.bold)}
            />
            <ToolButton
              icon="𝐼"
              label={t`Italic`}
              onClick={() => void applyFormat('italic')}
              pressed={Boolean(activeFormat.italic)}
            />
            <ToolButton
              icon="U̲"
              label={t`Underline`}
              onClick={() => void applyFormat('underline')}
              pressed={Boolean(activeFormat.underline)}
            />
            <ToolButton
              icon="S̶"
              label={t`Strikethrough`}
              onClick={() => void applyFormat('strikethrough')}
              pressed={Boolean(activeFormat.strikethrough)}
            />
            <ToolButton
              icon="▦"
              label={t`Borders`}
              onClick={() => void applyFormat('all-borders')}
              pressed={Object.values(activeFormat.borders ?? {}).some(
                (b) => b && b.style !== 'none',
              )}
            />
            <BorderTools />
            <ColorTools kind="fill-color" />
            <ColorTools kind="text-color" />
            <ConditionalFormatTools />
            <span className="tool-separator" aria-hidden="true" />
            <TextLayoutTools />
            <ToolButton
              icon="⇤"
              label={t`Decrease indent`}
              onClick={() => void applyFormat('decrease-indent')}
            />
            <ToolButton
              icon="⇥"
              label={t`Increase indent`}
              onClick={() => void applyFormat('increase-indent')}
            />
            <ToolButton
              icon="↵"
              label={t`Wrap text`}
              onClick={() => void applyFormat('wrap-text')}
              pressed={Boolean(activeFormat.wrap)}
            />
            <MergeTools />
            <span className="tool-separator" aria-hidden="true" />
            <ToolButton
              icon=",0"
              label={t`Thousands format`}
              onClick={() => void applyFormat('thousands-format')}
              pressed={
                (activeFormat.numberFormat?.kind === 'number' ||
                  activeFormat.numberFormat?.kind === 'decimal') &&
                activeFormat.numberFormat.thousands === true
              }
            />
            <ToolButton
              icon="%"
              label={t`Percent format`}
              onClick={() => void applyFormat('percent-format')}
              pressed={
                activeFormat.numberFormat?.kind === 'percent' ||
                activeFormat.numberFormat?.kind === 'percentage'
              }
            />
            <ToolButton
              icon="$"
              label={t`Currency format`}
              onClick={() => void applyFormat('currency-format')}
              pressed={activeFormat.numberFormat?.kind === 'currency'}
            />
            <ToolButton
              icon=".0+"
              label={t`Increase decimal places`}
              onClick={() => void applyFormat('increase-decimal')}
            />
            <ToolButton
              icon=".0−"
              label={t`Decrease decimal places`}
              onClick={() => void applyFormat('decrease-decimal')}
            />
            <ToolButton
              icon="123"
              label={t`General format`}
              onClick={() => void applyFormat('general-format')}
              pressed={!activeFormat.numberFormat || activeFormat.numberFormat.kind === 'general'}
            />
            <ToolButton
              icon="▦"
              label={t`Date format`}
              onClick={() => void applyFormat('date-format')}
              pressed={activeFormat.numberFormat?.kind === 'date'}
            />
            <NumberFormatTools />
            <ClearTools />
          </div>
          <div className="ribbon-tool-group" data-inactive={!all && tab !== 'Formulas'}>
            <QuickFormulaTools />
            <InsertFunctionTools />
            <CustomFormulaTools />
            <CalculationTools />
            <SpillTools />
            <NamedRangeTools />
          </div>
          <div className="toolbar-spacer" />
          <div className="ribbon-tool-group" data-inactive={!all && tab !== 'View'}>
            <FindReplaceTools />
            <GoToTools />
            <GoToSpecialTools />
          </div>
        </div>
      </div>
    </div>
  )
}
