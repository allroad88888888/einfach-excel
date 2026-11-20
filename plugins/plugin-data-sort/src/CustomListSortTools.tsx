import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { editingSessionAtom, sortFeedbackAtom } from '@einfach-excel/spreadsheet-ui-core'
import { WorkbookRibbonItem } from '@einfach-excel/react-excel'
import { configureCustomListSortAtom, customListSortPanelAtom } from './core'
import { labels } from './messages'

export function CustomListSortTools() {
  const { i18n } = useLingui()
  const editing = useAtomValue(editingSessionAtom).source !== null
  const feedback = useAtomValue(sortFeedbackAtom)
  const panel = useAtomValue(customListSortPanelAtom)
  const configure = useSetAtom(configureCustomListSortAtom)
  return <WorkbookRibbonItem id="data.custom-list-sort">
    <button type="button" className="tool-button" data-ribbon-item="data.custom-list-sort"
      disabled={editing || feedback.busy || panel.busy} aria-haspopup="dialog"
      onClick={() => void configure('open')}>
      {i18n._(labels.title)}
    </button>
  </WorkbookRibbonItem>
}
