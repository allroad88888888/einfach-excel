import type { Value } from '../../../types'

/**
 * Convert a range-or-scalar argument into a flat `Value[]` (row-major). A
 * scalar argument is treated as a single-element range — matches Excel.
 */
export function flatten(v: Value): Value[] {
  if (v.kind === 'array') {
    const out: Value[] = []
    for (const row of v.value) for (const cell of row) out.push(cell)
    return out
  }
  return [v]
}

export interface ValueShape {
  readonly rows: number
  readonly cols: number
}

export function valueShape(v: Value): ValueShape {
  if (v.kind !== 'array') return { rows: 1, cols: 1 }
  return { rows: v.value.length, cols: v.value[0]?.length ?? 0 }
}

export function sameValueShape(a: Value, b: Value): boolean {
  const left = valueShape(a)
  const right = valueShape(b)
  return left.rows === right.rows && left.cols === right.cols
}

// ---------------------------------------------------------------------------
