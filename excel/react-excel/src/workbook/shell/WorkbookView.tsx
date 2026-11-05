import { CellContextMenu } from '../shift-cells/CellContextMenu'
import { ShiftCellsDialog } from '../shift-cells/ShiftCellsDialog'
import { EvaluateFormulaDialog, WatchWindowPanel } from '../../components/formula-auditing'
import { FormulaBar } from '../chrome/formula-bar/FormulaBar'
import { WorkbookFooter } from '../chrome/footer/WorkbookFooter'
import { WorkbookHeader } from '../chrome/header/WorkbookHeader'
import { WorkbookRibbon } from '../chrome/ribbon/WorkbookRibbon'
import { WorkbookGrid } from '../grid/viewport/WorkbookGrid'
import './workbook.css'
import '../../style.css'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { runFindReplaceAtom, formatPainterAtom, runFormatPainterAtom,
  runGoToReferenceAtom, viewportShowFormulaBarAtom } from '@einfach-excel/spreadsheet-ui-core'
import { Trans, useLingui } from '@lingui/react/macro'
import { SelectSpecialStatus } from '../select-special/SelectSpecialStatus'
import { useSelectSpecialKeys } from '../select-special/use-select-special-keys'
import { LockedCellDialog } from '../protection/LockedCellDialog'
import { PluginPanels } from '../../plugin/PluginMounts'
import { useWorkbookUiOptions } from '../../page/workbook-ui-options'

/** Composes the shared spreadsheet chrome around the active Rust workbook. */
export function WorkbookView() {
  const { i18n } = useLingui()
  const runFind = useSetAtom(runFindReplaceAtom)
  const runGoTo = useSetAtom(runGoToReferenceAtom)
  const painter = useAtomValue(formatPainterAtom)
  const runPainter = useSetAtom(runFormatPainterAtom)
  const selectSpecialKey = useSelectSpecialKeys()
  const ui = useWorkbookUiOptions()
  const showFormulaBar = useAtomValue(viewportShowFormulaBarAtom) && ui.formulaBar !== false
  return (
    <div
      className="einfach-spreadsheet workbook"
      lang={i18n.locale}
      data-runtime-state="ready"
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape' && !event.nativeEvent.isComposing && painter.mode !== 'idle') {
          event.preventDefault()
          void runPainter('exit')
        }
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return
        if (
          event.target instanceof HTMLElement &&
          event.target.closest('input, textarea, [contenteditable="true"], dialog')
        )
          return
        if (selectSpecialKey(event)) return
        if (event.altKey) return
        const key = event.key.toLowerCase()
        if (!event.shiftKey && ((key === 'f5' && !event.ctrlKey && !event.metaKey) ||
          ((event.ctrlKey || event.metaKey) && key === 'g'))) {
          if (runGoTo('open')) event.preventDefault()
          return
        }
        if (!(event.ctrlKey || event.metaKey)) return
        if (key !== 'f' && key !== 'h') return
        event.preventDefault()
        void runFind({ open: key === 'h' ? 'replace' : 'find' })
      }}
    >
      {ui.header !== false && <WorkbookHeader />}
      <div className="rust-runtime-status" role="status"><Trans>
        Rust/WASM ready
      </Trans></div>
      {ui.ribbon !== false && <WorkbookRibbon />}
      {showFormulaBar && <FormulaBar />}
      <WorkbookGrid />
      <SelectSpecialStatus />
      <WorkbookFooter />
      <CellContextMenu />
      <ShiftCellsDialog />
      <EvaluateFormulaDialog />
      <WatchWindowPanel />
      <LockedCellDialog />
      <PluginPanels />
    </div>
  )
}
