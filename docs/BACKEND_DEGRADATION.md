# AD-217 · 可选端口降级演示：实现了出现什么，不实现如何收场

一句话：挑三个可选端口（`pasteRange`、`searchRange`/`replaceMatches`、
`undoTransaction`/`redoTransaction`），从 src 与 ui-core 源码逐条引证
"实现 → UI 出现什么入口；不实现 → UI 如何收场"。

先说一个必须诚实的结论：**"不实现就隐藏入口"只是三种降级形态之一**。
读完源码，实际存在三种形态，本文各演示一个：

| 端口 | 降级形态 | 表现 |
| --- | --- | --- |
| `pasteRange` | **隐藏** | 菜单条目整条不渲染，快捷键静默 return |
| `searchRange` / `replaceMatches` | **禁用（三态）** | 按钮/表单控件 disabled，命令前置拦截 |
| `undoTransaction` / `redoTransaction` | **饿死** | 上游根本不记 history 条目，undo 恒不可用 |

能力探测的统一机制：Provider 挂载时（以及 backend `ready()` 之后再来一次）
把 backend 对象喂给各特性的 capture 命令 atom ——
`excel/solid-excel/src/provider/SpreadsheetUiProvider.tsx:154,174` →
`provider/capability-capture.ts:16-26`（`captureWorkbookCapabilities`，一处
列全了 pasteSpecial / spill / filterSort / sortRange / findReplace /
removeDuplicates / textToColumns / table / customFormulas 九个 capture）。
每个 capture 的探测手法都是 `typeof source?.xxx === 'function'`——**方法在
不在，就是能力有没有**，没有第二套能力协商协议。菜单栏还会在自己挂载时
重捕获一批（`menu-bar/SpreadsheetMenuBar.tsx:79-95`）。

---

## 1. `pasteRange`（选择性粘贴）——「隐藏」形态

契约注释先行（`excel/spreadsheet-ui-core/src/backend/types.ts:1225-1228`）：
"host adapters that omit this method cause the menu entry + dialog to hide via
`pasteSpecialSupportedAtom` so the surface degrades cleanly."

**探测**：`capturePasteSpecialCapabilityAtom`
（`excel/spreadsheet-ui-core/src/paste-special/session-commands.ts:59-75`）
`available = typeof source?.pasteRange === 'function'`，并顺带读可选的
`pasteRangeSupportedKinds` 声明子集。

**实现了 → 出现的入口**：

1. Edit 菜单出现 "Paste Special…"（Ctrl+Alt+V）条目。条目在清单里声明为
   能力门控：`isAvailable: 'capability'`, `capabilityKey: 'pasteSpecial'`
   （`excel/spreadsheet-ui-core/src/menu-bar/index.ts:163-169`）。
2. 键盘 Ctrl+Alt+V 直接开会话
   （`excel/solid-excel/src/grid/grid-keyboard-controller.ts:194-200`）。
3. 右键菜单拿到 `pasteSpecialAvailable`
   （`excel/solid-excel/src/context-menu/SpreadsheetContextMenu.tsx:36,77`）。

**不实现 → 如何收场**：

1. **菜单条目整条不渲染**：宿主把 `capabilityKey` 解析为
   `resolveCapability('pasteSpecial') → pasteSpecialCapability()`
   （`excel/solid-excel/src/menu-bar/SpreadsheetMenuBar.tsx:130-133`），
   渲染层 `isHidden = isAvailable === 'capability' && !resolveCapability(...)`，
   包在 `<Show when={!isHidden()}>` 里 ——
   `excel/solid-excel/src/menu-bar/menu-bar-presentation.tsx:151-156`。
   这是字面意义的隐藏，不是置灰。
2. **快捷键静默吞掉**：`case 'clipboard.pasteSpecial':` 第一句
   `if (!store.getter(pasteSpecialCapabilityAtom)) return`
   （grid-keyboard-controller.ts:195）。
3. **双保险**：即使菜单 dispatch 被别的路径触发，
   `case 'edit.pasteSpecial': if (store.getter(pasteSpecialCapabilityAtom)) ...`
   （`excel/solid-excel/src/menu-bar/menu-bar-command-edit.ts:52-54`）。

同形态的其他端口（顺带引证，menu-bar 能力键的官方对照表在
`excel/spreadsheet-ui-core/src/menu-bar/types.ts:23-44` 注释里）：
`removeRows`→Data 菜单 Remove Duplicates、`importCellChunks`→Text to
Columns（capture 见 `text-to-columns/session-command.ts:119-126`，确与注释
写的 `backend.importCellChunks != null` 一致）、`sortRange`/`insertRows`/
`insertColumns` 由菜单开合时直接 `backend.xxx != null` 现读
（SpreadsheetMenuBar.tsx:142-147）。工具栏侧也有真隐藏的例子：
`<Show when={runtime.sortSupported()}>` 包住整个排序按钮组
（`toolbar/ToolbarEntrypointGroup.tsx:70-104`）。

---

## 2. `searchRange` / `replaceMatches`（查找替换）——「禁用」形态，且是三态

**探测**：`captureFindReplaceCapabilityAtom`
（`excel/spreadsheet-ui-core/src/find-replace/basic-commands.ts:30-36`）：

```ts
hasSearch = typeof source?.searchRange === 'function'
hasReplace = typeof source?.replaceMatches === 'function'
// → 'unsupported' | 'find-only' | 'find-and-replace' 三态
```

