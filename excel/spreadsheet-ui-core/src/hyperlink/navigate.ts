import { atom, type Getter, type Setter } from '@einfach/core'
import { activeWorkbookSheetAtom, workbookDocumentAtom } from '../runtime/workbook-document'
import { activateWorkbookSheetAtom } from '../runtime/activate-workbook-sheet'
import { nativeNamedRangesAtom, resolveNativeNamedRange } from '../named-ranges/native-catalog'
import { applyGoToTargetAtom } from '../go-to/selection-commands'
import { parseGoToReference } from '../go-to/reference-parser'
import type { GoToTarget } from '../go-to/types'
import { scrollToCellAtom } from '../viewport/metrics'
import { internalHyperlink } from './url'

const noticeBackingAtom = atom<string>('')
noticeBackingAtom.debugLabel = 'spreadsheet.hyperlink.noticeBacking'

export const hyperlinkNoticeAtom = atom((get) => get(noticeBackingAtom))
hyperlinkNoticeAtom.debugLabel = 'spreadsheet.hyperlink.notice'

const R1C1_LIKE = /^R(?:\[-?\d+\]|\d+)?C(?:\[-?\d+\]|\d+)?(?:\s*:\s*R(?:\[-?\d+\]|\d+)?C(?:\[-?\d+\]|\d+)?)?$/i

export function resolveAndNavigateInternalHyperlink(
  get: Getter,
  set: Setter,
  rawUrl: string,
): { readonly ok: true } | { readonly ok: false; readonly error: string } {
  const normalized = internalHyperlink(rawUrl)
  const active = get(activeWorkbookSheetAtom)
  if (!normalized || !active) {
    return { ok: false, error: 'Enter a valid workbook location such as #Sheet2!A1 or #DefinedName.' }
  }
  const location = normalized.slice(1).trim()
  const sheets = get(workbookDocumentAtom).sheets
  const named = resolveNativeNamedRange(location, get(nativeNamedRangesAtom), sheets, active.id)
  if (named === null) {
    return { ok: false, error: 'The linked worksheet or named range does not exist.' }
  }
  let target: GoToTarget | null = named ?? null
  if (!target) {
    const bangIdx = location.lastIndexOf('!')
    const body = bangIdx >= 0 ? location.slice(bangIdx + 1).trim() : location
    if (R1C1_LIKE.test(body)) {
      return { ok: false, error: 'The linked worksheet or named range does not exist.' }
    }
    const parsed = parseGoToReference(location, {
      activeSheetId: active.id,
      sheets,
      registry: [],
    })
    if (!parsed.ok) {
      return { ok: false, error: 'The linked worksheet or named range does not exist.' }
    }
    target = parsed.target
  }
  const sheet = sheets.find((item) => item.id === target.sheetId)
  if (!sheet) {
    return { ok: false, error: 'The linked worksheet or named range does not exist.' }
  }
  if (sheet.hidden) {
    return {
      ok: false,
      error: 'The linked worksheet is hidden. Unhide it before opening this link.',
    }
  }
  const range = target.range ?? (target.coord ? {
    rowStart: target.coord.row,
    rowEnd: target.coord.row,
    colStart: target.coord.col,
    colEnd: target.coord.col,
  } : null)
  if (!range || range.rowEnd >= sheet.rowCount || range.colEnd >= sheet.colCount) {
    return { ok: false, error: 'The linked cell or range is outside the worksheet canvas.' }
  }
  if (sheet.id !== active.id) set(activateWorkbookSheetAtom, sheet)
  set(applyGoToTargetAtom, target)
  set(scrollToCellAtom, {
    coord: { row: range.rowStart, col: range.colStart },
    rowAlign: 'start',
    colAlign: 'nearest',
  })
  set(noticeBackingAtom, '')
  return { ok: true }
}

/** 网格 Ctrl/⌘+单击内部超链接入口：成功跳表定位，目标表隐藏/缺失时给出非阻塞状态提示。 */
export const openInternalHyperlinkAtom = atom(null, (get, set, url: string): boolean => {
  const outcome = resolveAndNavigateInternalHyperlink(get, set, url)
  if (!outcome.ok) {
    set(noticeBackingAtom, outcome.error)
    return false
  }
  return true
})
openInternalHyperlinkAtom.debugLabel = 'spreadsheet.hyperlink.openInternal'

export const clearHyperlinkNoticeAtom = atom(null, (_get, set) => {
  set(noticeBackingAtom, '')
})
clearHyperlinkNoticeAtom.debugLabel = 'spreadsheet.hyperlink.clearNotice'
