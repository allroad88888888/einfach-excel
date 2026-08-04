/**
 * 把 REGEX* 模式里的 `\s` / `\S` 从 JS 的 Unicode 口径改写成 **ASCII 口径**。
 *
 * 为什么只有这两个：JS `RegExp` 的 `\d` / `\w` / `\D` / `\W` / `\b` / `\B`
 * 天生就只认 ASCII（不带 `u` 标志时 `i` 也不会把非 ASCII 折进 `A-Za-z`），
 * 已经落在 Excel 的口径上，不需要动。唯独 `\s` 是 Unicode 感知的 —— 它认
 * NBSP、全角空格 U+3000、行分隔符 U+2028 等 19 个额外码点。
 *
 * Excel 的 REGEX* 用 **PCRE2** 方言，而 PCRE2 的 Unicode 口径由**唯一一个**
 * `PCRE2_UCP` 开关控制，`\d`、`\s`、`\w` 三者同进同退：不开时三者一律 ASCII。
 * 10.43 起的 `PCRE2_EXTRA_ASCII_BSD/BSS/BSW` 只能在 UCP 开着时把个别转义**摁回**
 * ASCII，不能反过来单给某一个加 Unicode。所以「`\d` 是 ASCII 而 `\s` 是 Unicode」
 * 在 PCRE2 里够不到 —— 本仓既然已按 ASCII 钉死 `\d`/`\w`，`\s` 没有别的选择。
 * 实测口径（`pcre2test 10.47`，`/^\s$/utf` 不开 `ucp`）：`\s` 就是
 * HT LF VT FF CR SP 六个码点，NBSP / U+3000 / U+2028 / U+0085 全部 No match。
 *
 * Rust 半边是 `excel/rust/excel-core/src/eval_regex_ascii.rs`，两边必须同时改：
 * 改之前两个引擎在 `\s` 上**本来就不一致**（U+0085 只有 Rust 算空白，U+FEFF
 * 只有 JS 算空白），一起拉到 ASCII 是消除分歧而不是制造分歧。
 *
 * 独立成文件而不是塞进 `text.ts`：那边是 60 多个文本内建的实现，这边是「送进
 * `new RegExp` 之前模式长什么样」，两件事。
 */

/**
 * ASCII 空白集在**字符类内部**的写法：`\x20` 打头，`\t-\r` 收尾。
 *
 * 顺序是刻意的。JS 不支持嵌套字符类（Rust 那边可以写 `[[...]x]`），只能把码点
 * 摊进外层类里，于是展开的**末尾字符**会和后面的 `-` 拼出假区间：`[\s-x]` 若
 * 展开成 `[\t-\r\x20-x]`，`\x20-x` 就成了 U+0020..U+0078 的区间，字母数字全被
 * 误收（实测 `a`、`5` 都变 true）。把已完成的区间 `\t-\r` 放在最后，后随的 `-`
 * 在 JS 里只能当字面量，`[\x20\t-\r-x]` 正好是 {ASCII 空白, '-', 'x'} —— 与
 * Rust 侧嵌套类 `[[…]-x]` 的结果逐条一致（实测比对过）。
 *
 * 空格必须写 `\x20` 而不是字面空格：用户模式可能带 `(?x)`—— 虽然 JS 不认 `x`
 * 标志，但保持与 Rust 侧同源的写法，避免有人照抄时踩坑。
 */
const ASCII_SPACE_BODY = '\\x20\\t-\\r'

/**
 * JS `\s` 比 ASCII 多认的 19 个码点，穷举 0..0x10FFFF 实测得到（不是抄规范）。
 * 末尾同样以完成的区间 ` - ` 收尾，理由见 `ASCII_SPACE_BODY`。
 */
const JS_ONLY_SPACE_BODY =
  '\\u00a0\\u1680\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff\\u2000-\\u200a'

/**
 * 类**内**的 `\S`。
 *
 * 不能像类外那样写否定类 —— JS 的字符类里没法表达「除了这几个之外的一切」。
 * 但可以走并集：ASCII 的 `\S` 恰好是 JS 的 `\S` 再并上「JS 认作空白、ASCII 不
 * 认」的那 19 个码点（因为 ASCII 空白集是 JS 空白集的真子集）。于是
 * `[\Sx]` → `[\S<那19个>x]`，仍然是一个合法的 JS 正类。
 */
const ASCII_NONSPACE_IN_CLASS = `\\S${JS_ONLY_SPACE_BODY}`

/**
 * 改写 `pattern`，返回可直接交给 `new RegExp` 的模式。
 *
 * 扫描器只需要一个布尔量「当前在不在字符类里」，**不像 Rust 侧那样数嵌套深度**：
 * JS（无 `v` 标志）根本没有嵌套字符类，`[` 在类内就是字面量，`]` 一律闭合类，
 * 也没有 POSIX 的 `[:alpha:]` 记号。这个扫描器与 JS 自己的解析一致，所以边界
 * 判断不会错位。
 */
export function toAsciiClasses(pattern: string): string {
  // 没有反斜杠就没有 `\s`，热路径直接原样返回。
  if (!pattern.includes('\\')) return pattern

  let out = ''
  let inClass = false
  // 按**码元**走即可：这里只识别 ASCII 的 `\`、`[`、`]`，代理对的两半都不是
  // 这三个字符，原样透传不会被劈坏。
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === '\\') {
      const esc = pattern[i + 1]
      if (esc === undefined) {
        // 尾部孤立反斜杠：原样交给 `new RegExp` 去报错。
        out += '\\'
        break
      }
      i++
      if (esc === 's') {
        out += inClass ? ASCII_SPACE_BODY : `[${ASCII_SPACE_BODY}]`
      } else if (esc === 'S') {
        out += inClass ? ASCII_NONSPACE_IN_CLASS : `[^${ASCII_SPACE_BODY}]`
      } else {
        // 其余转义原样透传。`\\` 正是靠这条分支保住语义：它是「字面反斜杠 +
        // 字面 s」，两个字符一次性吐回，下一轮看到的 `s` 只是普通字符。
        out += ch + esc
      }
      continue
    }
    if (ch === '[' && !inClass) inClass = true
    else if (ch === ']' && inClass) inClass = false
    out += ch
  }
  return out
}
