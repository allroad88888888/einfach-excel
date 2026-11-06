import { CellFormatTools } from './CellFormatTools'
import {
  workbookRibbonTabAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { ClipboardTools } from './ClipboardTools'
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
import { FreezeTools } from './FreezeTools'
import { ViewOptionsTools } from './ViewOptionsTools'
import { FindReplaceTools } from './FindReplaceTools'
import { GoToTools } from './GoToTools'
import { GoToSpecialTools } from './GoToSpecialTools'
import { QuickFormulaTools } from './QuickFormulaTools'
import { InsertFunctionTools } from './InsertFunctionTools'
import { CalculationTools } from './CalculationTools'
import { SpillTools } from './SpillTools'
import { NamedRangeTools } from './NamedRangeTools'
import { TableTools } from './TableTools'
import { DataValidationTools } from './DataValidationTools'
import { HyperlinkTools } from '../../hyperlink/HyperlinkTools'
import { NoteTools } from '../../notes/NoteTools'
import { CommentTools } from '../../comments/CommentTools'
import { ProtectionTools } from '../../protection/ProtectionTools'
import { CustomFormulaTools } from '../../custom-formulas/CustomFormulaTools'
import { FormulaAuditingToolbar } from '../../../components/formula-auditing'
import { PluginRibbonGroups } from '../../../plugin/PluginMounts'
import { useAtomValue } from '@einfach/react'
import { useId, useLayoutEffect, useRef } from 'react'
import { RibbonTabs, ribbonTabLabels } from './RibbonTabs'
import { useLingui } from '@lingui/react/macro'
import './ribbon.css'

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
            <ViewOptionsTools />
          </div>
          <div className="ribbon-tool-group" data-inactive={!all && tab !== 'Insert'}>
            <StructureTools />
            <TableTools />
            <HyperlinkTools />
            <NoteTools />
            <CommentTools />
          </div>
          <div className="ribbon-tool-group" data-inactive={!all}>
            <CellFormatTools />
          </div>
          <div className="ribbon-tool-group" data-inactive={!all && tab !== 'Formulas'}>
            <QuickFormulaTools />
            <InsertFunctionTools />
            <CustomFormulaTools />
            <CalculationTools />
            <SpillTools />
            <FormulaAuditingToolbar />
            <NamedRangeTools />
          </div>
          <PluginRibbonGroups tab={tab} />
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
