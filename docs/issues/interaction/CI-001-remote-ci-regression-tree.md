# CI-001：远程构建测试回归 Issue 树

> 范围：远程 CI 的 `test` 任务发现的三项确定性回归。
>
> 此树按可独立验证的故障边界拆分；它不替代功能 Issue，也不把两个表面问题合并成同一个修复任务。

## 树

- CI-000 远程构建测试回归
  - CI-101 选区离开动态数组后，网格清除溢出身份
  - CI-102 Worker 路径合并菜单在传送层中可被端到端测试操作
  - CI-103 Presence 初始投影保留注入 Store 的远端光标状态

## 叶子 Issue

### CI-101：选区离开动态数组后，网格清除溢出身份

- 触发链路：选中动态数组的锚点或投影格 → 将选区移到数组外 → 网格重新呈现普通单元格。
- 故障边界：后端异步刷新当前溢出区后，单元格的 `data-spill` 身份必须随缓存变化重新计算。
- 涉及表面：`SpreadsheetGrid` 单元格属性、动态数组边框。
- 验收：`vnext-spill-region.test.tsx` 断言 A1:A3 的锚点/投影标记与边框会在移到 B1 后一起消失。
- 关联交互 Issue：UI-107 特殊单元格与网格提示层。

### CI-102：Worker 路径合并菜单在传送层中可被端到端测试操作

- 触发链路：选中 B2:C3 → 打开工具栏“合并”下拉菜单 → 选择“合并后居中” → 观察合并结果并撤销。
- 故障边界：工具栏菜单通过 Portal 挂载到文档层；测试查询范围必须覆盖该真实挂载点。
- 涉及表面：`SpreadsheetToolbar` 合并菜单、Worker 适配器端到端测试。
- 验收：`vnext-worker-merge-ui.test.tsx` 能找到菜单项，完成合并、历史记录检查与 Ctrl+Z 还原。
- 关联交互 Issue：UI-307 对齐、边框、合并与尺寸工具。

### CI-103：Presence 初始投影保留注入 Store 的远端光标状态

- 触发链路：以已有远端协作状态的 Store 挂载 `SpreadsheetUiProvider` → Presence overlay 立即读取当前 sheet 的光标。
- 故障边界：首次绑定工作簿不得清空调用方显式注入的 Store；后续重绑定与卸载仍必须清理旧订阅和旧 presence。
- 涉及表面：`SpreadsheetUiProvider` 生命周期、`SpreadsheetPresenceOverlay` 当前 sheet 投影。
- 验收：两个 presence overlay 套件能覆盖初始投影、sheet 切换、重绑定和卸载清理。
- 关联交互 Issue：UI-107 特殊单元格与网格提示层。

## 验证关口

1. 相关的定向 Vitest 回归套件均通过。
2. `npm run build` 通过。
3. 完整 `npm test` 通过。
