# formula-functions

内置公式函数的元数据与自动补全 / 签名提示状态。

本模块**不求值**任何东西 —— 求值在引擎侧（`excel/rust/excel-core` 或
`@einfach/excel-core-ts`）。这里只有静态的函数规格表与光标位置驱动的派生状态。

## Atom classification

| Atom | Class | Notes |
|---|---|---|
| `formulaFunctionSuggestionsDismissedAtCaretAtom` | source | 用户在哪个 caret 位置按了 Esc（`null` = 未关闭） |
| `formulaFunctionSuggestionCursorAtom` | source | 补全列表里的高亮项下标 |
| `formulaFunctionSuggestionsAtom` | derived | 由公式栏草稿 + caret 位置算出的候选函数列表 |
| `formulaFunctionSignatureAtom` | derived | 当前所在函数调用的签名与高亮参数位 |
| `formulaFunctionSuggestionsActiveAtom` | derived | 补全面板是否应当显示（合并「有候选」与「未被 dismiss」） |
| `dismissFormulaSuggestionsAtom` | command | 记下当前 caret，关闭补全面板 |

全部 atom 设 `debugLabel = 'spreadsheet.formulaFunctions.<name>'`。无 per-cell 家族。

## Bounded caches

`SUGGESTION_LIMIT = 8` —— 候选列表最多 8 条。排序是**前缀匹配优先、子串匹配其次**，
然后统一截断：

```
[...startsWith, ...contains].slice(0, SUGGESTION_LIMIT)
```

这个顺序是刻意的：输入 `SU` 时 `SUM` / `SUMIF` 要排在 `CELLSUM` 这类子串命中之前。

## dismiss 为什么记 caret 而不是布尔

用 `dismissedAtCaret: number | null` 而不是 `dismissed: boolean`：用户按 Esc 关掉补全后
继续打字，caret 前移，补全应当**重新出现**。存 caret 位置让「关闭」自动在下一次输入时失效，
不需要额外的重置命令。

## 纯函数

`parse.ts` 与 `registry.ts` 是纯的，不读 atom：

- `findFunctionNameFragmentAtCaret` —— caret 处正在输入的函数名片段
- `findEnclosingFunctionCall` —— caret 落在哪个函数调用的第几个参数里
- `getFormulaFunctionSpec` / `renderFormulaFunctionSignature` —— 函数规格查询与签名渲染
- `renderActiveSignatureSlots` —— 把签名拆成带高亮标记的 slot，供宿主渲染

函数清单以 `registry.ts` 的 `FORMULA_FUNCTIONS` 为准。

## 非目标

- 不覆盖宿主注册的自定义公式 —— 那在 `src/custom-formulas/`。补全列表目前只含内置函数。
- 不做参数类型校验。签名提示是展示性的，非法参数由引擎在求值时报错。
