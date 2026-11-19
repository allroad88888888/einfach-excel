import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { WorkbookRibbonItem } from '@einfach-excel/react-excel'
import { consolidateContextAtom } from '@einfach-excel/spreadsheet-ui-core'
import { configureConsolidateAtom } from './core'
import { consolidateLabels } from './messages'

export function ConsolidateTools() {
  const { i18n } = useLingui()
  const context = useAtomValue(consolidateContextAtom)
  const configure = useSetAtom(configureConsolidateAtom)
  return (
    <WorkbookRibbonItem id="data.consolidate">
      <button
        type="button"
        className="tool-button"
        data-ribbon-item="data.consolidate"
        disabled={!context || context.disabled}
        aria-haspopup="dialog"
        onClick={() => void configure('open')}
      >
        {i18n._(consolidateLabels.title)}
      </button>
    </WorkbookRibbonItem>
  )
}
