import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  editingSessionAtom,
  runSystemClipboardAtom,
  systemClipboardFeedbackAtom,
} from '@einfach/spreadsheet-ui-core'
import { readBrowserClipboard, writeBrowserClipboard } from '../../clipboard/browser-clipboard'

/** 工具栏现有的三个剪贴板按钮，只转发浏览器 I/O。 */
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
    </>
  )
}
