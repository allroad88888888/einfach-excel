CHANGES_REQUESTED

# 002 独立 Review：把现役 bridge 内部化并删除旧 adapter

## 阻塞项

1. ❌ workspace lockfile 没有跟随 app manifest 更新。当前 `package.json` 已把 React/ReactDOM 放入
   dependencies，并删除 Playwright（`excel/react-excel/package.json:7-26`）；但 importer 仍把
   React/ReactDOM 放在 devDependencies，且仍声明 `@playwright/test`
   （`pnpm-lock.yaml:233-268`）。这与“删除对应 devDependency”合同
   （`.tasks/react-excel-product-structure/002-remove-adapter.md:51-54`）以及执行报告“已删除”口径
   （`.tasks/react-excel-product-structure/reports/002-report.md:11-14`）不一致，也会令 frozen-lockfile
   安装拒绝当前 manifest。需同步 `pnpm-lock.yaml`，并把它纳入报告的静态/安装一致性验证。
2. ❌ 002 写入了不可解析的完整 base SHA：任务与 index 都记录
   `dc0897d0f3c88de77db20c34cce48a174f525091`
   （`.tasks/react-excel-product-structure/002-remove-adapter.md:10`、
   `.tasks/react-excel-product-structure/index.md:61`），但该对象不存在；001 已批准落点的真实提交是
   `dc0897d08b496c77e60d8a96d8ea109c36ee8fb5`。因此要求的原始 diff 命令无法执行。下列代码审查以
   可唯一确认的真实 001 提交为基线完成，但任务/index 必须由编排者纠正，才能留下可复核审计链。

## 合同逐项审查

- ✅ 旧目录与 flat surface 真正清空：`demo/`、`e2e/`、`playwright.config.ts` 均不存在；当前
  `src/` 根只有 `main.tsx`，旧 `src/index.ts`、9 个未消费 adapter surface 与全部旧 flat bridge
  均从工作树/索引移除，未发现兼容 re-export。
- ✅ 旧测试真正清空：`test/` 只剩 `test/workbook/` 下 3 个产品测试文件；没有 package-entry、旧
  adapter unit 或旧 e2e fixture 残留。
- ✅ 8 个 bridge 是实现体迁移，不是兼容换皮：provider/context、store observer、selection、pointer、
  viewport、editing 与 grid 实现分别落入 runtime/selection/projection/editing/grid；旧符号没有 alias、
  wrapper 或 barrel。产品从 `App`、`Workbook`、`WorkbookGrid`、`useCellEdit` 直接消费新实现
  （`excel/react-excel/src/app/App.tsx:8-10,73-76`、
  `excel/react-excel/src/workbook/Workbook.tsx:11-13,32-41`、
  `excel/react-excel/src/workbook/grid/WorkbookGrid.tsx:13-18,55-63,143-149`、
  `excel/react-excel/src/workbook/editing/use-cell-edit.ts:11-14,31-43`）。
- ✅ import 与命名符合产品内部语义：source/test 对 `@einfach/react-excel`、旧 `useSpreadsheet*`、
  `SpreadsheetGridView` 等均零命中；内部模块使用精确相对 import，没有新增 barrel。
- ✅ SRP 与行数：runtime、selection、editing、projection、grid 分域明确；全部 source/test 普通文件
  ≤300 行。最大是 `use-workbook-viewport.ts` 299 行，其内容仍是单一可见投影状态机；没有
  `components/hooks/utils` 大杂烩或假拆分。
- ❌ package app 语义只完成了 manifest，尚未完成 workspace 依赖状态；`package.json` 本身的
  private/description/dependencies/scripts/无 exports/无 peer 均正确，但被阻塞项 1 的旧 importer 推翻。
- ✅ README 已切成完整产品口径，明确当前能力、presentational/未接功能、Rust-only 边界、产品目录、
  启动与 3 条验证命令；不再声称 adapter skeleton 或 public bridge surface
  （`excel/react-excel/README.md:1-17,19-32,34-64`）。
- ✅ Rust-only：产品唯一运行时入口仍直接使用 Solid 的 neutral backend 与
  `vnext-worker-runtime?worker`（`excel/react-excel/src/workbook/backend/rust-backend.ts:1-2,70-84`）；
  没有复制 Solid backend、TS engine/static backend/fallback，也没有改 UI-core、Solid 或 Rust 文件。
- ✅ 行为迁移没有语义改写：bridge diff 只改归属、导入、产品命名与类型名；1000 records、32×8 bounded
  window、末行绝对选择、双击/Enter 编辑、Enter/blur 提交刷新、Escape 取消仍由现有 3 条产品测试链
  覆盖。测试改动仅替换 provider import/name，未削弱这些产品断言。
- ✅ 报告列出的既有验证范围与本次风险匹配：typecheck/build、3 suites/12 tests、根 tsc、ESLint、
  静态扫描、行数及 diff check 都有明确结果
  （`.tasks/react-excel-product-structure/reports/002-report.md:43-54`）。本 review 按要求未重复执行它们。
- ✅ 浏览器证据具有可核实实体：报告给出的临时目录存在 1440×1000 与 390×844 两张 PNG，均显示当前
  产品入口、`Rust/WASM ready` 与 `1,000 rows`；桌面图另显示 `1,000 records`，两图没有可见横向溢出。
  滚底选择和连续两格编辑的证据是报告中的 selector/回读记录
  （`.tasks/react-excel-product-structure/reports/002-report.md:56-67`），未发现与代码、组件测试或截图矛盾。
- ✅ `git diff --check` 与 staged diff check 静态复核通过；没有发现迁移引入的新产品行为或视觉改动。

## 结论

bridge 删除与产品内部化本身可接受；修正 lockfile importer 与 002 基线 SHA 后再复审。除此之外未发现
新的产品 regression。
