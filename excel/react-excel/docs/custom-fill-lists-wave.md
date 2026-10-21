# 自定义填充列表预设

本批只有三项：新增并复用列表、修改列表、删除列表。预设只在当前工作簿会话内保留，
切表或关闭面板不丢；新建／成功打开另一工作簿、重新加载页面后清空。
没有增加自动保存、文件持久化、跨工作簿列表服务或拖拽自动识别。

## 手测

在 Summary 选 `E55:E59`，打开 `Series…`（填充序列），类型选 `Custom list`（自定义列表）。

1. 名称填 `Priority`，项目逐行填写 Low、Medium、High，点击“保存列表”。
   关闭再打开，或点击“新建列表”后从“已保存列表”选择 Priority，可以复用。
   点击“应用序列”才生成 Low、Medium、High、Low、Medium，保留下划线；Undo 一次恢复。
2. 将名称改为 `Urgency`，项目顺序改为 Low、High、Medium，再保存。
   只替换当前预设，不另添一份；再次应用后第二格是 High。
3. 选中预设后点击“删除列表”：只移除该预设，清空名称与项目草稿，不修改已经填入的格子。
   没有选中已保存列表时不可删除；删除后其它列表仍可选。

保存列表、修改、删除均不增加原生撤销记录，不清除已有 Redo；修改单元格仍由填充动作记录。
名称允许 1–64 个字符，大小写不敏感去重；最多 32 份预设。列表沿用 2–512 个非空、
大小写不重复项目及 16,384 字符限制，保存时去除项目边缘空白。非法草稿保留供修正。
修改草稿不改变已保存预设，只有点击“保存列表”才替换。保存不承诺源格属于列表；
点击“应用序列”时仍由 Rust 检查真实源格，拒绝后保留草稿，可以修正并重试。

## 最短链路与文件职责

`CustomFillLists → configureFillSeriesAtom → fillSelectionAtom → range.fill → Rust → 投影`

- `series-state.ts`：唯一的序列面板状态。它被配置命令和工作簿重置流程共同消费，
  因此单独放置，避免运行时依赖完整业务命令形成循环。
- `series-panel.ts`：修改填充选项，实际应用时复用原写入命令；不读工作簿值、不推断序列。
- `CustomFillLists.tsx`：仅渲染列表控件，直接使用 useAtomValue／useSetAtom，不传控制器 props。
- `reset-workbook-view.ts`：复用既有会话重置点清空预设，没有新增生命周期或重试层。

预设不是另一份工作簿数据，仅是用户下次填充的选项。无新 Worker 命令、WASM 导出或 Rust 改动。
Summary 原 E55 的 Low／下划线示例直接复用，原订单与合并 demo 不变，没有另造临时页面。

## 验收结果（2026-10-19）

基线为 `1c47e643` 加上一批已验收但未提交的独立序列改动。两批均不自动 commit／push。

- 新增 Core 测试先复现“等待填充时替换工作簿，旧响应复活预设”；使用已有状态身份
  判断丢弃旧响应后，预设／既有序列配置专项 23/23 通过。
- React 序列组件专项 13/13 通过，含新增、修改、删除、纠错及等待期间禁用。
- Lingui 新增 14 项中文翻译，严格编译通过。
- Core 全量 239 文件／3439 条、React 全量 104 文件／540 条通过；两包构建、React 类型、
  展现边界、循环依赖、Lint 及差异检查通过。新增／大改文件均低于 300 行。
- 真实 Worker 新列表专项最终 9/9 通过，包含保存／修改／删除后 Redo 仍可重放原填充结果；
  更早与既有名称序列一起执行的 21/21 也通过。专项报告为
  `/tmp/react-excel-custom-lists-final-target.log`。
- 桌面 1280px、窄屏 390px 及中文截图已目检，保存于
  `/tmp/react-excel-custom-lists.LR3JTt/`。共享视觉脚本不可用，使用持久 Playwright 截图及
  控件可见性、溢出、焦点、pageerror 断言；未添加新的视觉测试运行层。

完整 E2E 于 2026-10-19 17:31（Asia/Shanghai）启动，单轮 1093/1093 通过，耗时 27.9 分钟；
失败、跳过及 flaky 均为 0，报告含 1093 个唯一测试 ID，无报告错误。没有重启、续跑或降低断言。
日志为 `/tmp/react-excel-custom-lists-full.log`，JSON 为 `/tmp/react-excel-custom-lists-full.json`。
运行期间代码／测试／WASM 冻结，结束后再次核对，以下指纹均未改变。
`src + e2e + UI Core src` 的有序文件 SHA-1 聚合值为
`f68d9ba9a9d2718cca73e4d34117c41bbd9f69db`；lite WASM 为
`6d992f8ffd2d90f950ab18c180cc9dbddbf20c9a`。命令为：

```bash
PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/react-excel-custom-lists-full.json pnpm --filter @einfach/react-excel e2e --reporter=list,json --max-failures=1
```

Rust/WASM 源码及产物相对此前已验收的独立序列批次未变，因此沿用该批原生单测证据，
本批没有重复构建或重新宣称运行原生全量；以上浏览器验收使用真实 lite WASM。

本批三个功能已完成验收，不代表整个产品 41 项全部完成。自定义列表拖拽识别仍未实现。
文档更新不改变产品输入，不再为文档重跑完整回归。用户开发服务 `http://127.0.0.1:5183/`
最终检查返回 200，测试临时端口 5191 已释放。两批工作区改动均保留，未 commit／push。
