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

- **React 主线产品与全部 17 个公开包已纳入 `0.x` 发行与消费门禁**：除已首发的 `@einfach-excel/react-excel`、`@einfach-excel/canvas` 及基础同步版本组（`@einfach-excel/spreadsheet-ui-core`、`@einfach-excel/spreadsheet-ui-styles`、`@einfach-excel/excel-core-ts`、`@einfach-excel/excel-wasm`）外，按需注入的 `@einfach-excel/xlsx` 与 11 个业务插件包（`@einfach-excel/plugin-*`）均已完成独立公开包产物化，支持 React 18.3 与 React 19、SSR 安全首次渲染及 Vite / Rspack 真实 tarball 严格安装 E2E 门禁。
- **单向 Rust/WASM 引擎架构已收敛**：工作簿值、公式求值、依赖图、筛选排序、条件格式、数据验证、结构化表与历史栈统一收敛到 Rust/WASM Worker；历史上的双后端 `SpreadsheetBackend` 抽象已废弃。
- **旧 Solid 线已暂停**：`@einfach-excel/solid-excel` 与 `@einfach-excel/excel-site` 已暂停并退出默认构建、测试、CI 与发布；`@einfach-excel/vue-excel` 作为独立视图实验保留在仓内，不阻塞 React 主线。

## 当前已覆盖的主线能力范围

当前 `@einfach-excel/react-excel` + `@einfach-excel/spreadsheet-ui-core` + `einfach-excel-core` + `plugins/*` 已交付并纳入门禁的桌面电子表格能力包括：

- **公式、重算与审核引擎**：内置公式函数目录与参数填写表单、自定义 LAMBDA 公式、异步扩展公式（`FETCHJSON`）、动态数组溢出、结构化表引用（`Table1[Col]`）、工作簿级与工作表级定义名称及命名公式、三维跨表引用、公式引用同色高亮、自动/手动计算模式与迭代计算、追踪引用/从属箭头、公式分步求值与监视窗口。
- **网格渲染、窗口与格式系统**：虚拟滚动、缩放、冻结窗格与四向独立拆分窗口、工作表分组/复制/隐藏与标签色、DOM 与 Canvas 2D 渲染表面切换、12 类数字格式（含会计专用、特殊预设与自定义格式代码）、整格与富文本分段样式（含上下标与 Table 内富文本）、缩小字体填充、斜线边框、17 种图案填充与线性/矩形渐变填充、28 项单元格样式库与工作簿主题。
- **编辑、填充与批量操作**：内联与公式栏联动编辑、时间/亚秒输入与宿主地区日期顺序解析、外部与工作簿内部跳转超链接（含工作表改名随动）、拖动移动/复制选区、插入/删除单元格四向平移、等比/工作日/按年/自定义序列填充与原生 PBE Flash Fill、剪贴板（跨表剪切、选择性粘贴、Copy As HTML/Markdown/TSV 合并与筛选隐藏保真）、撤销重做与重复上一步（`F4`/`Ctrl+Y`）。
- **数据治理、图表与浮动对象**：多列排序（含按颜色、条件图标、自定义序列、横向按行排序）、普通区域与 Table 筛选（含 Top-N、相对日期期间、按颜色、工作表条件区域高级筛选与复制输出）、分列（含本地 `.csv`/`.tsv`/`.txt` 文件导入）、分类汇总、合并计算、删除重复项、按值/公式/格式查找替换、18 项 `Go To Special` 定位条件、数据验证与圈释无效数据、条件格式、行列分组大纲、工作表保护（含按项放行排序与行列插删），以及可选插件提供的 ECharts 图表（含深色外观预设与双击元素定位设置）、浮动图片与单元格迷你图。
- **文件导入导出与本地恢复**：`initialSnapshot` + `exportWorkbookSnapshotAtom` 宿主快照恢复，以及 `@einfach-excel/xlsx` 的 `.xlsx` 高保真双向转换（覆盖值、公式、格式、文字旋转、合并、冻结、尺寸、隐藏行列、分组大纲、工作表隐藏与标签色、保护配置、外部与内部跳转超链接、备注与线程批注读入、工作簿/表级名称、计算设置、数据验证、条件格式含常见图标集、Table、常见图表/chartEx、图片与迷你图，并对不支持项输出结构化报告）。

## 下一阶段迭代方向

1. **首轮全量公开包版本发布与在线体验建设**：经授权触发 Changesets Version PR 与 CI 发布流水线，将 `0.x` 新一轮主线包、`@einfach-excel/xlsx` 及 11 个 `@einfach-excel/plugin-*` 推向 npm，并补齐公开在线演示站与宿主框架集成配方（Vite / Next.js / Rspack）。
2. **跨浏览器实机走查与大规模性能压测**：补齐 Safari / Firefox 与系统级中日文输入法候选窗实机走查，持续跟踪高密度工作簿下的长时操作与内存基线。
3. **明确不纳入当前范围的事项**：多人实时协作、身份/通知、更改记录、版本历史、个人视图、自动保存与服务端持久化、VBA/加载项/Power Query/Copilot 不作为当前产品目标；数据透视表、外部数据连接、打印与宿主自定义富值契约保持延后。

## 依据

- [架构说明](ARCHITECTURE.md)
- [React 功能进度与细项缺口](../excel/react-excel/FEATURE_PROGRESS.md)
- [React 功能点与 E2E 对照表](../excel/react-excel/e2e/FEATURES.md)
- [React 组件包消费指南](../excel/react-excel/docs/package/README.md)
- [发布流程](RELEASING.md)
- [ADR 0012：UI-core 下沉目标](decisions/0012-ui-core-extraction-target.md)
