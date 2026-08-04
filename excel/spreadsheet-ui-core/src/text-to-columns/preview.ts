import {
  TEXT_TO_COLUMNS_PREVIEW_CAP,
  TEXT_TO_COLUMNS_PREVIEW_TOKEN_CAP,
  TEXT_TO_COLUMNS_PREVIEW_TRUNCATION_MARK,
} from './constants'
import { tokenize, type TextToColumnsEffectiveConfig } from './tokenize'
import type { TextToColumnsPreviewRow, TextToColumnsSourceRow } from './types'

function snapshotPreviewRow(sourceRow: number, tokens: readonly string[]): TextToColumnsPreviewRow {
  return Object.freeze({ sourceRow, tokens: Object.freeze(Array.from(tokens)) })
}

/** Materialises a bounded renderer-safe preview without changing commit data. */
export function createTextToColumnsPreview(
  source: readonly TextToColumnsSourceRow[],
  config: TextToColumnsEffectiveConfig,
): readonly TextToColumnsPreviewRow[] {
  const out: TextToColumnsPreviewRow[] = []
  let budget = TEXT_TO_COLUMNS_PREVIEW_TOKEN_CAP
  for (const row of source.slice(0, TEXT_TO_COLUMNS_PREVIEW_CAP)) {
    if (budget <= 0) {
      out.push(snapshotPreviewRow(row.sourceRow, []))
      continue
    }
    const tokens = tokenize(row.text, config)
    if (tokens.length <= budget) {
      out.push(snapshotPreviewRow(row.sourceRow, tokens))
      budget -= tokens.length
      continue
    }
    const sliced = tokens.slice(0, Math.max(0, budget - 1))
    sliced.push(TEXT_TO_COLUMNS_PREVIEW_TRUNCATION_MARK)
    out.push(snapshotPreviewRow(row.sourceRow, sliced))
    budget = 0
  }
  return Object.freeze(out)
}
