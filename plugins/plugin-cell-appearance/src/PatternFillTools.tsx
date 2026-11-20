import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { WorkbookRibbonItem } from '@einfach-excel/react-excel'
import { editingSessionAtom, selectionMutationFeedbackAtom } from '@einfach-excel/spreadsheet-ui-core'
import { configurePatternFillAtom, patternFillPanelAtom } from './core'
import { labels } from './messages'

export function PatternFillTools() {
  const { i18n } = useLingui()
  const editing = useAtomValue(editingSessionAtom).source !== null
  const feedback = useAtomValue(selectionMutationFeedbackAtom)
  const panel = useAtomValue(patternFillPanelAtom)
  const configure = useSetAtom(configurePatternFillAtom)
  return <WorkbookRibbonItem id="format.pattern-fill">
    <button type="button" className="tool-button" data-ribbon-item="format.pattern-fill"
      disabled={editing || feedback.busy || panel.busy} aria-haspopup="dialog"
      onClick={() => void configure('open')}>{i18n._(labels.patternTitle)}</button>
  </WorkbookRibbonItem>
}
