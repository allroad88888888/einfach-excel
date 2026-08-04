/**
 * 求值器的错误值构造器。
 *
 * 职责：把一个 `ErrorCode`（可选附言）包成 `Value` 的 `error` 变体。
 *
 * 单列一个文件，是为了让求值器的那些叶子模块（`array-shape` / `grid` /
 * `binary-ops` / `runtime-ref` …）都能用上它，而不必反过来 import
 * `evaluate.ts` —— 那会把它们一并拖进求值器的循环导入。
 */
import type { ErrorCode, Value } from '../types'

export const ERR = (code: ErrorCode, message?: string): Value =>
  message === undefined ? { kind: 'error', code } : { kind: 'error', code, message }