投影给 UI 的形状：`findReplaceCapabilityProjectionAtom`
（`find-replace/projection-atoms.ts:29-33`）→
`{ findEnabled, replaceEnabled }`。

**实现了 → 出现的入口**：工具栏放大镜按钮可点
（`excel/solid-excel/src/toolbar/ToolbarEntrypointGroup.tsx:22-33`），
Ctrl+F / Ctrl+H 打开对话框（grid-keyboard-controller.ts:71-80），Edit 菜单
Find/Replace 条目（menu-bar/index.ts:196-212）。只实现 `searchRange` 不实现
`replaceMatches` 是合法中间态：查找可用，Replace 页签切不过去、替换按钮
禁用（`find-replace/FindReplaceDialogFields.tsx:27,74,142`；
`SpreadsheetFindReplaceDialog.tsx:99`）。

**不实现 → 如何收场（注意：是禁用不是隐藏）**：

1. 工具栏按钮**仍然渲染**，但
   `disabled={... || !runtime.findReplaceCapability().findEnabled}`，并挂
   `data-capability` 供测试断言（ToolbarEntrypointGroup.tsx:26-29）。
2. 正门拒开：`openFindReplaceFromEntrypointAtom` 读能力，非 find-only /
   find-and-replace 直接 `return false`（basic-commands.ts:41-47）。
3. Edit 菜单的 Find/Replace 条目声明的是 `isAvailable: 'always'`
   （menu-bar/index.ts:202,210），菜单/Ctrl+F 走 `openFindReplaceAtom`
   （menu-bar-command-edit.ts:84-90、grid-keyboard-controller.ts:78）——
   **对话框打得开**，但里面所有动作控件被 `findEnabled` 禁用
   （FindReplaceDialogFields.tsx:113,124；`SpreadsheetFindReplaceDialog.tsx:83,88,110`）。
4. 纵深防御（防宿主绕过 UI 直接 dispatch）：搜索命令前置失败
   `FIND_REPLACE_SEARCH_UNAVAILABLE`
   （`find-replace/search-commands.ts:43`）；替换命令双查
   `FIND_REPLACE_REPLACE_UNAVAILABLE` / 缺刷新搜索端口也拒
   （`find-replace/mutation-domain.ts:47-48`）。

这与 issue 描述里"UI 自动隐藏对应入口"的说法有出入：find-replace 选择的
是可见但不可用（affordance 保留、能力标注在 DOM 上），真正整条消失的是
menu-bar 的 capability 条目。写教程时不要把两者混为一谈。

---

## 3. `undoTransaction` / `redoTransaction`（历史）——「饿死」形态

这一对端口不实现时，UI 没有任何一处"隐藏 undo 按钮"的代码——按钮还在，
它只是**永远等不到可撤销的条目**，因为上游根本不让条目入栈。

**探测**（宿主侧，不走 capture atom）：
`excel/solid-excel/src/provider/history-dispatch.ts:145-156`：

```ts
backendSupportsUndo    = typeof backend.undoTransaction === 'function'
backendSupportsRedo    = typeof backend.redoTransaction === 'function'
backendSupportsHistory = 两者都有   // "A history entry is honest only when
                                    //  its whole replay contract is present."
```

**实现了（成对）→**：每次可撤销变更经 `recordHistoryEntry` 入栈
（history-dispatch.ts:171-180），`canUndoAtom` 随 `entries.length > 0 &&
cursor > 0` 变 true（`excel/spreadsheet-ui-core/src/history/index.ts:451-460`），
工具栏 undo/redo 亮起（`toolbar/ToolbarHistoryGroup.tsx:14-17`
`disabled={!runtime.canUndo()}`），Ctrl+Z / Edit 菜单走
`dispatchUndo → runUndoHistoryAtom`（history-dispatch.ts:229-238）。

**不实现（或只实现一半）→**：

1. `recordHistoryEntry` 第一句 `if (!backendSupportsHistory(backend)) return false`
   ——条目直接丢弃（history-dispatch.ts:176-178）；Core 侧的记录器同样返回
   `'unavailable'`（`provider/history-entry-recorder.ts:12-21`）。设计理由
   写在 `backendSupportsUndo` 的注释里（history-dispatch.ts:139-144）：
   "if the backend can't undo the mutation, recording an entry would leave
   Ctrl+Z lying about its outcome (HIGH #6)"——记了却撤不动，比不记更糟。
2. 于是 history 栈恒空 → `canUndoAtom` 恒 false → 工具栏 undo/redo 恒禁用。
3. Edit 菜单 undo/redo 条目是 `isAvailable: 'always'`
   （menu-bar/index.ts:113-128），点击会真的 dispatch，但
   `runUndoHistoryAtom` 对空栈回 `'blocked'`，无副作用。
4. 注意**成对性**：只实现 `undoTransaction` 不实现 `redoTransaction`，
   效果等同于都不实现（`backendSupportsHistory` 要求两者齐备）。

---

## 附：官方对这套哲学的自述

静态参考后端刻意不实现 `readSpillRegion` 的注释是这套契约最好的一句话总结
（`excel/solid-excel/src/adapter/static/ports/projection.ts:16-19`）：

> 静态引擎根本没有动态数组模型……装一个恒回 null 的实现等于谎称「这里确实
> 没有数组」。省掉端口后 `spillRegionSupportedAtom` 转 false，溢出边框与
> 投影格标记整体不出现——这就是可选端口的降级契约。

即：**端口缺席 = 功能不存在，不是错误**；宁可省掉端口，不要装假实现。
