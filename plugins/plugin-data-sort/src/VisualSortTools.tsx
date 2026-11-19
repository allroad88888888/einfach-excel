import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { editingSessionAtom, sortFeedbackAtom } from '@einfach-excel/spreadsheet-ui-core'
import { WorkbookRibbonItem } from '@einfach-excel/react-excel'
import { visualSortPanelAtom, configureVisualSortAtom, type VisualSortEntry } from './core/visual-sort'
import { colorLabels } from './color-messages'
import { iconLabels } from './icon-messages'
import { horizontalLabels } from './horizontal-messages'

const entries = {
  color: { id: 'data.color-sort', label: colorLabels.title, action: 'open' },
  icon: { id: 'data.icon-sort', label: iconLabels.title, action: 'open-icon' },
  horizontal: { id: 'data.sort-left-to-right', label: horizontalLabels.title, action: 'open-horizontal' },
} as const

function VisualSortTools({ entry }: { readonly entry: VisualSortEntry }) {
  const { i18n } = useLingui()
  const editing = useAtomValue(editingSessionAtom).source !== null
  const feedback = useAtomValue(sortFeedbackAtom)
  const panel = useAtomValue(visualSortPanelAtom)
  const configure = useSetAtom(configureVisualSortAtom)
  const { id, label, action } = entries[entry]
  return <WorkbookRibbonItem id={id}>
    <button type="button" className="tool-button" data-ribbon-item={id}
      disabled={editing || feedback.busy || panel.busy} aria-haspopup="dialog"
      onClick={() => void configure(action)}>{i18n._(label)}</button>
  </WorkbookRibbonItem>
}

export function ColorSortTools() { return <VisualSortTools entry="color" /> }
export function IconSortTools() { return <VisualSortTools entry="icon" /> }
export function HorizontalSortTools() { return <VisualSortTools entry="horizontal" /> }
