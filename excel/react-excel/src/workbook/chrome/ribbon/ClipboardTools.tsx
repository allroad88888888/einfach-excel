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

const COPY_FORMATS = [
  { value: 'text', label: 'Copy as plain text' },
  { value: 'markdown', label: 'Copy as Markdown' },
  { value: 'html', label: 'Copy as HTML table' },
] as const

const PASTE_OPTIONS = [
  { value: 'transpose', label: 'Paste transposed', paste: { transpose: true } },
  { value: 'skip-blanks', label: 'Paste skipping blanks', paste: { skipBlanks: true } },
  {
    value: 'values-formats',
    label: 'Paste values and formatting',
    paste: { mode: 'values-formats' },
  },
  { value: 'formulas', label: 'Paste formulas only', paste: { mode: 'formulas' } },
  {
    value: 'formulas-number-formats',
    label: 'Paste formulas and number formats',
    paste: { mode: 'formulas-number-formats' },
  },
  {
    value: 'values-number-formats',
    label: 'Paste values and number formats',
    paste: { mode: 'values-number-formats' },
  },
] as const

/** 剪贴板入口只转发浏览器 I/O；下拉选择是一次命令，不保存另一份粘贴状态。 */
export function ClipboardTools() {
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
          aria-label={{ paste: 'Paste', cut: 'Cut', copy: 'Copy' }[operation]}
          title={
            { paste: 'Paste (Ctrl/⌘+V)', cut: 'Cut (Ctrl/⌘+X)', copy: 'Copy (Ctrl/⌘+C)' }[operation]
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
          aria-label={mode === 'values' ? 'Paste values only' : 'Paste formatting only'}
          title={mode === 'values' ? 'Paste values only' : 'Paste formatting only'}
          disabled={feedback.busy || editing}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => void run({ operation: 'paste', mode, read: readBrowserClipboard })}
        >
          <span aria-hidden="true">{mode === 'values' ? '123' : 'A▧'}</span>
        </button>
      ))}
      <select
        className="tool-select paste-options-select"
        aria-label="More paste options"
        title="More paste options"
        defaultValue=""
        disabled={feedback.busy || editing}
        onChange={(event) => {
          const option = PASTE_OPTIONS.find(({ value }) => value === event.currentTarget.value)
          event.currentTarget.value = ''
          if (option) void run({ ...option.paste, operation: 'paste', read: readBrowserClipboard })
        }}
      >
        <option value="" disabled>
          Paste options
        </option>
        {PASTE_OPTIONS.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <select
        className="tool-select copy-as-select"
        aria-label="Copy as"
        title="Copy as"
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
        <option value="" disabled>
          Copy as
        </option>
        {COPY_FORMATS.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </>
  )
}
