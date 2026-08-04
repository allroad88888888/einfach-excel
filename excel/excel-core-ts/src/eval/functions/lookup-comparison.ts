/** Excel-compatible lookup equality, ordering, and wildcard matching. */
import type { Value } from '../../types'

export function compareForLookup(needle: Value, hay: Value): number | null {
  if (needle.kind === 'error' || hay.kind === 'error') return null
  if (needle.kind === 'blank' && hay.kind === 'blank') return 0
  if (needle.kind === 'number' && hay.kind === 'number')
    return needle.value < hay.value ? -1 : needle.value > hay.value ? 1 : 0
  if (needle.kind === 'string' && hay.kind === 'string') {
    const left = needle.value.toLowerCase()
    const right = hay.value.toLowerCase()
    return left < right ? -1 : left > right ? 1 : 0
  }
  if (needle.kind === 'boolean' && hay.kind === 'boolean')
    return needle.value === hay.value ? 0 : needle.value ? 1 : -1
  if (needle.kind === 'blank' && hay.kind === 'number')
    return -hay.value < 0 ? -1 : -hay.value > 0 ? 1 : 0
  if (needle.kind === 'number' && hay.kind === 'blank')
    return needle.value < 0 ? -1 : needle.value > 0 ? 1 : 0
  return null
}

export function compareOrdered(hay: Value, needle: Value): number | null {
  return hay.kind === 'blank' ? null : compareForLookup(hay, needle)
}

export function exactLookupMatch(needle: Value, hay: Value, useWildcards: boolean): boolean {
  if (useWildcards && needle.kind === 'string') {
    const text = wildcardText(hay)
    return text !== undefined && wildcardMatch(needle.value, text)
  }
  return compareForLookup(needle, hay) === 0
}

export function numericRank(value: Value): number | null {
  if (value.kind === 'number') return value.value
  if (value.kind === 'boolean') return value.value ? 1 : 0
  if (value.kind === 'blank') return 0
  if (value.kind !== 'string') return null
  const number = Number(value.value)
  return Number.isFinite(number) ? number : null
}

export function hasWildcardPattern(value: Value): boolean {
  if (value.kind !== 'string') return false
  for (let i = 0; i < value.value.length; i += 1) {
    if (value.value[i] === '~') {
      i += 1
    } else if (value.value[i] === '*' || value.value[i] === '?') {
      return true
    }
  }
  return false
}

function wildcardText(value: Value): string | undefined {
  switch (value.kind) {
    case 'string':
      return value.value
    case 'number':
      return String(value.value)
    case 'boolean':
      return value.value ? 'TRUE' : 'FALSE'
    case 'blank':
      return ''
    default:
      return undefined
  }
}

function wildcardMatch(pattern: string, text: string): boolean {
  let expression = '^'
  for (let i = 0; i < pattern.length; i += 1) {
    const character = pattern[i]
    if (character === '~' && i + 1 < pattern.length && /[*?~]/.test(pattern[i + 1])) {
      expression += escapeRegex(pattern[i + 1])
      i += 1
    } else if (character === '*') {
      expression += '.*'
    } else if (character === '?') {
      expression += '.'
    } else {
      expression += escapeRegex(character)
    }
  }
  return new RegExp(`${expression}$`, 'i').test(text)
}

function escapeRegex(character: string): string {
  return character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
