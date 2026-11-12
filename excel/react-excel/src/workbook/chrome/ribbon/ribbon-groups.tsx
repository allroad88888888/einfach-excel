import type { WorkbookRibbonTab } from '@einfach-excel/spreadsheet-ui-core'
import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import type { ComponentType } from 'react'
import { ClipboardTools } from './ClipboardTools'
import { FormatPainterTools } from './FormatPainterTools'
import { FontTools } from './FontTools'
import { AlignmentTools } from './AlignmentTools'
import { NumberTools } from './NumberTools'
import { ConditionalFormatTools } from './ConditionalFormatTools'
import { AlternatingColorsTools } from './AlternatingColorsTools'
import { ClearTools } from './ClearTools'
import { StructureTools } from './StructureTools'
import { TableTools } from './TableTools'
import { HyperlinkTools } from '../../hyperlink/HyperlinkTools'
import { NoteTools } from '../../notes/NoteTools'
import { CommentTools } from '../../comments/CommentTools'
import { QuickFormulaTools } from './QuickFormulaTools'
import { InsertFunctionTools } from './InsertFunctionTools'
import { CustomFormulaTools } from '../../custom-formulas/CustomFormulaTools'
import { CalculationTools } from './CalculationTools'
import { SpillTools } from './SpillTools'
import { FormulaAuditingToolbar } from '../../../components/formula-auditing'
import { NamedRangeTools } from './NamedRangeTools'
import { FillTools } from './FillTools'
import { FillSeriesTools } from './FillSeriesTools'
import { SortTools } from './SortTools'
import { FilterTools } from './FilterTools'
import { TextColumnsTools } from './TextColumnsTools'
import { RemoveDuplicatesTools } from './RemoveDuplicatesTools'
import { DataValidationTools } from './DataValidationTools'
import { ProtectionTools } from '../../protection/ProtectionTools'
import { VisibilityTools } from './VisibilityTools'
import { OutlineTools } from './OutlineTools'
import { FreezeTools } from './FreezeTools'
import { SelectionSizeTools } from './SelectionSizeTools'
import { ViewOptionsTools } from './ViewOptionsTools'
import { FindReplaceTools } from './FindReplaceTools'
import { GoToTools } from './GoToTools'
import { GoToSpecialTools } from './GoToSpecialTools'

/**
 * 功能区的一组工具（对应 Univer ribbon 的 group）。
 * stack：入口按顺序两两上下叠放，大按钮跨两行；rows：组件自己给出上下两行。
 */
export interface WorkbookRibbonGroup {
  readonly id: string
  readonly tab: WorkbookRibbonTab
  readonly title?: MessageDescriptor
  readonly layout: 'stack' | 'rows'
  readonly Content: ComponentType
  readonly plugin?: string
}

const group = (
  id: string,
  tab: WorkbookRibbonTab,
  title: MessageDescriptor,
  Content: ComponentType,
  layout: WorkbookRibbonGroup['layout'] = 'stack',
): WorkbookRibbonGroup => ({ id, tab, title, layout, Content })

const tools = (...parts: readonly ComponentType[]) => {
  function GroupTools() {
    return <>{parts.map((Part, index) => <Part key={index} />)}</>
  }
  return GroupTools
}

/** 内置分组：顺序即显示顺序，也是窄屏时从末尾收进“更多”的顺序。 */
export const BUILT_IN_RIBBON_GROUPS: readonly WorkbookRibbonGroup[] = [
  group('clipboard', 'Start', msg`Clipboard`, tools(ClipboardTools, FormatPainterTools)),
  group('font', 'Start', msg`Font`, FontTools, 'rows'),
  group('alignment', 'Start', msg`Alignment`, AlignmentTools, 'rows'),
  group('number', 'Start', msg`Number`, NumberTools, 'rows'),
  group('styles', 'Start', msg`Styles`, tools(ConditionalFormatTools, AlternatingColorsTools, ClearTools)),
  group('cells', 'Insert', msg`Cells`, StructureTools),
  group('tables', 'Insert', msg`Tables`, TableTools),
  group('annotations', 'Insert', msg`Links and notes`, tools(HyperlinkTools, NoteTools, CommentTools)),
  group('functions', 'Formulas', msg`Functions`,
    tools(QuickFormulaTools, InsertFunctionTools, CustomFormulaTools)),
  group('calculation', 'Formulas', msg`Calculation`, CalculationTools),
  group('auditing', 'Formulas', msg`Formula auditing`, tools(SpillTools, FormulaAuditingToolbar)),
  group('names', 'Formulas', msg`Defined names`, NamedRangeTools),
  group('fill', 'Data', msg`Fill`, tools(FillTools, FillSeriesTools)),
  group('sort-filter', 'Data', msg`Sort and filter`, tools(SortTools, FilterTools)),
  group('data-tools', 'Data', msg`Data tools`,
    tools(TextColumnsTools, RemoveDuplicatesTools, DataValidationTools)),
  group('protection', 'Data', msg`Protect`, ProtectionTools),
  group('rows-columns', 'View', msg`Rows and columns`,
    tools(VisibilityTools, OutlineTools, FreezeTools, SelectionSizeTools)),
  group('show', 'View', msg`Show`, ViewOptionsTools),
  group('find', 'View', msg`Find`, tools(FindReplaceTools, GoToTools, GoToSpecialTools)),
]
