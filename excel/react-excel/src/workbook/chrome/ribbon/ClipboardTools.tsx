import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  editingSessionAtom,
  runSystemClipboardAtom,
  systemClipboardFeedbackAtom,
} from '@einfach/spreadsheet-ui-core'
import {
  readBrowserClipboard,
  writeBrowserClipboard,
  writeBrowserClipboardExport,
} from '../../clipboard/browser-clipboard'
import { PasteSpecialTools } from './PasteSpecialTools'

const COPY_FORMATS = [
  { value: 'text', label: msg`Copy as plain text` },
  { value: 'markdown', label: msg`Copy as Markdown` },
  { value: 'html', label: msg`Copy as HTML table` },
] as const

const PASTE_OPTIONS = [
  { value: 'add', label: msg`Paste and add`, paste: { arithmetic: 'add' } },
  { value: 'subtract', label: msg`Paste and subtract`, paste: { arithmetic: 'subtract' } },
  { value: 'multiply', label: msg`Paste and multiply`, paste: { arithmetic: 'multiply' } },
  { value: 'divide', label: msg`Paste and divide`, paste: { arithmetic: 'divide' } },
  { value: 'column-widths', label: msg`Paste column widths only`, paste: { mode: 'column-widths' } },
  { value: 'transpose', label: msg`Paste transposed`, paste: { transpose: true } },
  { value: 'skip-blanks', label: msg`Paste skipping blanks`, paste: { skipBlanks: true } },
  {
    value: 'values-formats',
    label: msg`Paste values and formatting`,
    paste: { mode: 'values-formats' },
  },
  { value: 'formulas', label: msg`Paste formulas only`, paste: { mode: 'formulas' } },
  {
    value: 'formulas-number-formats',
    label: msg`Paste formulas and number formats`,
    paste: { mode: 'formulas-number-formats' },
  },
  {
    value: 'values-number-formats',
    label: msg`Paste values and number formats`,
    paste: { mode: 'values-number-formats' },
  },
] as const

/** 剪贴板入口只转发浏览器 I/O；下拉选择是一次命令，不保存另一份粘贴状态。 */
export function ClipboardTools() {
  const { i18n, t } = useLingui()
  const run = useSetAtom(runSystemClipboardAtom)
  const feedback = useAtomValue(systemClipboardFeedbackAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  return (
    <>
      {(['paste', 'cut', 'copy'] as const).map((operation) => (
        <button
          className="tool-button"
          type="button"
          key={operation}
          aria-label={{ paste: t`Paste`, cut: t`Cut`, copy: t`Copy` }[operation]}
          title={
            { paste: t`Paste (Ctrl/⌘+V)`, cut: t`Cut (Ctrl/⌘+X)`, copy: t`Copy (Ctrl/⌘+C)` }[operation]
          }
          disabled={feedback.busy || editing}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() =>
            void run(
              operation === 'paste'
                ? { operation, read: readBrowserClipboard }
                : { operation, write: writeBrowserClipboard },
            )
          }
        >
          <span aria-hidden="true">{{ paste: '▣', cut: '✂', copy: '▤' }[operation]}</span>
        </button>
      ))}
      {(['values', 'formats'] as const).map((mode) => (
        <button
          className="tool-button"
          type="button"
          key={mode}
          aria-label={mode === 'values' ? t`Paste values only` : t`Paste formatting only`}
          title={mode === 'values' ? t`Paste values only` : t`Paste formatting only`}
          disabled={feedback.busy || editing}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => void run({ operation: 'paste', mode, read: readBrowserClipboard })}
        >
          <span aria-hidden="true">{mode === 'values' ? '123' : 'A▧'}</span>
        </button>
      ))}
      <select
        className="tool-select paste-options-select"
        aria-label={t`More paste options`}
        title={t`More paste options`}
        defaultValue=""
        disabled={feedback.busy || editing}
        onChange={(event) => {
          const option = PASTE_OPTIONS.find(({ value }) => value === event.currentTarget.value)
          event.currentTarget.value = ''
          if (option) void run({ ...option.paste, operation: 'paste', read: readBrowserClipboard })
        }}
      >
        <option value="" disabled><Trans>
          Paste options
        </Trans></option>
        {PASTE_OPTIONS.map(({ value, label }) => (
          <option key={value} value={value}>
            {i18n._(label)}
          </option>
        ))}
      </select>
      <PasteSpecialTools />
      <select
        className="tool-select copy-as-select"
        aria-label={t`Copy as`}
        title={t`Copy as`}
        defaultValue=""
        disabled={feedback.busy || editing}
        onChange={(event) => {
          const format = COPY_FORMATS.find(
            ({ value }) => value === event.currentTarget.value,
          )?.value
          event.currentTarget.value = ''
          if (format)
            void run({
              operation: 'copy-as',
              format,
              write: (data) => writeBrowserClipboardExport(format, data),
            })
        }}
      >
        <option value="" disabled><Trans>
          Copy as
        </Trans></option>
        {COPY_FORMATS.map(({ value, label }) => (
          <option key={value} value={value}>
            {i18n._(label)}
          </option>
        ))}
      </select>
    </>
  )
}
