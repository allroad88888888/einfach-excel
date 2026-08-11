import type {
  GoToLocator,
  GoToLocatorKind,
  GoToValueKindFilter,
} from '@einfach/spreadsheet-ui-core'

export const LOCATOR_KIND_ORDER: readonly GoToLocatorKind[] = [
  'formulas',
  'constants',
  'blanks',
  'comments',
  'conditional-format',
  'data-validation',
  'last-cell',
  'current-region',
  'visible-cells-only',
  'row-differences',
  'column-differences',
  'precedents',
  'dependents',
]

export const VALUE_KIND_FILTERS: readonly { value: GoToValueKindFilter; label: string }[] = [
  { value: null, label: 'goTo.subtype.any' },
  { value: 'number', label: 'goTo.subtype.number' },
  { value: 'text', label: 'goTo.subtype.text' },
  { value: 'logical', label: 'goTo.subtype.logical' },
  { value: 'error', label: 'goTo.subtype.error' },
]

export function locatorKindOf(locator: GoToLocator): GoToLocatorKind {
  return locator.kind
}

export function locatorValueKind(locator: GoToLocator): GoToValueKindFilter {
  return locator.kind === 'formulas' || locator.kind === 'constants' ? locator.valueKind : null
}

export function makeLocator(kind: GoToLocatorKind, valueKind: GoToValueKindFilter): GoToLocator {
  return kind === 'formulas' || kind === 'constants' ? { kind, valueKind } : { kind }
}

export function isLocatorDisabled(kind: GoToLocatorKind): boolean {
  return kind === 'precedents' || kind === 'dependents'
}
