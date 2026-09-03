# Rust Worker 边界

这里不保存第二套表格状态，也不认识单元格、投影或工作表。

数据主线只有一条：

```text
业务命令 → transport.ts → Web Worker
         ←  RPC response  ←
```

`transport.ts` 只负责请求编号、Promise 关联、Worker 错误和资源释放。类型化的工作簿命令
在 `../rust-workbook/`，WASM Worker 入口在 `../rust-runtime.ts`。业务能力不得塞回本目录。
