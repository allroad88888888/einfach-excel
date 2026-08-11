import type { CopyAsResult, CopyAsTextResult } from '@einfach/spreadsheet-ui-core'

export type TextClipboardWriteResult = 'rich-triple' | 'rich-no-markdown' | 'plain-text' | null

/**
 * Write text copy-as payloads through progressively compatible browser APIs.
 * Clipboard availability is deliberately not state: callers project the
 * outcome into the session Atom contract after this adapter returns.
 */
export async function writeTextCopyAsToClipboard(
  encoded: CopyAsTextResult,
): Promise<TextClipboardWriteResult> {
  const g = globalThis as { ClipboardItem?: typeof ClipboardItem }
  const canWriteItems =
    typeof g.ClipboardItem !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.clipboard?.write)

  if (canWriteItems) {
    try {
      const item = new g.ClipboardItem!({
        'text/html': new Blob([encoded.html], { type: 'text/html' }),
        'text/plain': new Blob([encoded.plainText], { type: 'text/plain' }),
        'text/markdown': new Blob([encoded.markdown], { type: 'text/markdown' }),
      })
      await navigator.clipboard.write([item])
      return 'rich-triple'
    } catch {
      // `text/markdown` is rejected by several browser implementations.
    }

    try {
      const item = new g.ClipboardItem!({
        'text/html': new Blob([encoded.html], { type: 'text/html' }),
        'text/plain': new Blob([encoded.plainText], { type: 'text/plain' }),
      })
      await navigator.clipboard.write([item])
      return 'rich-no-markdown'
    } catch {
      // Fall through to the universally supported plain-text API.
    }
  }

  return (await writePlainTextToClipboard(encoded.plainText)) ? 'plain-text' : null
}

/** Write a plain TSV payload when rich clipboard MIME types are unavailable. */
export async function writePlainTextToClipboard(plainText: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false
  try {
    await navigator.clipboard.writeText(plainText)
    return true
  } catch {
    return false
  }
}

/** Try the browser image clipboard path without storing browser state locally. */
export async function writeImageCopyAsToClipboard(
  blob: Blob,
): Promise<'system-clipboard' | 'atom-only'> {
  const g = globalThis as { ClipboardItem?: typeof ClipboardItem }
  const canWriteItems =
    typeof g.ClipboardItem !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.clipboard?.write)
  if (!canWriteItems) return 'atom-only'

  try {
    const item = new g.ClipboardItem!({ 'image/png': blob })
    await navigator.clipboard.write([item])
    return 'system-clipboard'
  } catch {
    return 'atom-only'
  }
}

/** Keep the test-only diagnostics mirror out of product clipboard state. */
export function mirrorCopyAsResultForE2E(result: CopyAsResult | null): void {
  if (!isE2EMirrorEnabled() || typeof window === 'undefined') return
  const target = window as unknown as { __einfach_lastCopyAs__?: CopyAsResult | null }
  target.__einfach_lastCopyAs__ = result
}

function isE2EMirrorEnabled(): boolean {
  try {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') return true
  } catch {
    // Browser bundles do not provide `process`.
  }
  const flags = globalThis as { __EINFACH_E2E__?: boolean }
  return flags.__EINFACH_E2E__ === true
}
