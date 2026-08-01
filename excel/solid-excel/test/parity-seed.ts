/**
 * 两套跨引擎 parity 套件共用的确定性输入原语：一个 LCG 随机源 + A1 地址换算。
 *
 * 为什么单独成文件：`scale-parity-*.ts`（~75k 播种工作负载）与
 * `cross-engine-parity-engines.ts`（always-on 小烟测）各自抄过一份逐字相同的
 * `colLetters` / `a1`。两份 parity 报告的地址必须能互相对照，抄两份就有漂移风险。
 *
 * 纪律（`excel/rust/excel-core/docs/archive/SCALE_TEST_SUITE_PLAN.md` 设计原则）：
 * 只用播种 LCG，禁止 `Date.now` / `Math.random` —— 分歧必须能凭种子原样复现。
 */

/** Numerical Recipes LCG —— 与 perf bench 用的是同一个发生器。 */
export function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

export function rngInt(rng: () => number, bound: number): number {
  return Math.floor(rng() * bound) % bound
}

function colLetters(col: number): string {
  let out = ''
  let n = col
  for (;;) {
    out = String.fromCharCode(65 + (n % 26)) + out
    if (n < 26) return out
    n = Math.floor(n / 26) - 1
  }
}

/** 零基 (row, col) → A1。`a1(0, 0) === 'A1'`。 */
export function a1(row: number, col: number): string {
  return `${colLetters(col)}${row + 1}`
}
