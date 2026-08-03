/**
 * 算术结果的出口闸门：**非有限一律 `#NUM!`**。
 *
 * Rust 孪生实现是 `excel/rust/excel-core/src/eval.rs` 的 `finite_or_overflow`。
 *
 * # 依据
 *
 * Excel 明文按 IEEE 754 存数，但在两个点上刻意不跟 —— Microsoft Learn
 * "Floating-point arithmetic may give inaccurate result in Excel"：
 *
 * - **Overflow**: "Overflow occurs when a number is too large to be
 *   represented. Excel uses its own special representation for this case
 *   (`#NUM!`)."
 * - **NaN**: "Excel instead immediately generates an error such as `#NUM!`
 *   or `#DIV/0!`."
 *
 * 所以 `=1E308*10` 不是 `Infinity`（JS `String(n)`）也不是 `inf`（Rust
 * `Display`），是 `#NUM!`。两侧此前**各错各的**，后来又被统一成同一个错的
 * `Infinity` —— 一致但仍然不是 Excel 的答案。
 *
 * # 下溢**不**在这条闸门里
 *
 * 同一份文档：'Underflow: ... In IEEE and Excel, the result is 0 (with the
 * exception that IEEE has a concept of -0, and Excel doesn't).' IEEE 的下溢
 * 结果本来就是 `0`，`Number.isFinite` 判真、原样落地，所以 `=1E-308/1E10`
 * 要的就是 `0`。不要在这里替它报错。（`-0` 的显示由 General 转文本收口 ——
 * `excelGeneralToText(-0)` 是 `'0'`。）
 *
 * # 为什么单列一个文件
 *
 * 这条闸门有**三个**调用侧：运算符（`evaluate.ts`）、内建聚合注册表
 * （`functions/math.ts` 的 SUM / PRODUCT）、以及把同名函数截走的稀疏孪生
 * （`sparse-aggregations.ts` 的 SUM）。三处各写一份 `Number.isFinite` 判断，
 * 就是这个仓库刚刚在「数字转文本」上付过一次账的那种复制粘贴。
 */
import type { Value } from '../types'

/** 有限数原样落地，`Infinity` / `-Infinity` / `NaN` 一律 `#NUM!`。 */
export function finiteOrNum(value: number): Value {
  return Number.isFinite(value) ? { kind: 'number', value } : { kind: 'error', code: '#NUM!' }
}
