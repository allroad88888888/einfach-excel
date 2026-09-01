CHANGES_REQUESTED

# 001 独立审查

未重复执行报告已经跑过的 typecheck、build 或 Jest；本审查只核对任务合同、执行报告、
`git diff 1b842837fae6a90b029846a6e5298640d429f223 --`、当前工作树、路径残留、import 与物理行数。

## 阻断发现

### Important — 应用仍以 demo 自居，产品命名没有收口

目录与 TypeScript 实体虽然已从 `Demo*` / `RustWorksheet` 改成 `Workbook*`，但真正的产品入口仍把
浏览器标题写成 `Sales orders · React Excel Demo`（`excel/react-excel/index.html:7`），工作簿 header
仍显示 `React spreadsheet demo`，对应样式也仍叫 `.demo-badge`
（`excel/react-excel/src/workbook/chrome/WorkbookHeader.tsx:15,21`；
`excel/react-excel/src/workbook/chrome/header.css:81`）。这与 package 已改成 “React workbook product”
的身份不一致（`excel/react-excel/package.json:5`），因此目前仍像把 demo 换了目录与组件名，而不是把
产品身份扶正。

修复要求：根 `<title>`、header 副标题与 badge class 使用 workbook / sales-order / row-count 等产品语义；
只改命名与文案，不改变布局或增加功能。

## 逐项验收

- ✅ **业务域落位。** `App` 只负责 Rust workbook 生命周期与 Provider 边界
  （`excel/react-excel/src/app/App.tsx:28`）；`Workbook` 组合 chrome、projection、grid
  （`excel/react-excel/src/workbook/Workbook.tsx:34`）；backend、data、editing、grid、projection 均按合同
  使用精确相对 import，没有 barrel、`components/`、`hooks/` 或 `utils/`。
- ✅ **CSS 职责。** token/reset 在 `app/app.css`；workbook frame 在 `workbook/workbook.css`；原
  worksheet/footer 规则已分别进入 `grid/grid.css` 与 `chrome/footer.css`；四个 chrome component
  各自 import 对应 stylesheet（例如 `WorkbookFooter.tsx:1`）。`cell-editor.css` 只含 editor 及其
  containing-block 定位规则，没有混入 footer/chrome。
- ❌ **产品命名。** 文件、函数与测试描述已去掉旧 `Demo*` 名称，但上述入口 metadata、可见副标题与
  CSS class 仍保留 demo 身份，未满足完整产品命名。
- ✅ **包根 Vite。** 根 `index.html` 指向 `/src/main.tsx`（`excel/react-excel/index.html:11`）；config
  没有 `root: 'demo'`，输出 `dist`，dev/preview 均保持 `127.0.0.1:5183`
  （`excel/react-excel/vite.config.ts:4`）。package scripts 已改为根 `vite` / `vite build`，无 demo config。
- ✅ **app tsconfig。** 已使用 `react-jsx`、Bundler resolution、`noEmit`、`vite/client`，include 新
  `src/**/*.ts(x)`，旧 declaration-only 配置已移除（`excel/react-excel/tsconfig.json:1`）。
- ✅ **测试迁移。** 三条现役链位于 `test/workbook/{rust-backend,projection,cell-editing}.test.*`，import
  指向新产品模块，describe 名称均改成 workbook；旧三文件在工作树不存在。旧 adapter unit/e2e 仍在，
  符合 001 留给 002 的边界。
- ✅ **Rust-only。** 产品 source 唯一 runtime worker import 是
  `@einfach/solid-excel/vnext-worker-runtime?worker`，并由 `rust-backend.ts` 创建；静态扫描未见
  `@einfach/excel-core-ts`、`worker-runtime-ts`、static backend 或 runtime fallback
  （`excel/react-excel/src/workbook/backend/rust-backend.ts:1-2`）。
- ✅ **行为与范围。** 仍为 1,000 records、32-row bounded window、pointer selection、double-click / Enter
  editing、Enter/blur commit、Escape cancel；没有接 ribbon、formula、history、clipboard 或 sheet command。
  001 没有提前删除旧 adapter/e2e。
- ✅ **行数 / 单责。** 新产品 source 与迁移测试全部 `wc -l <= 300`；最大为
  `test/workbook/cell-editing.test.tsx` 289 行。`WorkbookGrid.tsx` 162 行且职责聚焦 selectable projected grid，
  未见假拆分或大杂烩。
- ✅ **demo 物理路径。** 当前工作树中 `excel/react-excel/demo` 实体目录不存在；旧 demo 文件均表现为
  删除/rename，没有兼容 re-export 或残留产品 source。
- ❌ **报告精确性（Minor）。** `001-report.md:52` 称“新产品目录与三个迁移测试共 24 个文件”；按报告
  自己列出的树与当前工作树人工计数是 22 个产品 source + 3 个测试 = 25。最大 289 行的结论不变，
  但应把计数改准。

## 复审条件

1. 去掉根 title、header 副标题与 badge class 的 demo 身份，保持 UI 布局及功能不变。
2. 把执行报告的 24 个文件修正为 25 个。

一句话回执：CHANGES_REQUESTED — 目录、CSS、Vite、测试与 Rust-only 迁移均合格，但应用入口和 header
仍明确自称 demo，产品命名尚未真正扶正。
