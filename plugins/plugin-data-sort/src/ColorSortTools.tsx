import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { editingSessionAtom, sortFeedbackAtom } from '@einfach-excel/spreadsheet-ui-core'
import { WorkbookRibbonItem } from '@einfach-excel/react-excel'
import { colorSortPanelAtom, configureColorSortAtom } from './core/color-sort'
import { colorLabels } from './color-messages'

export function ColorSortTools() {
  const { i18n } = useLingui()
  const editing = useAtomValue(editingSessionAtom).source !== null
  const feedback = useAtomValue(sortFeedbackAtom)
  const panel = useAtomValue(colorSortPanelAtom)
  const configure = useSetAtom(configureColorSortAtom)
  return <WorkbookRibbonItem id="data.color-sort">
    <button type="button" className="tool-button" data-ribbon-item="data.color-sort"
      disabled={editing || feedback.busy || panel.busy} aria-haspopup="dialog"
      onClick={() => void configure('open')}>{i18n._(colorLabels.title)}</button>
  </WorkbookRibbonItem>
}
