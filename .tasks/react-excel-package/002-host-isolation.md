---
id: '002'
title: 嵌入工作簿不污染宿主页面及其他实例
kind: leaf
parent: null
depends_on: ['001']
model: gpt-6.1-sol
status: done
created: 2026-10-22
done: 2026-10-22
base: 08caefbce8cb4934ceea4f0c26115d910569a47c
files:
  - excel/react-excel/src/**
  - excel/react-excel/test/**
  - excel/react-excel/e2e/package-embedding/**
  - excel/react-excel/e2e/fixtures/plain-sales-orders/main.tsx
  - excel/react-excel/e2e/fixtures/cross-sheet-cut/main.tsx
  - excel/react-excel/e2e/workbook/name-box-scroll.spec.ts
  - excel/react-excel/e2e/workbook/sheet-tabs.spec.ts
  - excel/react-excel/e2e/workbook/sheet-history.spec.ts
  - excel/react-excel/e2e/workbook/sheet-rename-recovery.spec.ts
  - excel/react-excel/docs/package/**
  - packages/react-cells/src/**/*.css
---

# 嵌入工作簿不污染宿主页面及其他实例

## 目标与交付边界

消费001公开组件，完成真正的宿主环境隔离：局部样式、明确尺寸、实例语言/渲染配置；保留演示站原行为但不把URL/localStorage/全屏假设塞进库。
这是独立风险边界，按宿主页面不变和多实例互不影响验收，不趁机换UI设计或新增Excel功能。

## 上下文

- `src/app/app.css` 含 :root主题、* reset、body/#root滚动与尺寸；不能直接当组件CSS导出。
- `src/workbook/shell/workbook.css` 使用全局theme变量；其子域CSS需检查裸button/input/table/dialog等宿主污染。
- `src/i18n/runtime.ts` 当前创建共享i18n，并从URL/localStorage选语言，activate时改URL和存储；demo需要保留，但公共组件应显式控制。
- 两个Provider目前自行使用同一个i18n singleton。`WorkbookHeader`→`LanguageSelect`控制该singleton。
- `CellRenderer` 当前从globalThis.location的renderer参数选canvas；这应是demo选择，不是嵌入库配置来源。
- 语言/渲染状态属于展现上下文，不得新建业务workbook atom或新的controller对象。

## 覆盖矩阵行

PKG-04、PKG-05。

## 接口

### 消费

- 001根导出的Spreadsheet及Provider，`./style.css`。
- 当前Lingui I18nProvider/useLingui/Trans，不重写翻译系统。

### 产出

- `Spreadsheet`/Provider可选 `locale?:'en'|'zh'`（默认en）与 `i18n?:I18n`；明确受控locale与LanguageSelect行为，不静默丢弃宿主语言。
- 每个默认实例自己的Lingui实例，或显式宿主传入共享实例；同Store只对应一个工作簿的模型不变。
- `renderer?:'dom'|'canvas'` 的显式展现配置（默认dom）；仅demo读取URL并传入。
- 库主题变量与reset归入 `.einfach-spreadsheet` 或同等组件根；库CSS不修改 html/body/#root/:root，不锁宿主滚动。显式style/className与父容器尺寸工作。
- demo App保留全屏布局及URL/语言保存策略；应调用库入口/同一内部实现，而非复制一份工作簿。

## 验收标准

1. React单测：默认两实例en/zh独立；显式I18n注入可共享；组件不读取/改写宿主locale URL与localStorage；demo偏好仍有效。
2. 已有i18n源文案门禁与词典编译通过，新增文案走Lingui。
3. 真实DOM E2E在带宿主按钮/表格/可滚动页面内嵌两工作簿，验证宿主computedStyle与scroll不被改变，工作簿各自编辑/滚动/卸载隔离。
4. 中英1280/390和嵌入尺寸下无新增溢出/裁字；默认demo/合并格/现有编辑交互不被改写。
5. 每个可见行为在报告列出FEATURES新增行供004合并；主测试做真实DOM操作，不以atom调用冒充用户操作。

## 验证分工

- 本任务涉及嵌入布局与真实浏览器QA，执行前完整读 `/Users/dol/.codex/skills/frontend-design-codex/SKILL.md`；复用现有表格设计，不重做视觉语言。主代理已读取；截图必须真实查看，不能只列文件存在。
- 执行者：本域单测与新增定向E2E；截图留`.codex-artifacts/`，列路径与实际目视结论。
- 集成004：复用截图和用例，冻结最终输入后跑整体门禁及包级浏览器。
- reviewer：独立审全部嵌入表面、语言/URL副作用与CSS作用域；不重复跑未变检查。

