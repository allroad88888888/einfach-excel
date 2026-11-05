import { renderSpreadsheetRangeAsPng } from '@einfach-excel/react-excel'
import type { VisibleProjectionResult } from '@einfach-excel/spreadsheet-ui-core'

export async function downloadImage(
  snapshot: VisibleProjectionResult, scale: number,
): Promise<void> {
  const blob = await renderSpreadsheetRangeAsPng(snapshot, { scale })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'Selection.png'
  document.body.append(link)
  link.click()
  link.remove()
  // Allow the browser to begin reading the URL before releasing the encoded image.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function copyImage(snapshot: VisibleProjectionResult, scale: number): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write)
    throw new Error('Image clipboard is unavailable. Download the PNG instead.')
  // Start the privileged clipboard call within the original user activation, including Safari.
  await navigator.clipboard.write([new ClipboardItem({
    'image/png': renderSpreadsheetRangeAsPng(snapshot, { scale }),
  })])
}
