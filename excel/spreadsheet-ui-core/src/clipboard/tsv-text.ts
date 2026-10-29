import type { ClipboardTextData } from './types'

export const CLIPBOARD_ORIGIN_MARKER_PREFIX = '# einfach-clipboard-origin: '

export function serializeClipboardTsv(data: ClipboardTextData): string {
  const body = data.cells.map((row) => row.join('\t')).join('\n')
  return `${CLIPBOARD_ORIGIN_MARKER_PREFIX}${data.originAddr}\n${body}`
}

export function parseClipboardTsv(text: string, fallbackOrigin: string): ClipboardTextData {
  const normalized = text.replace(/\r\n?/g, '\n')
  let originAddr = fallbackOrigin
  let body = normalized

  if (normalized.startsWith(CLIPBOARD_ORIGIN_MARKER_PREFIX)) {
    const newlineIndex = normalized.indexOf('\n')
    const markerLine = newlineIndex === -1 ? normalized : normalized.slice(0, newlineIndex)
    originAddr = markerLine.slice(CLIPBOARD_ORIGIN_MARKER_PREFIX.length).trim() || fallbackOrigin
    body = newlineIndex === -1 ? '' : normalized.slice(newlineIndex + 1)
  }

  if (body.endsWith('\n')) body = body.slice(0, -1)

  return {
    originAddr,
    cells: body === '' ? [['']] : body.split('\n').map((row) => row.split('\t')),
  }
}
