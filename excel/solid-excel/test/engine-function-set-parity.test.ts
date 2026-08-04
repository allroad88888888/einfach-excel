/**
 * 门禁：TS 参考引擎的内建函数名集合 == Rust 引擎的内建函数名集合。
 *
 * 为什么需要它：本仓的两个后端（`worker-runtime.ts` 走 wasm，`worker-runtime-ts.ts`
 * 走 `@einfach/excel-core-ts`）是**可以在运行期互换**的 —— `worker-factory.ts` 导出
 * 两个 factory，`VNextWorkerDemo.tsx` 让用户当场切，`excel-site` 两个都用。一个只存在
 * 于其中一侧的函数名，意味着同一份工作簿换个后端就从「有值」变成 `#NAME?`。
 *
 * 还有一重更隐蔽的后果，只在 TS 独有的名字上发生。求值优先级是「内建 → LAMBDA →
 * 宿主自定义公式 → `#NAME?`」（见 `evaluate.ts` 那段注释与 `eval.rs::eval_named_call`），
 * 而宿主注册自定义公式时的**拒绝依据**是 `ENGINE_BUILTIN_FORMULA_NAMES` —— 那是 Rust
 * 侧 `is_builtin_function_name` 的镜像。于是一个「TS 有、Rust 没有」的名字会：
 *
 *   注册侧放行（不在镜像里）→ WASM 后端真的跑用户的函数 → TS 后端被内建静默遮蔽。
 *
 * 用户的函数永远不跑，且没有任何报错。这正是 `reserved_name_parity.rs` 那条门禁存在
 * 的理由（当年 74 个漏网名字），只是发生在另一个引擎上 —— 那条门禁盯的是 Rust 内部
 * 「分发集合 vs 保留清单」，盯不到 TS 引擎多出来的名字。这一条补上这段。
 *
 * 与 REGEX* 那条轴无关：`REGEXTEST` / `REGEXEXTRACT` / `REGEXREPLACE` 在两边的名单里
 * 都在（保留名清单刻意不跟 feature 门控走），它们的分歧是 lite 构建下**求值时**不存在，
 * 不是名字集合差异。见 `excel/rust/wasm/README.md`。
 *
 * 放在 solid-excel 而不是任一引擎包里，判据只有一条：这是**两个后端可互换**才产生的
 * 约束，而只有这一层同时看得见两个后端。
 */
import { describe, expect, test } from '@jest/globals'

import { BUILTIN_FUNCTIONS } from '@einfach/excel-core-ts'
import { ENGINE_BUILTIN_FORMULA_NAMES } from '@einfach/spreadsheet-ui-core'

/**
 * 刻意允许「TS 有、Rust 没有」的名字。**目标是空的。**
 *
 * 它不是死代码：留着是为了让「刻意的例外」与「忘了同步」在失败时可区分。忘了同步 →
 * 下面的断言直接失败；真要开例外 → 必须有人动手往这里加名字并写下理由。
 *
 * 空数组本身就是一条断言：**今天没有任何名字只活在一个引擎上。**
 */
const TS_ONLY_WHITELIST: readonly string[] = []

const tsNames = new Set([...BUILTIN_FUNCTIONS.keys()])
const rustNames = new Set(ENGINE_BUILTIN_FORMULA_NAMES)

const sorted = (names: Iterable<string>): string[] => [...names].sort()
const diff = (a: Set<string>, b: Set<string>): string[] => sorted([...a].filter((n) => !b.has(n)))

describe('两个后端的内建函数名集合', () => {
  // ---- 防假绿 ----------------------------------------------------------
  // 差集断言有个天然的失效模式：任一侧抽空了，差集也是空的，断言空过。下面三条
  // 自检就是为了让那种情况当场炸掉，而不是伪装成「对齐了」。

  test('两侧名单都不是空的（抽取没坍塌）', () => {
    // 下限取得比现状低很多 —— 它挡的是「import 挂了 / 表被清空」这类坍塌，
    // 不是「少了几个函数」（那由后面的差集断言管）。
    expect(tsNames.size).toBeGreaterThan(400)
    expect(rustNames.size).toBeGreaterThan(400)
  })

  test('抽到的确实是函数名（锚点名逐个在场）', () => {
    // 覆盖不同来源文件与不同实现年代，避免某一批被整体漏掉时还能空过。
    for (const anchor of ['SUM', 'VLOOKUP', 'XLOOKUP', 'TEXTJOIN', 'LAMBDA', 'HSTACK']) {
      expect(tsNames.has(anchor)).toBe(true)
      expect(rustNames.has(anchor)).toBe(true)
    }
  })

  test('名字都是大写且无重复（比较口径成立）', () => {
    // 两份名单靠字符串相等比较。任一侧混进小写或重复项，差集就没有意义了。
    expect(sorted(tsNames).map((n) => n.toUpperCase())).toEqual(sorted(tsNames))
    expect(ENGINE_BUILTIN_FORMULA_NAMES.length).toBe(rustNames.size)
  })

  // ---- 真正的门禁 ------------------------------------------------------

  test('Rust 有的，TS 参考引擎必须都有', () => {
    // 这一侧**没有**白名单，且不该有：TS 引擎是跨引擎对拍的基准，一个它算不出来的
    // 内建，就是一个永远对不了拍的内建 —— 分歧会藏在「两边都没测」里。
    expect(diff(rustNames, tsNames)).toEqual([])
  })

  test('TS 有的，Rust 也必须有（否则换后端就静默改语义）', () => {
    expect(diff(tsNames, rustNames)).toEqual(sorted(TS_ONLY_WHITELIST))
  })

  test('白名单里的名字确实只在 TS 侧（例外没有过期）', () => {
    // 白名单空的时候这条自然通过。它管的是白名单**变脏**之后：某个名字后来在 Rust
    // 侧补上了，却没人回来清白名单 —— 那样上面那条断言会继续空过，例外变成谎言。
    for (const name of TS_ONLY_WHITELIST) {
      expect(tsNames.has(name)).toBe(true)
      expect(rustNames.has(name)).toBe(false)
    }
  })
})
