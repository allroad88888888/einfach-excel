import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { editingSessionAtom, sortFeedbackAtom } from '@einfach-excel/spreadsheet-ui-core'
import { WorkbookRibbonItem } from '@einfach-excel/react-excel'
import { visualSortPanelAtom, configureVisualSortAtom, type VisualSortEntry } from './core/visual-sort'
import { colorLabels } from './color-messages'
import { iconLabels } from './icon-messages'

function VisualSortTools({ entry }: { readonly entry: VisualSortEntry }) {
  const { i18n } = useLingui()
  const editing = useAtomValue(editingSessionAtom).source !== null
  const feedback = useAtomValue(sortFeedbackAtom)
  const panel = useAtomValue(visualSortPanelAtom)
  const configure = useSetAtom(configureVisualSortAtom)
  const id = entry === 'icon' ? 'data.icon-sort' : 'data.color-sort'
  const label = entry === 'icon' ? iconLabels.title : colorLabels.title
  return <WorkbookRibbonItem id={id}>
    <button type="button" className="tool-button" data-ribbon-item={id}
      disabled={editing || feedback.busy || panel.busy} aria-haspopup="dialog"
      onClick={() => void configure(entry === 'icon' ? 'open-icon' : 'open')}>{i18n._(label)}</button>
  </WorkbookRibbonItem>
}

export function ColorSortTools() { return <VisualSortTools entry="color" /> }
export function IconSortTools() { return <VisualSortTools entry="icon" /> }
