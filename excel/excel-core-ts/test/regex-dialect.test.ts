/**
 * REGEX* 方言口径的**跨引擎钉子**（TS 半边）。
 *
 * 对称的另一半是 `excel/rust/excel-core/tests/regex_dialect_parity.rs`，两个
 * 文件逐条对应、断言同一批可观察结果。**没有走 `cross-engine-parity-*` 那张
 * 网**：那张网的 WASM 侧加载 `excel/solid-excel/wasm-pkg/`，即 lite 构建，而
 * REGEX* 受 `regex-formulas` feature 门控，lite 下这三个名字不是内建、一律求值
 * 成 `#NAME?`，进网只会得到满屏假分歧。两侧各钉一份是既有先例。
 *
 * 口径依据：Excel 的 REGEX* 三函数用 **PCRE2** 方言（微软 support 文档三处
 * 明写），PCRE2 不开 `PCRE2_UCP` 时 `\d`/`\w` 只认 ASCII —— 和 JS `RegExp`
 * 天生的口径一致。Rust 侧靠 `eval_regex_ascii.rs` 的模式改写追上来。
 */

import { describe, expect, test } from '@jest/globals'

import { FUNCTIONS } from '../src/eval/functions/text'
import type { EvalContext, FunctionImpl, Value } from '../src/types'

const NUM = (n: number): Value => ({ kind: 'number', value: n })
const STR = (s: string): Value => ({ kind: 'string', value: s })
const BOOL = (b: boolean): Value => ({ kind: 'boolean', value: b })
const ERR = (code: '#N/A' | '#VALUE!'): Value => ({ kind: 'error', code })

// REGEX* 不读 ctx；任何一次读取都是回归。
const ctx: EvalContext = new Proxy(
  {},
  {
    get(_, prop) {
      throw new Error(`regex dialect unexpectedly read ctx.${String(prop)}`)
    },
  },
) as unknown as EvalContext

const call = (name: string, args: Value[]): Value => {
  const f: FunctionImpl | undefined = FUNCTIONS[name]
  if (!f) throw new Error(`No function ${name} in registry`)
  return f(args, ctx)
}

const test1 = (text: string, pattern: string): Value =>
  call('REGEXTEST', [STR(text), STR(pattern)])

describe('REGEX* 字符类是 ASCII 口径', () => {
  // 改之前 Rust 的 `regex` crate 默认 Unicode 感知，这三条在 WASM 后端全是
  // TRUE、在 TS 后端全是 FALSE —— 两边都不报错，同一份工作簿静默两个答案。
  test('\\d 只认 ASCII 0-9', () => {
    expect(test1('5', '^\\d$')).toEqual(BOOL(true))
    expect(test1('\u0665', '^\\d$')).toEqual(BOOL(false)) // 阿拉伯-印度数字五
    expect(test1('\uFF15', '^\\d$')).toEqual(BOOL(false)) // 全角五
  })

  test('\\w 只认 ASCII 字母数字下划线', () => {
    expect(test1('a', '^\\w$')).toEqual(BOOL(true))
    expect(test1('_', '^\\w$')).toEqual(BOOL(true))
    expect(test1('\u00e9', '^\\w$')).toEqual(BOOL(false))
  })

  test('否定形态是肯定形态的补集', () => {
    expect(test1('\u0665', '^\\D$')).toEqual(BOOL(true))
    expect(test1('5', '^\\D$')).toEqual(BOOL(false))
    expect(test1('\u00e9', '^\\W$')).toEqual(BOOL(true))
    expect(test1('a', '^\\W$')).toEqual(BOOL(false))
  })

  // Rust 侧的大小写不敏感靠前缀 `(?i)`，而它对 `[A-Za-z]` 做 Unicode 折叠，
  // 会把开尔文记号 U+212A、长 s U+017F 折进去、否定后反而排除；JS 的 `i`
  // 不会把非 ASCII 折到 ASCII。Rust 那侧因此给 `\W` 裹了 `(?-i:…)` 才对上。
  test('\\W 叠上大小写不敏感仍与 Rust 一致', () => {
    expect(call('REGEXTEST', [STR('K'), STR('^\\W$'), NUM(1)])).toEqual(BOOL(true))
    expect(call('REGEXTEST', [STR('ſ'), STR('^\\W$'), NUM(1)])).toEqual(BOOL(true))
    expect(call('REGEXTEST', [STR('a'), STR('^\\W$'), NUM(1)])).toEqual(BOOL(false))
  })

  test('字符类内部同样是 ASCII —— Rust 侧走的是另一条改写分支', () => {
    expect(test1('\u0665', '^[\\d]$')).toEqual(BOOL(false))
    expect(test1('7', '^[\\d]$')).toEqual(BOOL(true))
    expect(test1('-', '^[\\d-]$')).toEqual(BOOL(true))
    expect(test1('\u00e9', '^[\\w]$')).toEqual(BOOL(false))
    expect(test1('\u0665', '^[\\Dx]$')).toEqual(BOOL(true))
  })

  test('词边界跟着 \\w 的口径', () => {
    expect(test1('\u00e9', '\\b\u00e9')).toEqual(BOOL(false))
    expect(test1('ab', '\\bab\\b')).toEqual(BOOL(true))
  })

  // `\s` 刻意留在 Unicode 口径：JS 本来就认 NBSP，两个引擎在这点上一致（共同
  // 偏离 PCRE2 默认的 ASCII）。单边改 Rust 反而会制造新分歧。防“顺手统一”。
  test('\\s 刻意保持 Unicode 感知', () => {
    expect(test1('\u00a0', '^\\s$')).toEqual(BOOL(true))
    expect(test1('\u2028', '^\\s$')).toEqual(BOOL(true))
  })
})

