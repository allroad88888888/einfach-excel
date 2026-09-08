import { useAtomValue, useSetAtom } from '@einfach/react'
import { editingSessionAtom, runSystemClipboardAtom } from '@einfach/spreadsheet-ui-core'
import type { ClipboardEvent } from 'react'
import { clipboardToken, writeBrowserClipboard } from './browser-clipboard'

/** 原生 copy/cut/paste 事件覆盖菜单和键盘；输入框保留浏览器自己的文字剪贴板。 */
export function useGridClipboard(retained: boolean) {
  const editing = useAtomValue(editingSessionAtom).source !== null
  const run = useSetAtom(runSystemClipboardAtom)
  function owns(event: ClipboardEvent<HTMLDivElement>) {
    return (
      !editing &&
      !(
        event.target instanceof HTMLElement &&
        event.target.closest('input, textarea, [contenteditable="true"]')
      )
    )
  }
  const capture = (event: ClipboardEvent<HTMLDivElement>, operation: 'copy' | 'cut') => {
    if (!owns(event)) return
    event.preventDefault()
    if (!retained) void run({ operation, write: writeBrowserClipboard })
  }
  return {
    onCopy: (event: ClipboardEvent<HTMLDivElement>) => capture(event, 'copy'),
    onCut: (event: ClipboardEvent<HTMLDivElement>) => capture(event, 'cut'),
    onPaste: (event: ClipboardEvent<HTMLDivElement>) => {
      if (!owns(event)) return
      event.preventDefault()
      if (retained || !event.clipboardData.types.includes('text/plain')) return
      // DataTransfer 仅在本次浏览器事件内可读，先取文本再交给异步命令。
      const text = event.clipboardData.getData('text/plain')
      const token = clipboardToken(event.clipboardData.getData('text/html'))
      void run({ operation: 'paste', read: async () => ({ text, token }) })
    },
  }
}