## 执行记录

- 2026-10-22：001独审APPROVED后就绪派发；报告reports/001-report.md和001-review.md作为公开入口交接。基线HEAD仍08caefbc；001产品改动保留在工作区，禁止覆盖。
- 多实例修复允许上列4份旧E2E仅迁移硬编码id定位到稳定data属性，不改标题/断言/功能范围。sheet-command-error实际有aria-describedby引用（WorkbookSheetTabs），与其他标题/input一样须改实例唯一useId；保留同一错误入口的data标记，不能为少改测试留下重复ARIA目标。
- 2026-10-22：已收完整reports/002-report.md并派独审；最终定向浏览器18/18、语言/包入口59项、交互35项、库构建/词典通过，7张截图待独审实际查看。历史49项组合中38项旧场景通过，唯一UA预期错误已最终重跑修正；不把历史非零组合记为全绿。
- 2026-10-22：独审REJECTED（2 Important），详见reports/002-review.md，进入原作者修复R1。PKG-05已有证据通过，PKG-04保持未关闭；004等待修复复审，不消费未修候选。
- 2026-10-22：R1收DONE_WITH_CONCERNS；新DOM先3/3复现失败，修复后8/8及便携路径最终10/10、26项编辑单测、库构建/tsc/lint通过；指纹及3张新截图见002-report.md末节。派原独立reviewer仅复审修复与新证据，状态仍running。
- 2026-10-22：R1独审APPROVED，28项指纹/4份JSON/3张新截图已独立核实，原2 Important全部关闭，PKG-04/05本叶通过，无新增发现。状态done；匹配WASM/打包消费者和全仓门禁仍004，不能据此声明全功能可发布。

## 修复R1

完整读取reports/002-report.md和reports/002-review.md，按审查的真实DOM复现修复两项Important，原files范围不变。

- 编辑器：CellEditor坐标身份必须有实例唯一前缀，textarea/feedback/aria-describedby一致；保持坐标变化后异步提交不抢焦点的原保护。真实双实例同坐标分别失败，断言全局ID唯一、说明目标位于自身根、第二中文accessible description来自自身反馈。
- 浮层：在原定位逻辑上监听本根尺寸（必要的ResizeObserver及cleanup），不添加工作簿atom或独立定位状态系统。浏览器窗口不变、草稿保持时缩小宿主父容器宽/高，浮层四边在本根内、候选仍可点击，兄弟和宿主scroll不变。
- 可移植性：根审发现package-embedding三份spec的截图路径硬编码`/Volumes/work/self/excel`；同轮改为基于import.meta.url或testInfo的相对输出路径，保持截图/断言，在报告清楚区分行为输入未变和路径修复后的实物证据，不能把本机路径带进Linux CI。

持久DOM回归应落现有package-embedding目录；报告新增各自唯一FEATURES交接行。只跑修改影响的定向单测/DOM及必要构建类型检查，保留未变输入有效证据；完整E2E归004。将修复及精确新指纹补到002-report.md的R1节，不改002-review.md、不commit/push。

## 集成回修R2：演示测试入口显式展现配置

004完整首轮在comments/localization的1280/390用例确定性失败：等待中文名称框，而plain-sales-orders页面侧栏中文、工作簿英文。不是切换末尾或产品丢值；本叶隔离全局语言/renderer后，两个旧E2E fixture仍直接挂Provider，没有像真实PageSalesOrders一样显式注入demoPresentation。库默认en/dom是正确契约，不得为了旧fixture恢复URL/全局副作用。

最小范围只给上述两个fixture main.tsx复用现有demoPresentation，同真实演示页一致。审计所有fixture及中文/Canvas使用点，不复制策略、不改产品/文案/原spec断言或标题，不新增框架层。004先终止并保留确定失败的首轮部分JSON、核对旧冻结后才可编辑；收到根解除冻结信号前只能只读准备，不能启动第二浏览器。

修改后跑两条comments/localization原失败用例及直接受影响的中文/renderer/跨表fixture定向回归，严格不放宽超时/断言。只需本域类型/lint，不重复6496项/未改Rust与打包产物。报告R2给准确路径/指纹、失败及通过证据。004原独审者复核此最小迁移并在下次完整验收闭合，不重审不变隔离实现。原整体尝试必须记失败/主动终止，不能当自然全量通过或因工具timeout重启。
