import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { WorkbookRibbonItem } from '@einfach-excel/react-excel'
import { nativeFilterFeedbackAtom, worksheetCriteriaContextAtom } from '@einfach-excel/spreadsheet-ui-core'
import { configureWorksheetCriteriaAtom, worksheetCriteriaPanelAtom } from './core/worksheet-criteria'
import { criteriaLabels } from './worksheet-criteria-messages'

export function WorksheetCriteriaTools() {
  const { i18n } = useLingui()
  const context = useAtomValue(worksheetCriteriaContextAtom)
  const panel = useAtomValue(worksheetCriteriaPanelAtom)
  const feedback = useAtomValue(nativeFilterFeedbackAtom)
  const configure = useSetAtom(configureWorksheetCriteriaAtom)
  return <WorkbookRibbonItem id="data.advanced-filter-range">
    <button type="button" className="tool-button" data-ribbon-item="data.advanced-filter-range"
      disabled={!context || context.editing || Boolean(panel?.busy) || feedback.busy}
      aria-haspopup="dialog" onClick={() => void configure('open')}>
      {i18n._(criteriaLabels.title)}
    </button>
  </WorkbookRibbonItem>
}
