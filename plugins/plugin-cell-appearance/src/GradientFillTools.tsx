import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { WorkbookRibbonItem } from '@einfach-excel/react-excel'
import { editingSessionAtom, selectionMutationFeedbackAtom } from '@einfach-excel/spreadsheet-ui-core'
import { configureGradientFillAtom, gradientFillPanelAtom } from './core'
import { labels } from './messages'

export function GradientFillTools() {
  const { i18n } = useLingui()
  const editing = useAtomValue(editingSessionAtom).source !== null
  const feedback = useAtomValue(selectionMutationFeedbackAtom)
  const panel = useAtomValue(gradientFillPanelAtom)
  const configure = useSetAtom(configureGradientFillAtom)
  return <WorkbookRibbonItem id="format.gradient-fill">
    <button type="button" className="tool-button" data-ribbon-item="format.gradient-fill"
      disabled={editing || feedback.busy || panel.busy} aria-haspopup="dialog"
      onClick={() => void configure('open')}>{i18n._(labels.gradientTitle)}</button>
  </WorkbookRibbonItem>
}
