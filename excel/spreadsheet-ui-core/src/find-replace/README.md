# 查找替换

调用链：React 事件 → `runFindReplaceAtom` → Rust Worker/WASM → atom 结果 → React 渲染。

- `state.ts`：面板草稿、打开时的查询范围、忙碌状态、当前匹配及反馈。
- `command.ts`：查找替换命令；验证范围与版本，接受当前请求的结果，发布替换投影。
- `navigation.ts`：把匹配坐标转为工作表激活、选区及滚动位置。
- `index.ts`：暴露只读面板 atom 与语义 command atom。

Rust 负责匹配、替换事务及撤销历史；UI Core 不保存工作簿副本，不维护 ticket、ledger 或重试层。
查询一次只取当前匹配，全部替换直接交给 Rust，不受查询分页大小限制。
旧 backend 的数据类型保留在 `backend/find-types.ts`，不是 React 的执行路径。

验证：`test/find-replace.test.ts`、`test/find-replace-history.test.ts`。
