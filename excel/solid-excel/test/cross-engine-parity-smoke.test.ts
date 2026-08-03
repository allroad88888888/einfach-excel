/**
 * ALWAYS-ON 跨引擎烟测 —— **求值语义**：同一个公式，两个引擎必须算出同一个东西。
 *
 * 溢出（spill）的生命周期在兄弟文件 `cross-engine-parity-spill.test.ts`；
 * 每一类的夹具、地址与闭式期望值在 `cross-engine-parity-cases.ts` —— 加一类分歧
 * 改的是那边（一行 case + 一行 workload），本文件只放规格。
 *
 * 与 `scale-parity.test.ts` 的分工不是「跑不跑」而是**形状**：本份是每个分歧类的
 * **最小形状**（一张表、无播种工作负载、不走 bulk 导入，失败时地址少到可以直接
 * 读），那份是播种规模，负责撞出最小形状撞不出的组合态。两份都是 always-on。
 *
 * 本份必须快到能挂在每一次 `npx jest` 上，所以**不要**把它长成第二个 scale 套件。
 * 只有当一条分歧是**单引擎单测看不见的一整类**时，才往这里加场景。
 *
 * ## 已经钉住的分歧类（每一条都曾是活的）
 *
 * 1. **错误码词汇** —— 两个引擎的内部诊断码集都比 Excel 宽，在渲染边界收窄；
 *    只有一侧做了收窄时，同一个公式在 TS 上读 `#TYPE!`、在 WASM 上读 `#VALUE!`。
 *    单引擎套件看不见这一类 —— 被断言的正是那份词汇本身。见 `ERROR_LITERALS`。
 * 2. **算术操作数强制转换** —— 运算符拿到一个还不是数字的值时做什么。`=1+"x"` 那
 *    一行只覆盖了一半：它钉的是**失败码**，而一个只喂过不可强转文本的套件，看不见
 *    一个**什么都不转**的引擎。`=1+"5"` 在 Excel 与 TS 上是 `6`，在 Rust 上曾长期
 *    是 `#VALUE!` —— 缺口能活下来，正因为这份文件此前只喂过 `"x"`。
 * 3. **运算符优先级** —— `=2^2%` 与 `=-2^2` 是 `^` 撞上比它高的运算符的两处，
 *    都曾是 TS 单侧缺陷（`POSTFIX_BP` / `PREFIX_BP` 排在 `^` 之下）。
 * 4. **聚合的错误透明度** —— 区域里的一个错误格是毒死整个聚合，还是只是一个聚合
 *    自己有主张的值。规则是**按 function number 分的**：错误格不是 NUMBER（所以
 *    COUNT 跳过）、不是 BLANK（所以 COUNTA 计数），而 SUM 那一档传播。
 *    `SUBTOTAL` / 裸 `COUNT` / `COUNTIFS` 在两个引擎上都是**各自独立的代码路径**，
 *    钉住一条说明不了另一条 —— 事实就是它们是分三批修好的。
 * 5. **criteria × 错误值** —— 上一类只问「错误格会不会短路」，这一类问「不短路之后
 *    它匹配上什么」，外加一条方向相反的：criteria 实参**本身**是错误值时要传播。
 *    两侧**各错一半且方向相反**（TS 让错误格一律不匹配、Rust 把 `<>` 退化成 `=`；
 *    B 那条反过来），所以「两侧相等」在这一类上从来不响。见
 *    `cross-engine-parity-criteria-errors.ts`。
 * 6. **criteria 的文本比较** —— 上一类问「错误格匹配上什么」，这一类问「**判据
 *    本身**怎么解释」：大小写折不折（Rust 逐字节 `==`，同一个函数里紧邻的通配符
 *    档却折小写，自相矛盾）、带了通配符之后还看不看非文本格（Rust 先
 *    `coerce_to_text` 再匹配，把数字 / 布尔 / 错误全数进 `"*"`；TS 只把错误格
 *    写死成两侧都不算）、以及 `~` 转义（这条反过来是 TS 错）。见
 *    `cross-engine-parity-criteria-wildcard.ts`。
 *
 * 期望值一律断言**字面量**，不只断言「两侧相等」：相等只能证明两个引擎一致，
 * 证不了它们一起错，而「一起错」在这份文件的历史里出现过不止一次。
 *
 * 这里失败就是一条**真的**跨引擎发现：报告分歧地址，不要放宽断言。
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import {
  displaysOf,
  flatten,
  loadWasmModule,
  makeEngine,
  type Engine,
} from './cross-engine-parity-engines'
import {
  COERCION_ADDRS,
  COUNT_ADDRS,
  CRITERIA_ADDRS,
  CRITERIA_ERROR_ADDRS,
  CRITERIA_WILDCARD_ADDRS,
  ERROR_ADDRS,
  EXPECTED_COERCION_DISPLAYS,
  EXPECTED_COUNT_DISPLAYS,
  EXPECTED_CRITERIA_DISPLAYS,
  EXPECTED_CRITERIA_ERROR_DISPLAYS,
  EXPECTED_CRITERIA_WILDCARD_DISPLAYS,
  EXPECTED_GENERAL_TEXT_DISPLAYS,
  EXPECTED_LITERAL_DISPLAYS,
  EXPECTED_OVERFLOW_DISPLAYS,
  EXPECTED_SCIENTIFIC_DISPLAYS,
  EXPECTED_SUBTOTAL_DISPLAYS,
  GENERAL_TEXT_ADDRS,
  LITERAL_ADDRS,
  OVERFLOW_ADDRS,
  PROPAGATED_ADDRS,
  SCIENTIFIC_ADDRS,
  SUBTOTAL_ADDRS,
  WORKLOAD,
} from './cross-engine-parity-cases'
// 第九类的地址与期望值直接取自群组文件，不走 `cross-engine-parity-cases.ts`
// 转出：那份正被并发改动，少一处 re-export 就少一处冲突面。工作负载仍然并进
// `WORKLOAD`（bulk 导入只有那一个入口）。
import {
  DYNAMIC_ARRAY_ADDRS,
  EXPECTED_DYNAMIC_ARRAY_DISPLAYS,
} from './cross-engine-parity-dynamic-array'

describe('cross-engine parity — evaluation semantics (TS runtime vs WASM engine)', () => {
  let ts: Engine
  let wasm: Engine

  beforeAll(async () => {
    await loadWasmModule()
    ts = makeEngine('ts')
    wasm = makeEngine('wasm')
    await ts.bulkImport(WORKLOAD)
    await wasm.bulkImport(WORKLOAD)
  }, 30_000)

  afterAll(() => {
    wasm?.dispose()
    ts?.dispose()
  })

  test('arithmetic type errors agree: =1+"x" / ="x"+"y" / =-"abc" are all #VALUE!', async () => {
    const tsRead = await ts.read(ERROR_ADDRS)
    const wasmRead = await wasm.read(ERROR_ADDRS)
    expect(flatten(wasmRead)).toEqual(flatten(tsRead))

    // Excel's code for a non-coercible operand is #VALUE!. The regression
    // this pins answered `#TYPE!` on one engine — identical-and-wrong is
    // still wrong, hence the literal expectation on BOTH readings.
    for (const read of [tsRead, wasmRead]) {
      expect(displaysOf(read, ERROR_ADDRS)).toEqual(['#VALUE!', '#VALUE!', '#VALUE!'])
      for (const addr of ERROR_ADDRS) expect(read.get(addr)?.isError).toBe(true)
    }
  })

  test('numeric-string / unary-minus / percent coerce identically on both engines', async () => {
    const tsRead = await ts.read(COERCION_ADDRS)
    const wasmRead = await wasm.read(COERCION_ADDRS)
    expect(flatten(wasmRead)).toEqual(flatten(tsRead))

    // Closed form on BOTH readings: two engines that both answer `#VALUE!`
    // to `=1+"5"` agree perfectly and are both wrong, which is exactly the
    // state this scenario was added to end.
    for (const read of [tsRead, wasmRead]) {
      expect(displaysOf(read, COERCION_ADDRS)).toEqual(EXPECTED_COERCION_DISPLAYS)
      for (const addr of COERCION_ADDRS) expect(read.get(addr)?.isError).toBe(false)
    }
  })

  test('every error literal renders the same token on both engines', async () => {
    const addrs = [...LITERAL_ADDRS, ...PROPAGATED_ADDRS]
    const tsRead = await ts.read(addrs)
    const wasmRead = await wasm.read(addrs)
    expect(flatten(wasmRead)).toEqual(flatten(tsRead))

    // Closed form on BOTH readings, not just cross-engine equality: the
    // divergence this pins had the TS engine showing `#TYPE!` where the Rust
    // engine showed `#VALUE!`, and "consistently wrong" would sail past an
    // equality-only assertion the day someone re-widened both sides.
    for (const read of [tsRead, wasmRead]) {
      expect(displaysOf(read, LITERAL_ADDRS)).toEqual(EXPECTED_LITERAL_DISPLAYS)
      // An operator short-circuiting on an errored operand must hand back the
      // same DISPLAYED token, not the internal one it was carrying.
      expect(displaysOf(read, PROPAGATED_ADDRS)).toEqual(EXPECTED_LITERAL_DISPLAYS)
      for (const addr of addrs) expect(read.get(addr)?.isError).toBe(true)
    }
  })

  test('argument-type guards render #VALUE!, never the internal #TYPE!', async () => {
    // SUBTOTAL's function-number check is the guard both engines implement
    // with the internal wrong-type code (`fn_subtotal` → `ValueError::
    // WrongType`; `applySubtotal` → `'#TYPE!'`). It reaches a cell only
    // through the rendering boundary, so it must read `#VALUE!`.
    const tsRead = await ts.read(['N1'])
    const wasmRead = await wasm.read(['N1'])
    expect(flatten(wasmRead)).toEqual(flatten(tsRead))
    for (const read of [tsRead, wasmRead]) {
      expect(read.get('N1')?.display).toBe('#VALUE!')
      expect(read.get('N1')?.isError).toBe(true)
    }
  })

  test('an error cell inside a range does not poison SUBTOTAL\'s counting codes', async () => {
    const tsRead = await ts.read(SUBTOTAL_ADDRS)
    const wasmRead = await wasm.read(SUBTOTAL_ADDRS)
    expect(flatten(wasmRead)).toEqual(flatten(tsRead))

    // Closed form on BOTH readings: two engines that both answer `#DIV/0!` to
    // `=SUBTOTAL(2, T1:T6)` agree perfectly and are both wrong, which is
    // exactly the state this scenario was added to end.
    for (const read of [tsRead, wasmRead]) {
      expect(displaysOf(read, SUBTOTAL_ADDRS)).toEqual(EXPECTED_SUBTOTAL_DISPLAYS)
    }
  })

  test('bare COUNT / COUNTA obey the same rule as SUBTOTAL\'s counting codes', async () => {
    const tsRead = await ts.read(COUNT_ADDRS)
    const wasmRead = await wasm.read(COUNT_ADDRS)
    expect(flatten(wasmRead)).toEqual(flatten(tsRead))

    // Closed form on BOTH readings: `=COUNT(T1:T6)` read `3` on the Rust
    // engine and `#DIV/0!` on the TS reference engine, and the paired
    // `=COUNTA` / `=SUM` rows are what keeps "3" from being satisfied by an
    // engine that stopped propagating for every function at once.
    for (const read of [tsRead, wasmRead]) {
      expect(displaysOf(read, COUNT_ADDRS)).toEqual(EXPECTED_COUNT_DISPLAYS)
    }
  })

  test('an error cell in a CRITERIA range does not poison COUNTIFS / SUMIFS', async () => {
    const tsRead = await ts.read(CRITERIA_ADDRS)
    const wasmRead = await wasm.read(CRITERIA_ADDRS)
    expect(flatten(wasmRead)).toEqual(flatten(tsRead))

    // Closed form on BOTH readings: the engines agreed perfectly while both
    // short-circuited COUNTIFS/SUMIFS here, so only the literals separate the
    // fix from the defect. The `#DIV/0!` rows are the value tier, still live.
    for (const read of [tsRead, wasmRead]) {
      expect(displaysOf(read, CRITERIA_ADDRS)).toEqual(EXPECTED_CRITERIA_DISPLAYS)
    }
  })

  test('criteria 里的错误：写成字符串是条件，求值成错误值是传播', async () => {
    const tsRead = await ts.read(CRITERIA_ERROR_ADDRS)
    const wasmRead = await wasm.read(CRITERIA_ERROR_ADDRS)
    expect(flatten(wasmRead)).toEqual(flatten(tsRead))

    // 这一类只能靠字面量断言 —— 两侧从来不相等，而是**各错一半、方向相反**：
    // A（条件字符串里写错误码）上 TS 让错误格一律不匹配、Rust 把 `<>` 退化成
    // `=`；B（criteria 实参本身是错误）上 TS 传播、Rust 拿错误码去做文本比较。
    // 任何「两侧相等」的断言在这里都只会红在半路上，说明不了谁对。
    for (const read of [tsRead, wasmRead]) {
      expect(displaysOf(read, CRITERIA_ERROR_ADDRS)).toEqual(EXPECTED_CRITERIA_ERROR_DISPLAYS)
    }
  })

  test('criteria 的文本比较：大小写要折，通配符只看文本格', async () => {
    const tsRead = await ts.read(CRITERIA_WILDCARD_ADDRS)
    const wasmRead = await wasm.read(CRITERIA_WILDCARD_ADDRS)
    expect(flatten(wasmRead)).toEqual(flatten(tsRead))

    // 又是一类「两侧各错一半、方向相反」：大小写与通配符 × 非文本格上 Rust 错
    // （逐字节 `==`；先 `coerce_to_text` 再匹配），`~` 转义上反过来是 TS 错
    // （`~` 不算通配符标记，`"~~"` 没被解码）。字面量断言是唯一能同时压住三面的
    // 写法 —— 其中 `"*"` 与 `"<>*"` 必须加起来铺满整个区域。
    for (const read of [tsRead, wasmRead]) {
      expect(displaysOf(read, CRITERIA_WILDCARD_ADDRS)).toEqual(
        EXPECTED_CRITERIA_WILDCARD_DISPLAYS,
      )
    }
  })

  test('数字转文本走 Excel 的 General 规格，不是宿主语言的默认写法', async () => {
    const tsRead = await ts.read(GENERAL_TEXT_ADDRS)
    const wasmRead = await wasm.read(GENERAL_TEXT_ADDRS)
    expect(flatten(wasmRead)).toEqual(flatten(tsRead))

    // 这一类必须靠字面量断言，「两侧相等」在这里从来没红过 —— 因为两侧一直是
    // 各错各的：TS 走 JS `String(n)` 给 `1e+21`，Rust 走 `Display` 把 22 位数字
    // 原样铺开。相等断言只有在两个引擎错到一块去时才会响。
    for (const read of [tsRead, wasmRead]) {
      expect(displaysOf(read, GENERAL_TEXT_ADDRS)).toEqual(EXPECTED_GENERAL_TEXT_DISPLAYS)
    }
  })

  test('浮点溢出是 #NUM!，下溢是 0 —— 不是宿主语言的 Infinity', async () => {
    const tsRead = await ts.read(OVERFLOW_ADDRS)
    const wasmRead = await wasm.read(OVERFLOW_ADDRS)
    expect(flatten(wasmRead)).toEqual(flatten(tsRead))

    // 又是一类「相等断言从来没红过」：先是各错各的（Rust `inf` / TS
    // `Infinity`），后来被数字→文本收口成同一个 `Infinity` —— 一致，但仍然
    // 不是 Excel 的答案。只有字面量能分开「两侧一致」与「两侧都对」。
    // 溢出与下溢方向相反，必须同表：一个「非有限或过小都报错」的实现在只测
    // 溢出的表上照样全绿，却会把 `=10^-200*10^-200` 从 `0` 变成 `#NUM!`。
    for (const read of [tsRead, wasmRead]) {
      expect(displaysOf(read, OVERFLOW_ADDRS)).toEqual(EXPECTED_OVERFLOW_DISPLAYS)
    }
  })

  test('=1E2 是 100，=1+E2 读 E2 格 —— 科学计数与单元格引用的分界', async () => {
    const tsRead = await ts.read(SCIENTIFIC_ADDRS)
    const wasmRead = await wasm.read(SCIENTIFIC_ADDRS)
    expect(flatten(wasmRead)).toEqual(flatten(tsRead))

    // 这一类不是「两侧一起错」而是一侧错：Rust 的词法层把 `1E2` 读成
    // 「数字 1」+「单元格 E2」，整式 `#VALUE!`；TS 与 Excel 给 100。修好之后
    // 相等断言会永远为真，所以真正的门是字面量。
    // 表里每条「吞」都配了一条方向相反的「不吞」（`=1E2` vs `=1+E2`），
    // 而 `=1E2+E2` 一条式子里同时要两种切法 —— 任何「一律当指数」或
    // 「一律当引用」的实现都过不去。
    for (const read of [tsRead, wasmRead]) {
      expect(displaysOf(read, SCIENTIFIC_ADDRS)).toEqual(EXPECTED_SCIENTIFIC_DISPLAYS)
    }
  })

  test('WRAPROWS 按行折、WRAPCOLS 按列折 —— 同一份向量、两个转置的矩形', async () => {
    const tsRead = await ts.read(DYNAMIC_ARRAY_ADDRS)
    const wasmRead = await wasm.read(DYNAMIC_ARRAY_ADDRS)
    expect(flatten(wasmRead)).toEqual(flatten(tsRead))

    // 这一类的起点是「Rust 侧根本没有这两个函数」（Excel 365 那批动态数组里
    // 只漏了这一对），所以相等断言在补齐之前红得毫无信息量、补齐之后又可能
    // 一起把方向写反。只有字面量能同时压住「有没有」与「方向对不对」。
    // 表里两个函数吃同一份 6 元素向量，期望的是两个转置关系的矩形；`#NUM!`
    // （wrap_count < 1）与 `#VALUE!`（非一维）是两个不同的码，也在同一张表里。
    for (const read of [tsRead, wasmRead]) {
      expect(displaysOf(read, DYNAMIC_ARRAY_ADDRS)).toEqual(EXPECTED_DYNAMIC_ARRAY_DISPLAYS)
    }
  })
})
