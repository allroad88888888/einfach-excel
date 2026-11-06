import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react/macro'
import { richTextPanelAtom, runRichTextAtom } from '@einfach-excel/spreadsheet-ui-core'
import { RibbonItem } from '../chrome/ribbon/RibbonItem'

export function RichTextTools() {
  const { t } = useLingui()
  const state = useAtomValue(richTextPanelAtom),
    run = useSetAtom(runRichTextAtom)
  return (
    <RibbonItem id="format.rich-text">
      <button
        type="button"
        className="tool-button"
        data-ribbon-item="format.rich-text"
        aria-label={t`Rich text`}
        title={t`Rich text`}
        disabled={!state.available || state.busy}
        onClick={() => void run('open')}
      >
        <span aria-hidden="true">Aᵇ</span>
      </button>
    </RibbonItem>
  )
}
