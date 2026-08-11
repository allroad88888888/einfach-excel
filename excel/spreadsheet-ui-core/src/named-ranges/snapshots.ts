import { normalizeNamedRangeName } from './types'
import { NAMED_RANGE_CACHE_MAX } from './constants'
import type { NamedRange, NamedRangeRefersTo, NamedRangeScope } from './types'

export function copyScope(scope: NamedRangeScope): NamedRangeScope | null {
  if (scope === 'workbook') return 'workbook'
  if (
    typeof scope !== 'object' ||
    scope === null ||
    typeof scope.sheetId !== 'string' ||
    scope.sheetId.trim().length === 0
  ) {
    return null
  }
  return Object.freeze({ sheetId: scope.sheetId })
}

export function copyRefersTo(refersTo: NamedRangeRefersTo): NamedRangeRefersTo | null {
  if (typeof refersTo !== 'object' || refersTo === null) return null
  switch (refersTo.kind) {
    case 'range': {
      if (
        typeof refersTo.sheetId !== 'string' ||
        refersTo.sheetId.trim().length === 0 ||
        typeof refersTo.address !== 'string' ||
        refersTo.address.trim().length === 0
      ) {
        return null
      }
      return Object.freeze({ kind: 'range', sheetId: refersTo.sheetId, address: refersTo.address })
    }
    case 'constant':
      return typeof refersTo.value === 'string'
        ? Object.freeze({ kind: 'constant', value: refersTo.value })
        : null
    case 'lambda': {
      if (!Array.isArray(refersTo.params) || typeof refersTo.body !== 'string') return null
      const params: string[] = []
      const seen = new Set<string>()
      for (const value of refersTo.params) {
        const param = typeof value === 'string' ? normalizeNamedRangeName(value) : null
        if (param === null || seen.has(param.toUpperCase())) return null
        seen.add(param.toUpperCase())
        params.push(param)
      }
      if (refersTo.body.trim().length === 0) return null
      return Object.freeze({
        kind: 'lambda',
        params: Object.freeze(params) as unknown as string[],
        body: refersTo.body,
      })
    }
    default:
      return null
  }
}

export function copyNamedRange(entry: NamedRange): NamedRange | null {
  if (typeof entry !== 'object' || entry === null) return null
  const name = typeof entry.name === 'string' ? normalizeNamedRangeName(entry.name) : null
  const scope = copyScope(entry.scope)
  const refersTo = copyRefersTo(entry.refersTo)
  return name === null || scope === null || refersTo === null
    ? null
    : Object.freeze({ name, scope, refersTo })
}

export function copyRegistry(names: readonly NamedRange[]): readonly NamedRange[] | null {
  if (!Array.isArray(names)) return null
  const snapshot: NamedRange[] = []
  for (
    let index = Math.max(0, names.length - NAMED_RANGE_CACHE_MAX);
    index < names.length;
    index += 1
  ) {
    const entry = copyNamedRange(names[index])
    if (entry === null) return null
    snapshot.push(entry)
  }
  return Object.freeze(snapshot)
}
