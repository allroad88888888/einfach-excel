/**
 * Browser clipboard boundary for spreadsheet transfers.
 *
 * Clipboard permissions and MIME support belong to the browser, not to the
 * spreadsheet's product state. Callers keep progress and errors in UI-core
 * atoms; this module only negotiates the available Web Clipboard API tier.
 */

export type ClipboardWriteOutcome = 'rich' | 'plain' | 'legacy' | null

export interface BrowserClipboardWrite {
  readonly plainText: string
  readonly html?: string
}

interface ClipboardItemLike {
  readonly types: readonly string[]
  getType(type: string): Promise<Blob>
}

interface ClipboardApiLike {
  read?: () => Promise<readonly ClipboardItemLike[]>
  readText?: () => Promise<string>
  write?: (items: readonly ClipboardItemLike[]) => Promise<void>
  writeText?: (text: string) => Promise<void>
}

type ClipboardItemConstructor = new (items: Record<string, Blob>) => ClipboardItemLike

function getBrowserClipboard(): ClipboardApiLike | undefined {
  if (typeof navigator === 'undefined') return undefined
  return navigator.clipboard as unknown as ClipboardApiLike | undefined
}

function getClipboardItemConstructor(): ClipboardItemConstructor | undefined {
  return (globalThis as typeof globalThis & { ClipboardItem?: ClipboardItemConstructor })
    .ClipboardItem
}

function copyWithTemporaryTextarea(text: string): boolean {
  if (
    typeof document === 'undefined' ||
    !document.body ||
    typeof document.execCommand !== 'function'
  ) {
    return false
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0'
  document.body.append(textarea)
  textarea.select()

  try {
    return document.execCommand('copy')
  } finally {
    textarea.remove()
  }
}

/**
 * Prefer HTML + text/plain so native spreadsheet and document targets retain
 * table shape and display formatting. Plain text remains the compatibility
 * tier for browsers without ClipboardItem support.
 */
export async function writeBrowserClipboard(
  data: BrowserClipboardWrite,
): Promise<ClipboardWriteOutcome> {
  const clipboard = getBrowserClipboard()
  const ClipboardItem = getClipboardItemConstructor()

  if (data.html && clipboard?.write && ClipboardItem) {
    try {
      const item = new ClipboardItem({
        'text/html': new Blob([data.html], { type: 'text/html' }),
        'text/plain': new Blob([data.plainText], { type: 'text/plain' }),
      })
      await clipboard.write([item])
      return 'rich'
    } catch {
      // A browser may reject ClipboardItem or HTML even when it exposes both.
      // Fall through to the universally available text transport.
    }
  }

  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(data.plainText)
      return 'plain'
    } catch {
      // Legacy copy can still work in an otherwise restricted secure context.
    }
  }

  return copyWithTemporaryTextarea(data.plainText) ? 'legacy' : null
}

function normalizeTableCellText(text: string): string {
  return text.replace(/\r\n?|\n/g, ' ').replace(/\t/g, ' ')
}

function readTableCellText(cell: HTMLTableCellElement): string {
  const copy = cell.cloneNode(true) as HTMLTableCellElement
  for (const lineBreak of Array.from(copy.querySelectorAll('br'))) {
    lineBreak.replaceWith('\n')
  }
  return normalizeTableCellText(copy.textContent ?? '')
}

function span(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(10_000, Math.floor(value))) : 1
}

/**
 * Convert a safe, inertly parsed clipboard table into TSV. It deliberately
 * reads textContent only: markup, styles, and links from foreign clipboards
 * never become executable or are copied into workbook cell input.
 */
export function clipboardHtmlTableToTsv(html: string): string | null {
  if (typeof DOMParser === 'undefined') return null
  const table = new DOMParser().parseFromString(html, 'text/html').querySelector('table')
  if (!table) return null

  const matrix: string[][] = []
  const rows = Array.from(table.rows)
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    let colIndex = 0
    matrix[rowIndex] ??= []

    for (const cell of Array.from(row.cells)) {
      while (matrix[rowIndex][colIndex] !== undefined) colIndex += 1
      const rowSpan = span(cell.rowSpan)
      const colSpan = span(cell.colSpan)
      const value = readTableCellText(cell)

      for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
        const targetRow = matrix[rowIndex + rowOffset] ?? (matrix[rowIndex + rowOffset] = [])
        for (let colOffset = 0; colOffset < colSpan; colOffset += 1) {
          targetRow[colIndex + colOffset] = rowOffset === 0 && colOffset === 0 ? value : ''
        }
      }
      colIndex += colSpan
    }
  }

  const width = matrix.reduce((max, row) => Math.max(max, row.length), 0)
  if (matrix.length === 0 || width === 0) return null
  return matrix
    .map((row) => Array.from({ length: width }, (_, col) => row[col] ?? '').join('\t'))
    .join('\n')
}

async function readItemText(item: ClipboardItemLike, type: string): Promise<string | null> {
  if (!item.types.includes(type)) return null
  try {
    return await (await item.getType(type)).text()
  } catch {
    return null
  }
}

/**
 * Read plain TSV first to preserve the workbook's formula-origin marker.
 * Rich external sources without text/plain still paste through their HTML
 * table, rather than failing solely because the browser supplied HTML.
 */
export async function readBrowserClipboardText(): Promise<string | null> {
  const clipboard = getBrowserClipboard()
  if (!clipboard) return null

  if (clipboard.read) {
    try {
      const items = await clipboard.read()
      let emptyPlainText: string | null = null
      let html: string | null = null
      for (const item of items) {
        const plainText = await readItemText(item, 'text/plain')
        if (plainText !== null) {
          if (plainText.length > 0) return plainText
          emptyPlainText = plainText
        }
        html ??= await readItemText(item, 'text/html')
      }
      if (html !== null) {
        const tsv = clipboardHtmlTableToTsv(html)
        if (tsv !== null) return tsv
      }
      if (emptyPlainText !== null) return emptyPlainText
    } catch {
      // `readText` can be separately permitted on browsers that reject read().
    }
  }

  if (!clipboard.readText) return null
  try {
    return await clipboard.readText()
  } catch {
    return null
  }
}
