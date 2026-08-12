# W12：打印预览菜单闭环（已完成）

> 本波删除已失效的 Wave5 工具栏按钮跳过用例，以正式菜单栏入口建立打印预览的真实浏览器回归；
> 不改变打印状态、命令分发或 Worker 协议。

| 来源 Issue                      | 唯一模型                       | 状态           | 独占范围                                     | 前置           | 交付                                                                           |
| ------------------------------- | ------------------------------ | -------------- | -------------------------------------------- | -------------- | ------------------------------------------------------------------------------ |
| UI-544 菜单栏打印预览浏览器回归 | `model-544-print-preview-menu` | 已完成 | 打印预览 E2E、工具栏壳层案例账本、本执行账本 | UI-516、UI-517 | TS/WASM 均从正式 File 菜单验证打开、Escape/Close 关闭与 File 焦点返回。 |

## UI-544 执行树

```text
打印预览菜单合同
├── A. 现状复核（完成）
│   ├── Wave5 已移除工具栏 Print Preview 按钮
│   └── 菜单栏的 toggle-print-preview 命令仍连接既有 Atom
├── B. 过期跳过清理（完成）
│   └── 删除依赖不存在 toolbar-btn-print-preview 的四条跳过用例
├── C. 浏览器闭环（完成）
│   └── TS/WASM：Escape 与 Close preview 均关闭语义预览并将焦点还给 File 触发器
└── D. 交付（完成）
    └── UI-545 在菜单激活同步捕获 File 触发器后，复核 TS/WASM、行数及独占 diff
```

## 边界

- `togglePrintPreviewAtom`、PrintConfig 读回和焦点恢复均由既有菜单/打印宿主契约持有；本波只从
  浏览器验证这些可见结果，不引入局部产品状态或绕过 Atom 的测试注入。
- 菜单栏是 Wave5 保留的正式入口。断言只使用可访问角色、已发布的 testid 和用户键盘/指针动作，
  不读取内部 store 或 Worker 状态。
- TS/WASM 任一项目若不能打开语义预览或不能把焦点还给菜单触发器，保留失败证据并报告产品缺陷，
  不用跳过或放宽断言掩盖。

## 验证证据

2026-08-12，UI-545 在 `toggle-print-preview` 的正式菜单激活路径中同步聚焦 File 触发器，供既有
Overlay 焦点恢复契约捕获；不新增产品状态，也不改 Core 或 Provider。以下命令均通过：

- `npx jest excel/solid-excel/test/vnext-print-preview-menu-focus.test.tsx --runInBand`
- `EINFACH_E2E_PORT=5175 NO_PROXY=localhost,127.0.0.1 npm run e2e -w @einfach/solid-excel -- e2e/print/print-preview-menu.spec.ts --project=wasm --reporter=line`
- `EINFACH_E2E_PORT=5176 NO_PROXY=localhost,127.0.0.1 npm run e2e -w @einfach/solid-excel -- e2e/print/print-preview-menu.spec.ts --project=ts --reporter=line`
