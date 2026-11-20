import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { WorkbookRibbonItem } from '@einfach-excel/react-excel'
import { subtotalSelectionAtom } from '@einfach-excel/spreadsheet-ui-core'
import { configureSubtotalAtom } from './core'
import { subtotalLabels } from './messages'

export function SubtotalTools() {
  const { i18n } = useLingui()
  const selection = useAtomValue(subtotalSelectionAtom)
  const configure = useSetAtom(configureSubtotalAtom)
  return <WorkbookRibbonItem id="data.subtotal">
    <button type="button" className="tool-button" data-ribbon-item="data.subtotal"
      disabled={!selection || selection.disabled} aria-haspopup="dialog"
      onClick={() => void configure('open')}>
      {i18n._(subtotalLabels.title)}
    </button>
  </WorkbookRibbonItem>
}
