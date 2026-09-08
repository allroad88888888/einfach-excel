import type { RustClipboardCapture, SystemClipboardData } from '@einfach/spreadsheet-ui-core'

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** HTML 只携带快照身份和可读文本，不把公式/样式快照放入浏览器状态。 */
export function clipboardToken(html: string): string | undefined {
  return /data-einfach-clipboard=["']([a-f0-9-]{36})["']/i.exec(html)?.[1]
}

export async function writeBrowserClipboard(data: Promise<RustClipboardCapture>): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error(
      'This browser cannot write the clipboard. Use a secure HTTPS or localhost page.',
    )
  }
  const plain = data.then(({ text }) => new Blob([text], { type: 'text/plain' }))
  const html = data.then(
    ({ text, token }) =>
      new Blob([`<pre data-einfach-clipboard="${escapeHtml(token)}">${escapeHtml(text)}</pre>`], {
        type: 'text/html',
      }),
  )
  // ClipboardItem 支持 Promise<Blob>：在用户事件里启动写入，不先等待 Worker。
  // https://developer.mozilla.org/en-US/docs/Web/API/ClipboardItem/ClipboardItem
  try {
    await Promise.all([
      navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': plain,
          'text/html': html,
        }),
      ]),
      plain,
      html,
    ])
  } catch (error) {
    await Promise.allSettled([plain, html])
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      throw new Error('Clipboard permission was denied. Allow clipboard access and try again.')
    }
    throw error
  }
}

export async function readBrowserClipboard(): Promise<SystemClipboardData> {
  if (!navigator.clipboard?.read) {
    throw new Error('Use Ctrl/⌘+V in the grid to paste from the clipboard.')
  }
  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      if (!item.types.includes('text/plain')) continue
      const text = await (await item.getType('text/plain')).text()
      const html = item.types.includes('text/html')
        ? await (await item.getType('text/html')).text()
        : ''
      return { text, token: clipboardToken(html) }
    }
    throw new Error('The clipboard does not contain cell text.')
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      throw new Error('Clipboard permission was denied. Use Ctrl/⌘+V in the grid.')
    }
    throw error
  }
}
