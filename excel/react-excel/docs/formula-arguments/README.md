# 参数填写表单

调用链：`InsertFunctionTools → runFormulaArgumentsAtom → formulaArgumentsPanelAtom → FormulaArgumentsDialog`。
确认后通过原 `startEditingAtom` 创建 formula-bar 草稿，原 Enter 提交将内容交 Rust Worker/WASM；Escape 沿原取消链退出。

Core 只保存参数草稿。每个字段取当前连接的 `nativeFunctionCatalogAtom`，自定义表达式使用同一目录中的真实形参。
缺少签名元数据的扩展仍可用旧 Insert draft 手填，不能把“无帮助”当成“零参数”。

- `layout.ts` 展开原生 prefix / repeated group / fixed suffix 签名，并组装原表达式。
- `panel.ts` 绑定连接、选区身份及目标格；管理字段、分组与确认权限。
- `FormulaArgumentsDialog.tsx` 只处理 DOM、模态焦点与命令派发。

字段输入 Excel 原表达式：文本需双引号，区域可写 `A1:A3`，跨表可写 `'Sales Orders'!G2`。
嵌套函数、转义双引号、数组内的逗号按原字符串保留；组装时不拆分字段，也不在 TypeScript 计算值。
尾部未使用的可选位置省略，中间的可选空位保留逗号。重复组内遵守真实 required/optional 元数据；LET 的 calculation 始终在最后。

浏览、取消、切换函数、生成完整编辑草稿都不写工作簿或历史。确认再次检查连接、目标选区、签名和权限；正在处理其他编辑时禁用表单。
这里没有结果预览工作簿，也不提供模态内网格引用拾取；生成后可在公式栏继续编辑。

验证：Core 专项含全部 full artifact 原生签名；React 专项覆盖真实 picker 入口、焦点、Tab/Escape、保护及草稿交接。
`e2e/formula-arguments` 保存 SUM、IF、XLOOKUP、LET、TODAY、ORDER_NET 六条独立主路径及取消、错误、文件往返、双语两宽路径。
真实浏览器、截图与最终门禁由本波次 007 合流统一执行，不以单测替代实际 Worker/WASM 交互证据。