describe('REGEX* 错误码', () => {
  test('没匹配上是 #N/A，模式非法是 #VALUE!', () => {
    expect(call('REGEXEXTRACT', [STR('abc'), STR('[0-9]+')])).toEqual(ERR('#N/A'))
    expect(call('REGEXEXTRACT', [STR('abc'), STR('[0-9]+'), NUM(1)])).toEqual(ERR('#N/A'))
    expect(call('REGEXEXTRACT', [STR('abc'), STR('([0-9])'), NUM(2)])).toEqual(ERR('#N/A'))
    // 匹配上了但没有捕获组 → mode 2 无组可返回，同样 #N/A。
    expect(call('REGEXEXTRACT', [STR('abc'), STR('b'), NUM(2)])).toEqual(ERR('#N/A'))
    expect(call('REGEXEXTRACT', [STR('abc'), STR('[')])).toEqual(ERR('#VALUE!'))
    expect(test1('abc', '[')).toEqual(ERR('#VALUE!'))
    // 非法 return_mode 是参数问题，仍然 #VALUE!。
    expect(call('REGEXEXTRACT', [STR('abc'), STR('b'), NUM(3)])).toEqual(ERR('#VALUE!'))
  })

  // **已知分歧，钉住而不是修掉**：Rust 侧的 `regex` crate 是 RE2 血统，没有
  // 反向引用也没有 lookaround，这两类模式在那边一律 `#VALUE!`。这里能算出
  // 结果，而且和 Excel（PCRE2）一致 —— 所以**没有**把 TS 也改成拒绝：那只会
  // 让两个引擎一起偏离 Excel，换来“错得一致”。真正的收敛要换掉 Rust 侧的正则
  // 引擎（`fancy-regex` 支持这两类），属于依赖与产物体积的产品决策。
  test('反向引用与 lookaround 在这里可用，在 WASM 后端是 #VALUE!', () => {
    expect(test1('aa', '(a)\\1')).toEqual(BOOL(true))
    expect(test1('ab', 'a(?=b)')).toEqual(BOOL(true))
    expect(test1('ab', '(?<=a)b')).toEqual(BOOL(true))
  })

  // 另一条已知分歧，方向相反：Python 风格的命名组 `(?P<n>)` 在 Rust 与 PCRE2
  // 里合法，JS `RegExp` 拒绝。两侧都不暴露组名，所以只影响“模式编不编得过”。
  test('(?P<n>) 在这里是 #VALUE!，在 WASM 后端合法', () => {
    expect(test1('a', '(?P<n>a)')).toEqual(ERR('#VALUE!'))
    expect(test1('a', '(?<n>a)')).toEqual(BOOL(true))
  })
})

describe('REGEXREPLACE 的 $ 展开', () => {
  // occurrence=0 曾经走 JS 原生 `String.replace`：它认 `$<name>`，并把越界的
  // `$12`（只有 3 个组）拆成 `$1` + 字面 `2`。occurrence≠0 那条路一直用自家
  // 展开器，两条路自相矛盾，且都和 Rust 对不上。现在统一到展开器。
  const rep = (text: string, pattern: string, replacement: string, occ?: number): Value =>
    call(
      'REGEXREPLACE',
      occ === undefined
        ? [STR(text), STR(pattern), STR(replacement)]
        : [STR(text), STR(pattern), STR(replacement), NUM(occ)],
    )

  test('$n / $$ / $& 认，$0 与越界的 $12 原样保留', () => {
    expect(rep('SoniaBrown', '([A-Z][a-z]+)([A-Z][a-z]+)', '$2, $1')).toEqual(STR('Brown, Sonia'))
    expect(rep('abc', '(a)(b)(c)', '[$12]')).toEqual(STR('[$12]'))
    expect(rep('abc', 'b', '[$0]')).toEqual(STR('a[$0]c'))
    expect(rep('abc', 'b', '$$')).toEqual(STR('a$c'))
    expect(rep('abc', 'b', '<$&>')).toEqual(STR('a<b>c'))
    expect(rep('abc', '(?<n>b)', '<$<n>>')).toEqual(STR('a<$<n>>c'))
  })

  test('全部替换与第 n 个替换用同一套展开', () => {
    expect(rep('a1 b2', '([a-z])([0-9])', '$2$1')).toEqual(STR('1a 2b'))
    expect(rep('a1 b2', '([a-z])([0-9])', '$2$1', 2)).toEqual(STR('a1 2b'))
    expect(rep('a1 b2', '([a-z])([0-9])', '$2$1', -1)).toEqual(STR('a1 2b'))
    expect(rep('a1', '[0-9]', 'X', 3)).toEqual(STR('a1'))
  })

  test('空匹配按码点步进，emoji 不被劈开', () => {
    expect(rep('\u{1F600}', 'x*', '-')).toEqual(STR('-\u{1F600}-'))
    expect(rep('ab', 'x*', '-')).toEqual(STR('-a-b-'))
  })

  test('REGEXEXTRACT mode 1 的空匹配次数同样按码点', () => {
    expect(call('REGEXEXTRACT', [STR('\u{1F600}'), STR('x*'), NUM(1)])).toEqual({
      kind: 'array',
      value: [[STR('')], [STR('')]],
    })
  })
})
