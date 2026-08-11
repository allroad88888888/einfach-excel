import type { ValidationOutcome, ValidationRule } from './types'
import { errorMessage } from './data-validation-value'

export function evaluateValidationLocal(
  rule: ValidationRule,
  input: string,
): ValidationOutcome | null {
  if (rule.kind === 'list') {
    return rule.values.includes(input)
      ? null
      : {
          code: 'validation.list_mismatch',
          severity: 'error',
          message: `Value must be one of: ${rule.values.join(', ')}`,
        }
  }
  if (rule.kind === 'range') {
    const num = Number(input)
    if (Number.isNaN(num)) {
      return {
        code: 'validation.range_out_of_bounds',
        severity: 'error',
        message: 'Value must be a number',
      }
    }
    if (rule.integerOnly && !Number.isInteger(num)) {
      return {
        code: 'validation.range_not_integer',
        severity: 'error',
        message: 'Value must be an integer',
      }
    }
    if (rule.min !== undefined && num < rule.min) {
      return {
        code: 'validation.range_out_of_bounds',
        severity: 'error',
        message: `Value must be >= ${rule.min}`,
      }
    }
    if (rule.max !== undefined && num > rule.max) {
      return {
        code: 'validation.range_out_of_bounds',
        severity: 'error',
        message: `Value must be <= ${rule.max}`,
      }
    }
    return null
  }
  if (rule.kind === 'regex') {
    let expression: RegExp
    try {
      expression = new RegExp(rule.pattern, rule.flags)
    } catch (error) {
      return {
        code: 'validation.regex_invalid',
        severity: 'error',
        message: `Validation regex is invalid: ${errorMessage(error)}`,
      }
    }
    return expression.test(input)
      ? null
      : {
          code: 'validation.regex_mismatch',
          severity: 'error',
          message: `Value does not match pattern /${rule.pattern}/${rule.flags ?? ''}`,
        }
  }
  // Formula evaluation belongs to the backend.
  return null
}
