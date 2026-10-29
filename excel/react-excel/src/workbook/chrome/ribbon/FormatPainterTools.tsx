import { translateFeedback } from '../../../i18n/translate-feedback'
import { useLingui } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { editingSessionAtom, formatPainterAtom, runFormatPainterAtom } from '@einfach-excel/spreadsheet-ui-core'

/** 单击刷一次、双击连续刷；按钮不读取或传递任何单元格格式。 */
export function FormatPainterTools() {
  const { i18n, t } = useLingui()
  const painter = useAtomValue(formatPainterAtom)
  const run = useSetAtom(runFormatPainterAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  return (
    <>
      <button type="button" className="tool-button" aria-label={t`Format painter`}
        title={t`Format painter: click once, double-click to keep painting. Esc to stop.`}
        aria-pressed={painter.mode !== 'idle'} aria-busy={painter.busy}
        data-painter-mode={painter.mode} disabled={editing}
        onPointerDown={(event) => event.preventDefault()}
        onClick={(event) => {
          if (event.detail < 2) void run(painter.mode === 'idle' ? 'arm' : 'exit')
        }}
        onDoubleClick={() => void run('sticky')}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"
          stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="9" height="4" rx="1" />
          <path d="M11 4h2v5H7v4" /><rect x="6" y="11" width="2" height="3" rx=".5" />
        </svg>
      </button>
      {painter.message && <span className="fill-feedback" aria-label={t`Format painter status`}
        role={painter.error ? 'alert' : 'status'}>{translateFeedback(i18n, painter.message)}</span>}
    </>
  )
}
