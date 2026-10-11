/** Rust 权威规则的传输类型；这里只描述字段，不实现任何值校验。 */
export type NativeDataValidationOperator = 'between' | 'not-between' | 'equal' | 'not-equal'
  | 'greater-than' | 'greater-than-or-equal' | 'less-than' | 'less-than-or-equal'

export type NativeDataValidationRule = (
  | { readonly kind: 'whole-number' | 'decimal' | 'text-length'; readonly min: number; readonly max: number;
    readonly operator?: NativeDataValidationOperator }
  | { readonly kind: 'date' | 'time'; readonly min: string; readonly max: string;
    readonly operator?: NativeDataValidationOperator }
  | { readonly kind: 'list'; readonly items: readonly string[] }
) & { readonly ignoreBlank: boolean }
