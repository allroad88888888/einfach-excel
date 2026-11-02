import { useAtomValue } from '@einfach/react'
import { formulaReferenceTokensAtom } from '@einfach-excel/spreadsheet-ui-core'
import type { ReactNode, RefObject } from 'react'
import './formula-reference.css'

export const FORMULA_REFERENCE_COLORS = [
  'var(--formula-ref-0, #274fee)',
  'var(--formula-ref-1, #00856a)',
  'var(--formula-ref-2, #7b3fe4)',
  'var(--formula-ref-3, #d95f02)',
  'var(--formula-ref-4, #0077b6)',
  'var(--formula-ref-5, #c92a76)',
] as const

export const FORMULA_REFERENCE_FILLS = [
  'rgba(39, 79, 238, 0.08)',
  'rgba(0, 133, 106, 0.08)',
  'rgba(123, 63, 228, 0.08)',
  'rgba(217, 95, 2, 0.08)',
  'rgba(0, 119, 182, 0.08)',
  'rgba(201, 42, 118, 0.08)',
] as const

export interface FormulaReferenceHighlightProps {
  readonly draft: string
  readonly active?: boolean
  readonly highlightRef?: RefObject<HTMLDivElement>
}

/**
 * Synchronized backdrop that colors cell and range reference tokens inside
 * the active formula editor or formula bar while keeping the native textarea
 * caret and IME input untouched.
 */
export function FormulaReferenceHighlight({
  draft,
  active = true,
  highlightRef,
}: FormulaReferenceHighlightProps) {
  const tokens = useAtomValue(formulaReferenceTokensAtom)
  if (!active || !draft.startsWith('=') || tokens.length === 0) return null

  const segments: ReactNode[] = []
  let cursor = 0
  for (const token of tokens) {
    if (token.start > cursor) {
      segments.push(draft.slice(cursor, token.start))
    }
    const colorSlot = token.colorIndex % FORMULA_REFERENCE_COLORS.length
    segments.push(
      <span
        key={`${token.start}:${token.end}`}
        className="formula-ref-token"
        data-ref-color={colorSlot}
        style={{ color: FORMULA_REFERENCE_COLORS[colorSlot] }}
      >
        {draft.slice(token.start, token.end)}
      </span>,
    )
    cursor = token.end
  }
  if (cursor < draft.length) {
    segments.push(draft.slice(cursor))
  }
  if (draft.endsWith('\n')) {
    segments.push('\n')
  }

  return (
    <div
      ref={highlightRef}
      aria-hidden="true"
      className="formula-reference-highlight"
      data-formula-reference-highlight="true"
    >
      {segments}
    </div>
  )
}
