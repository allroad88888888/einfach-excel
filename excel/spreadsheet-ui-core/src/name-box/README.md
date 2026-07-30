# name-box

名称框（网格左上角的地址框）的 atom 层：显示当前选区地址、接受用户输入并提交跳转或定义名称。

## Atom classification

| Atom | Class | Notes |
|---|---|---|
| `nameBoxInputAtom` | source | 输入框文本 |
| `nameBoxModeAtom` | source | `'idle'` / 编辑中 —— 决定显示的是选区地址还是用户草稿 |
| `nameBoxErrorAtom` | source | 输入非法标记（布尔，不是错误码） |
| `nameBoxFocusedAtom` | source | 焦点状态 |
| `nameBoxLastCommittedAtom` | source | 上次成功提交的文本，用于 revert |
| `nameBoxSessionIdAtom` | source | 会话号，单调递增；用来丢弃过期的 blur / revert |
| `nameBoxDisplayAtom` | derived | 实际渲染的字符串：idle 时读选区地址，编辑中读输入草稿 |
| `nameBoxStateAtom` | derived | 聚合快照，给宿主一次性读取 |
| `commitNameBoxAtom` | command | 解析输入并分派：单元格 / 区间 / 已有名称 / 定义新名称 / 非法 |
| `focusNameBoxAtom` | command | 进入编辑态，返回新的 session id |
| `updateNameBoxInputAtom` | command | 受控输入 setter，带 session 校验 |
| `blurNameBoxAtom` | command | 失焦回 idle |
| `revertNameBoxAtom` | command | 丢弃草稿，回到 `lastCommitted` |

全部 atom 设 `debugLabel = 'spreadsheet.nameBox.<name>'`。无 per-cell 家族。

## 提交目标的判别联合

`commitNameBoxAtom` 不自己执行跳转，它把输入解析成 `NameBoxCommitTarget` 交给调用方：

- `NameBoxCellTarget` —— 单个地址（`A1`）
- `NameBoxRangeTarget` —— 区间（`A1:B10`）
- `NameBoxNamedRangeTarget` —— 命中已有命名区间
- `NameBoxDefineNameTarget` —— 输入是合法名称且当前有选区 → 意图是「给选区定义这个名称」
- `NameBoxInvalidTarget` —— 都不匹配

「输入合法名称等于定义名称」是 Excel 行为，也是本模块唯一有歧义的分支：它依赖当前选区，
所以 `NameBoxCommitInput` 必须带选区快照。

## Session id 为什么必要

blur 与 revert 可能在一次异步跳转之后才到达。每次 `focusNameBoxAtom` 递增 session id，
后续的 blur / revert 带上自己看到的 id，不匹配就丢弃 —— 否则一次「提交并跳转」会被随后
到达的 blur 回滚成旧地址。

## 非目标

- 不做名称的合法性完整校验（保留字、与 A1 形式冲突等）—— 那是 `named-ranges` 的职责，
  本模块只判断「像不像一个名称」。
- 不切换活动工作表。跨表地址解析出 sheet id 后，由调用方决定是否改
  `workspaceSessionAtom.activeSheetId`。
