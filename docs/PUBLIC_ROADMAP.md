# 对外路线图

这份路线图说明仓库当前维护主线、已交付的产品表面边界，以及下一阶段的公开工作方向。
它不是发布日期、交付排期或 SLA 承诺；具体功能完备度与每个能力的 E2E 验收状态以
[`excel/react-excel/FEATURE_PROGRESS.md`](../excel/react-excel/FEATURE_PROGRESS.md) 和
[`excel/react-excel/e2e/FEATURES.md`](../excel/react-excel/e2e/FEATURES.md) 为准。

## 当前基线

产品目标定位为**单用户、可嵌入宿主的本地电子表格组件，而不是在线多人协作表格**。
仓库当前唯一产品主线是：

```text
excel/react-excel (@einfach-excel/react-excel)
  → @einfach-excel/spreadsheet-ui-core
  → Rust Worker / @einfach-excel/excel-wasm
  → einfach-excel-core
```

- **React 主线产品与独立组件包已发布**：`@einfach-excel/react-excel`（`0.1.0`）与 `@einfach-excel/canvas`（`0.1.0`）连同基础同步版本组（`@einfach-excel/spreadsheet-ui-core`、`@einfach-excel/spreadsheet-ui-styles`、`@einfach-excel/excel-core-ts`、`@einfach-excel/excel-wasm` `0.2.0`）已发布，支持 DOM 与 Canvas 2D 两种网格渲染表面，并通过 Vite 与 Next.js 真实 tarball 安装的 E2E 消费门禁验证。
- **单向 Rust/WASM 引擎架构已收敛**：工作簿值、公式求值、依赖图、筛选排序、条件格式、数据验证、结构化表与历史栈统一收敛到 Rust/WASM Worker；历史上的双后端 `SpreadsheetBackend` 抽象已废弃。
- **旧 Solid 线已暂停**：`@einfach-excel/solid-excel` 与 `@einfach-excel/excel-site` 已暂停并退出默认构建、测试、CI 与发布；`@einfach-excel/vue-excel` 作为独立视图实验保留在仓内，不阻塞 React 主线。

## 当前已覆盖的主线能力范围

当前 `@einfach-excel/react-excel` + `@einfach-excel/spreadsheet-ui-core` + `einfach-excel-core` 已交付并纳入门禁的桌面电子表格核心能力包括：

- **公式与按需求值引擎**：内置公式函数目录与参数填写表单、自定义 LAMBDA 公式、异步扩展公式（`FETCHJSON`）、动态数组溢出、结构化表引用（`Table1[Col]`）、工作簿级定义名称、跨表引用与视口驱动按需求值。
- **网格渲染与视口交互**：虚拟滚动、缩放、行列尺寸拖拽与双击自适应、隐藏/取消隐藏、合并与跨列居中、冻结窗格、手动非连续多选区、DOM 与 Canvas 2D 渲染表面切换、单元格表面插件体系。
- **编辑与批量操作**：单元格内联与公式栏联动编辑、拖动移动/复制选区、插入/删除单元格四向平移、下拉自动填充、剪贴板（含跨表剪切与选择性粘贴）、撤销重做与重复上一步（`F4`/`Ctrl+Y`）。
- **数据治理与分析工作台**：多列排序、普通区域与 Table 筛选（含 AND/OR 高级条件组）、分列、删除重复项、查找替换、仅选可见单元格与当前区域、数据验证、条件格式（含通配符、色阶、数据条、图标集）、结构化 Table、名称管理器、纯文本备注（Note）与本地批注线程（Comment）、行列分组大纲、工作表保护（含允许编辑区域）。
- **文件导入导出与本地恢复**：CSV/TSV 导入导出、`initialSnapshot` + `exportWorkbookSnapshotAtom` 宿主快照恢复，以及通过按需注入 `@einfach-excel/xlsx` 的 `.xlsx` 导入导出（覆盖值、公式、格式、合并、冻结、尺寸、隐藏行列、外部超链接、备注、工作簿级名称、数据验证、常见条件格式与 Table）。

## 下一阶段迭代方向

按 [`excel/react-excel/FEATURE_PROGRESS.md`](../excel/react-excel/FEATURE_PROGRESS.md) 的细项缺口优先级，后续公开迭代聚焦于：

1. **P1 编辑与公式深水区**：工作表分组；编辑公式时的引用着色；手动/迭代计算模式；追踪引用与从属单元格、公式分步求值与监视窗口；工作表级名称与命名公式产品入口；三维引用。
2. **P2 格式、整理与填充细项**：上下标、缩小字体填充、斜线边框、图案填充、单元格样式与主题、会计专用/特殊/自定义数字格式入口；按颜色/图标/自定义序列/横向排序、日期/颜色/前十项筛选与分类汇总/合并计算；等比/工作日/自定义序列填充、Flash Fill、窗口拆分与单元格富文本。
3. **`.xlsx` 剩余高阶对象与独立发布**：在现有两轮 `.xlsx` 能力基础上补齐图标集、内部跳转链接、线程批注读入，并推进 `@einfach-excel/xlsx` 独立包发布。
4. **明确不纳入当前范围的事项**：多人实时协作、身份/通知、更改记录、版本历史、个人视图、自动保存与服务端持久化、VBA/加载项/Power Query/Copilot 不作为当前产品目标；图表、数据透视表与打印随原计划延后。

## 依据

- [架构说明](ARCHITECTURE.md)
- [React 功能进度与细项缺口](../excel/react-excel/FEATURE_PROGRESS.md)
- [React 功能点与 E2E 对照表](../excel/react-excel/e2e/FEATURES.md)
- [React 组件包消费指南](../excel/react-excel/docs/package/README.md)
- [发布流程](RELEASING.md)
- [ADR 0012：UI-core 下沉目标](decisions/0012-ui-core-extraction-target.md)
