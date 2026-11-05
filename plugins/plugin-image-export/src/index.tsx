import type { SpreadsheetPlugin } from '@einfach-excel/react-excel'
import { openImageExportAtom } from './core'
import { useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { ImageExportPanel } from './ImageExportPanel'
import { labels, messages } from './messages'

function ImageExportButton() {
  const { i18n } = useLingui()
  const open = useSetAtom(openImageExportAtom)
  return <button type="button" className="tool-button" aria-label={i18n._(labels.title)}
    title={i18n._(labels.title)} onClick={() => void open()}>▧</button>
}

export const imageExportPlugin: SpreadsheetPlugin = {
  id: 'image-export',
  ribbon: [{ id: 'image-export', tab: 'Insert', Group: ImageExportButton }],
  contextMenu: [{ id: 'image-export.open', label: labels.title, command: openImageExportAtom }],
  panels: [ImageExportPanel], messages,
}
