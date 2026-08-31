import { scanStructuredRef } from './tokenizer'

export type StructuredRefRewriteSpec =
  | { readonly kind: 'rename-table'; readonly fromUpper: string; readonly to: string }
  | {
      readonly kind: 'rename-column'
      readonly tableUpper: string
      readonly fromUpper: string
      readonly to: string
    }

function isRewriteIdentStart(ch: string): boolean {
  return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z')
}

function isRewriteIdentChar(ch: string): boolean {
  return /[A-Za-z0-9$]/.test(ch)
}

/** Rewrite a column token inside a structured-ref's inner text. */
function rewriteColumnInInner(inner: string, fromUpper: string, to: string): string {
  if (inner.includes('[')) {
    // Bracketed column segments (`[Col]`, `[[A]:[B]]`). `#special` and `@`
    // segments never match a column key, so they pass through untouched.
    return inner.replace(/\[([^[\]]*)\]/g, (match, seg: string) =>
      seg.trim().toUpperCase() === fromUpper ? `[${to}]` : match,
    )
  }
  const trimmed = inner.trim()
  if (trimmed.startsWith('#') || trimmed.startsWith('@')) return inner
  return trimmed.toUpperCase() === fromUpper ? to : inner
}

/**
 * Rewrite `Table[...]` structured references in one formula string per `spec`
 * (design-excel-table §4.3) — the static mirror of the engine's cross-sheet
 * formula-text rewrite. String literals are copied verbatim so a Table name
 * inside `"..."` is never touched. Only the bracket-form `Table[...]` is
 * rewritten (the bare `Table` name is a cell-ref-shaped token the static
 * tokenizer never treats as a Table).
 */
export function rewriteStructuredRefsInFormula(
  formula: string,
  spec: StructuredRefRewriteSpec,
): string {
  let out = ''
  let i = 0
  while (i < formula.length) {
    const ch = formula[i]
    if (ch === '"') {
      const start = i
      i += 1
      while (i < formula.length && formula[i] !== '"') i += 1
      if (i < formula.length) i += 1 // include the closing quote
      out += formula.slice(start, i)
      continue
    }
    if (isRewriteIdentStart(ch)) {
      const start = i
      i += 1
      while (i < formula.length && isRewriteIdentChar(formula[i])) i += 1
      const ident = formula.slice(start, i)
      if (formula[i] === '[') {
        const scanned = scanStructuredRef(formula, start, i)
        if (scanned) {
          if (spec.kind === 'rename-table' && ident.toUpperCase() === spec.fromUpper) {
            out += `${spec.to}[${scanned.inner}]`
          } else if (spec.kind === 'rename-column' && ident.toUpperCase() === spec.tableUpper) {
            out += `${ident}[${rewriteColumnInInner(scanned.inner, spec.fromUpper, spec.to)}]`
          } else {
            out += formula.slice(start, scanned.endIndex)
          }
          i = scanned.endIndex
          continue
        }
      }
      out += ident
      continue
    }
    out += ch
    i += 1
  }
  return out
}
