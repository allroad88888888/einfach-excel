/** Rust 权威规则的传输类型；这里只描述字段，不实现任何值校验。 */
export type NativeDataValidationRule = (
  | { readonly kind: 'whole-number' | 'decimal'; readonly min: number; readonly max: number }
  | { readonly kind: 'list'; readonly items: readonly string[] }
) & { readonly ignoreBlank: boolean }
