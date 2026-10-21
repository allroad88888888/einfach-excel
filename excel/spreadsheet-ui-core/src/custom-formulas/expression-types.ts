/** Data-only expressions. Host callback registrations remain a separate API. */
export interface NativeCustomFormulaDefinition {
  readonly name: string
  readonly parameters: readonly string[]
  readonly expression: string
}
export type NativeCustomFormulaAction =
  | { readonly kind: 'upsert'; readonly definition: NativeCustomFormulaDefinition }
  | { readonly kind: 'remove'; readonly name: string }

/** Reject malformed native/file projections; semantic validation belongs to Rust. */
export function validateCustomFormulaDefinitions(
  value: unknown,
): readonly NativeCustomFormulaDefinition[] {
  if (
    !Array.isArray(value) ||
    value.length > 256 ||
    value.some(
      (definition) =>
        !definition ||
        typeof definition.name !== 'string' ||
        !/^[A-Z_][A-Z0-9_.]*$/.test(definition.name) ||
        !Array.isArray(definition.parameters) ||
        definition.parameters.length > 64 ||
        definition.parameters.some((parameter: unknown) => typeof parameter !== 'string') ||
        new Set(definition.parameters).size !== definition.parameters.length ||
        typeof definition.expression !== 'string' ||
        !definition.expression.startsWith('='),
    ) ||
    new Set(value.map((definition) => definition.name)).size !== value.length
  )
    throw new Error('Rust returned an invalid custom formula directory.')
  return value.map((definition) => ({ ...definition, parameters: [...definition.parameters] }))
}
