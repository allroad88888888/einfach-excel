import type {
  RustClipboardCapture,
  RustClipboardExport,
  RustClipboardExportFormat,
  SystemClipboardData,
} from '@einfach/spreadsheet-ui-core'

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

export function writeBrowserClipboard(data: Promise<RustClipboardCapture>): Promise<void> {
  const plain = data.then(({ text }) => new Blob([text], { type: 'text/plain' }))
  const html = data.then(
    ({ text, token }) =>
      new Blob([`<pre data-einfach-clipboard="${escapeHtml(token)}">${escapeHtml(text)}</pre>`], {
        type: 'text/html',
      }),
  )
  return writeClipboardItems({ 'text/plain': plain, 'text/html': html })
}

/** Copy As 不携带内部 token；粘回表格时不会意外恢复源公式或消费剪切。 */
export function writeBrowserClipboardExport(
  format: RustClipboardExportFormat,
  data: Promise<RustClipboardExport>,
): Promise<void> {
  return writeClipboardItems({
    'text/plain': data.then(({ text }) => new Blob([text], { type: 'text/plain' })),
    ...(format === 'html'
      ? {
          'text/html': data.then(({ html }) => {
            if (html === undefined) throw new Error('The workbook did not return an HTML table.')
            return new Blob([html], { type: 'text/html' })
          }),
        }
      : {}),
  })
}

/** 标量统计只写原始纯文本，不携带单元格 token 或 HTML。 */
export function writeBrowserClipboardText(text: Promise<string>): Promise<void> {
  return writeClipboardItems({
    'text/plain': text.then((value) => new Blob([value], { type: 'text/plain' })),
  })
}

async function writeClipboardItems(payload: Record<string, Promise<Blob>>): Promise<void> {
  const parts = Object.values(payload)
  // ClipboardItem 支持 Promise<Blob>：在用户事件里启动写入，不先等待 Worker。
  // https://developer.mozilla.org/en-US/docs/Web/API/ClipboardItem/ClipboardItem
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      throw new Error(
        'This browser cannot write the clipboard. Use a secure HTTPS or localhost page.',
      )
    }
    await Promise.all([navigator.clipboard.write([new ClipboardItem(payload)]), ...parts])
  } catch (error) {
    await Promise.allSettled(parts)
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
