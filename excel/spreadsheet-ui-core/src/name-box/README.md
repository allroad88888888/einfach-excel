# name-box

名称框通过 UI Core command 定位地址／原生命名区域，也能给当前连续选区创建名称。

## 文件职责

- `address.ts`：A1 地址与坐标转换，不接触 atom 或名称语法。
- `state.ts`：输入草稿、焦点会话、错误反馈；显示名称直接由 Rust 投影派生。
- `command.ts`：校验当前目标、切表、设置选区；未知名称交给共享原生命令创建。
- `types.ts`：提交参数与返回目标。
- `index.ts`：功能公开出口。

## 状态所有权

Rust 保存名称定义和历史。这里没有名称注册表、port、前端副本或第二套撤销。
名称框、管理器共用 `named-ranges/native-command.ts` 的写入命令与忙碌状态。
`native-catalog.ts` 只读同一次返回投影，Go To 也使用这份目录。

输入、模式、焦点、最近显示、会话号、错误消息是 UI 状态。
`nameBoxErrorAtom` 是错误消息的布尔派生；`nameBoxDisplayAtom` 是目录与当前选区的派生。
输入错误保留草稿供修改；Escape 取消草稿，不撤销已经发送的原生写入。

## 提交流程

1. 检查输入会话，拒绝重复提交。地址定位不等待上一格提交收尾；创建名称仍检查编辑冲突。
2. 已有名称按 Rust 目录解析；失效目标报错，不误当成新名称。
3. A1 地址／范围检查当前画布边界，再同步切表并设置选区；React 测量 DOM 后滚动。
4. 未知非空文本给当前单一选区命名：一次 `namedRange.change`，名称语法由 Rust 校验。
5. 校验并应用返回投影；失败保留草稿，新焦点会话不被旧回复覆盖。

`commitNameBoxAtom` 对定位同步返回 `NameBoxCommitTarget`，
对创建返回 `Promise<NameBoxCommitTarget>`。React 只管理输入、滚动与焦点；
异步创建期间输入只读，成功后仅在用户仍停留于本次输入时返回网格焦点。
名称不区分大小写；现有产品只支持工作簿级矩形区域，命名公式与局部作用域仍待实现。
