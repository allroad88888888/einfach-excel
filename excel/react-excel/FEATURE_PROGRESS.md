# React Excel 主线执行记录

目标：按每批三个相关功能持续交付完整 React Excel，生产链路仅使用 UI Core atom + Rust/WASM。

## React 18 最终候选完整回归（2026-10-23，本地验收及独审通过）

同一最终候选的默认完整序列自然退出0：370文件2679/2679通过，95.5457min，
零失败、跳过、重试、flaky或report errors；同一JSON的1026/1026主绑定全部通过。
真实包44项、嵌入18项及历史三处交叉回归均包含在该次运行中；6276个冻结输入结束零差异，
自有进程已退出，5191/5193无监听。结果见`final-closeout-r1/full-results.json`及004报告。
历史STAT-019与TABLE-036本次均通过，但未复现原长停顿、未取得症状栈，原因仍unknown；
不能认定用户要求的卡顿修复已完成。最终完整门禁已获独审APPROVED_WITH_CONCERNS，
004/验收7/PKG-13本地通过，原I2按完整门禁定义关闭，历史卡顿原因仍unknown。
本地验收时尚未推送，推送状态以Git/最终交接为准；未npm发布。
本节为运行结束后的docs-only状态追加；既有tarball内文档保持打包时快照，未为文字重建或pack。
以下保留各阶段当时的交接与失败历史，不能与本次结果混用。

## React 18 包级交接历史（2026-10-23，当时尚无完整通过）

最新行头真实key已进入新React18 tarball，仓外Vite/Rspack同次44/44包级验收通过。
当时最终全量尚未通过，004/I2尚未完成、未发布；以下旧候选与完整失败历史保留，不作为新包全量证明。

## React 工作簿包候选历史（2026-10-22，当时完整验收未通过）

新增公开嵌入、样式/语言隔离及宿主 typed 读写、修改事件与控制接口；通过真实五包 pack，
仓外 Vite/Rspack 只安装其中 React/UI Core/WASM 三份 tarball。42 项包场景、18 项嵌入场景
均已包含在同一次完整真实 Worker/WASM 运行中通过，原998功能登记保留，新增28行，当前1026。
旧候选全 Vitest473文件6496项通过，Rust default/lite/native/Chrome与类型/build/静态门禁均有证据。
本次分批提交的钩子又运行474文件6504项并通过；新增项包含诊断收尾和行头身份回归，
但单测不能替代当前发行实物和完整浏览器验收。

该阶段最新完整attempt3自然结束2674通过/1超时/2断言失败，96.8133min，零跳过/重试/flaky；
同JSON的1026个主绑定通过，仍不能抵消390px格式重开、390px向左填充和冻结带插行三处失败。
结束6275个冻结输入零差异；证据为`.codex-artifacts/react-excel-package-004/full-attempt3-results.json`。
历史attempt2的名称框fill/公式栏Enter两处停顿本次均通过，但根因仍未知，不声称已修复。

三处失败随后已定向收敛并独审APPROVED_WITH_CONCERNS：修复真实行key，避免冻结切窗把row2
节点复用成row5；格式仅收敛非被测定位，填充仅让纯横向测试避开底边自动滚动。
身份回归先红后绿、相关15项单测通过；前置定向6/6、修key后冻结3/3，分属不同输入，
不拼成一次完整成功。源码改变后，旧冻结/构建/包验收不代表当前新候选。

该阶段总004/I2/验收7尚未完成：React发行实物尚未包含本次行key修复，仍缺新实物及同候选最终完整通过。
已按用户新授权分批本地commit；未push/npm发布，未应用工作区Changesets。
Rspack内部控件字号大于Vite仍是已接受的非阻断Minor，首版不承诺跨打包器像素一致。
任务账本已删除，过程报告见 Git 历史（`.tasks/react-excel-package/reports/`，最后存在于 `24d5f893`）。

## 六项进阶能力（2026-10-21，完整回归通过）

手动非连续多选、跨表剪切、原生签名参数填写、AND/OR及搜索全选筛选、通配符／显示文本格式、
真实同源JSON异步公式已按独立领域接入。新增43个主操作登记，原955个file/title保留，共998个绑定；
最终单次完整真实 Worker/WASM E2E为2617/2617通过，同一JSON逐项核验998/998主绑定，
零失败、跳过、重试或flaky；六域30/13/19/24/22/28项与7项集成交叉全部包含在这一次运行中。
完整Vitest为464文件6425/6425通过；原生default3711/0/10既有ignored、lite3671/0/10既有ignored，
底层core64/64、WASM原生205/0/1既有ignored、真实Chrome7/7均通过，没有新增忽略项。
统一lite/full构建、API签名、类型/build/lint/循环/展现层/docs/scripts/Lingui门禁已绿，
中英1280/390实际截图及代码风险/UI数据经独立审阅，无剩余阻断。
最终运行全程冻结4236个源码/测试/配置/生成包输入，结束后0指纹差异；测试服务已停止。
本版证据根为`.codex-artifacts/react-excel-next-version.11oYiO/`，完整结果`007-e2e-final.json`，
审计`007-final-result-audit.json`；文档收尾不重跑稳定产品。前版数字保留为历史，不冒充当前结果。
本轮未commit/push，不等于整个功能计划或Office兼容范围完成。

## 前版七项扩展最终候选（2026-10-21，完整回归通过）

备注、原生工作表保护、高级条件格式、公式数据验证、完整参数帮助、工作簿自定义表达式及本地线程批注
已从既有 React → Core → Worker → Rust 链路接入。已合并131个新增独立操作登记，保留原824个唯一主绑定；
955项登记已逐项核验最终同一报告中的成功结果。完整参数帮助的内部构件目录检查不冒充用户入口，原插入/搜索/取消入口不重复登记。
七项共用原生历史、结构与文件恢复，备注与批注独立；保护不进入内容Undo，工作簿文件的保护最后恢复。
最终单次真实 Worker/WASM 完整 E2E 为2474/2474通过，零失败、跳过、重试或flaky；
备注26、保护26、高级条件格式70、高级验证34、参数帮助16、自定义公式31、批注51及跨域共存2项全部通过。
1280/390中英截图已独立审阅，包含验证提示与Stop同显/滚动、中文表单及帮助底部动作/实现限制。
原生默认3646/0/10 ignored、lite3606/0/10 ignored、WASM205/0/1 ignored及Chrome7/7均通过；ignored为既有生成器/基准测试，不新增跳过。
Core修复后的根六project6261项、最终受影响React615项、scripts17项及类型/构建/lint/循环/展现层/文档门禁均有持久证据；不把分段结果拼成最终完整通过。
最终运行全程冻结2579个源码/测试文件、发布lite/full WASM及21个执行配置，结束后逐文件校验全通过。
显式尺寸历史权限与内容/格式派生行高的交叉边界已有原生回归；本轮未提交或推送，也不等于整个41项计划完成。

## 范围与完成口径

- 原 React 三项启动任务已完成，不能据此宣布完整产品完成。
- 完整功能范围暂以[历史在线 Excel 清单](../solid-excel/docs/archive/online-excel-parity/README.md)
  的 41 项为核对索引；只引用功能范围，不继承 Solid 的实现状态或架构。
- 用户如指定另一份计划，以指定计划为准。Solid、Vue、介绍站当前不作为本目标的交付对象。
- 每项必须有 React 入口、真实 Rust 行为、可复现测试，才能记为完成；部分入口或只有核心单测
  一律记为部分完成。外部数据、身份、持久化服务不能用本地假数据替代验收。
- 下面按原编号合并展示相关项，不删减原清单；原计划明确延后的外部连接保留为延后状态。
- 2026-10-29 用户裁定：产品目标是单用户可嵌入的本地表格组件，**不是在线协作表格**。协作、身份/通知、
  更改记录、版本历史、个人视图、自动保存与服务端持久化全部暂停，不计入剩余工作（#35 协作部分、#37–39、#41 服务端部分）。

## 持续验收 goal（2026-10-20，既有入口验收已完成）

用户要求连续推进至整个既有入口的验收目标，不在每三个功能后结束 turn。
三项一批仅作为验证单位，不作为结束整体目标的条件。本轮已完成当前源码入口矩阵核对及最终候选
完整回归：2218/2218 通过，824 个登记操作逐项有唯一主用例的成功证据；没有跳过、失败或重试。
下列保留分批执行经过，其中“继续／待验收”等描述是当时状态，最终结果以下方“最终候选全量验收”为准。
不扩为实现未完成功能，不自动 commit／push。原自定义列表三项 goal 已结束，不能沿用它的完成状态
冒充当前整体目标完成。当前从界面源码逐项核对，不按测试数量倒推范围。

- 数字格式 Tab／Shift+Tab／非法小数位纠正：含桌面、窄屏及原格式交叉回归共 60/60 通过，报告 `/tmp/react-excel-number-dialog-complete.json`。同报告包含原生拒绝后重试、处理中禁止重复及取消、空白／文本／错误值只读预览，分别登记 NUM-022..024；复用已执行的独立用例，不为登记数重复测试或新增生产层。当前继续定位的命名失效交叉回归。

- 条件格式启用／停用／复制：新增六条桌面／窄屏用例，管理文件 12/12 通过。
  证据 `/tmp/react-excel-cf-management-independent.json`；未改生产代码。
- 规则上移／下移／新草稿重置：新增六条，管理文件 18/18 通过。
  证据 `/tmp/react-excel-cf-priority-independent.json`；未改生产代码。
- 名称管理器新增／改名／删除：新增六条，名称管理文件 12/12 通过。
  证据 `/tmp/react-excel-names-independent.json`；直接使用原生名称种子，未改生产代码。
- 范围修改／工作表修改／新草稿重置：复用范围独立用例并新增四条，名称管理文件 16/16 通过。
  证据 `/tmp/react-excel-names-targets-independent.json`；未改生产代码。
- Table 创建／改名／转普通区域：新增六条，Table 文件 11/11 通过。
  证据 `/tmp/react-excel-tables-independent.json`；转换后的数值、格式、引用和历史均验证。
- 文件下载／新建／打开入口已独立验收：宽屏和窄屏验证下载不清历史、新建取消及确认、取消后重新选择同一文件打开。文件用例共 11/11 通过，证据 `/tmp/react-excel-files-independent.json`。
- 水平左对齐／居中／右对齐：新增六条独立用例，格式文件 13/13 通过；证据 `/tmp/react-excel-horizontal-independent.json`。
- 垂直顶端／居中／底端对齐：新增六条独立用例，格式文件 19/19 通过；证据 `/tmp/react-excel-vertical-independent.json`。
- 自动水平对齐／默认垂直对齐／取消文字旋转：格式交互 14/14 通过，证据 `/tmp/react-excel-layout-restore-independent.json`。
- 文字旋转 -90°／-45°／45°：格式文件 25/25 通过，证据 `/tmp/react-excel-rotation-independent.json`。
- 文字旋转 90°／竖排文字／增加缩进：格式及文本文件共 37/37 通过，证据 `/tmp/react-excel-rotation-indent-independent.json`。
- 减小缩进／增大字号／减小字号：字号及文本文件共 27/27 通过，证据 `/tmp/react-excel-font-actions-independent.json`。
- 细线／中线／粗线边框：边框文件 24/24 通过；证据 `/tmp/react-excel-border-solid-independent.json`。
- 虚线／点线／双线边框：边框文件 30/30 通过；证据 `/tmp/react-excel-border-pattern-independent.json`。
- 按活动格冻结／取消冻结／拆分合并单元格：视图文件共 13/13 通过；证据 `/tmp/react-excel-freeze-unmerge-independent.json`。
- 确认合并／取消合并／删除列：合并及结构文件共 20/20 通过；证据 `/tmp/react-excel-merge-structure-independent.json`。
- Table 面板／格内／公式栏的列重命名：列操作文件 10/10 通过；证据 `/tmp/react-excel-table-column-entry-independent.json`。
- Table 范围调整／添加数据行／重置新草稿：相关文件共 25/25 通过；证据 `/tmp/react-excel-table-structure-independent.json`。
- Table 样式预设／行条纹／首列强调：外观文件 15/15 通过；证据 `/tmp/react-excel-table-style-independent.json`。首轮测试对白色邻格的错误假设已修正为操作前后值比较，未改生产实现。
- Table 列条纹／末列强调／隐藏表头：相关文件 17/17 通过；证据 `/tmp/react-excel-table-header-style-independent.json`。测试改为点击后等待 Rust 投影状态，未把同步勾选假设改入生产链路。
- Table 显示表头／显示汇总行／隐藏汇总行：相关文件 23/23 通过；证据 `/tmp/react-excel-table-visibility-independent.json`。
- Table 不汇总／求和／平均值：桌面／窄屏 6/6 通过；证据 `/tmp/react-excel-table-total-basics-independent.json`。
- Table 非空计数／数值计数／最大值：函数文件 12/12 通过；证据 `/tmp/react-excel-table-total-counts-independent.json`。
- Table 最小值／标准差／方差：九选项及汇总交叉回归 31/31 通过；证据 `/tmp/react-excel-table-total-statistics-independent.json`。
- React 类型、展现层边界、循环依赖、文档链接、差异及 29 个改动测试文件 Lint 通过；测试三行长度超限已修正，最大测试文件 275 行。
  生产源码指纹仍为 `d9329e109bbad7e32606de0d71932aac14fd2305`，lite WASM 仍为 `6d992f8ffd2d90f950ab18c180cc9dbddbf20c9a`；本 goal 未改生产代码。
- Go To 命名区域／名称框命名跳转／名称管理器 Table 定位：相关文件 17/17 通过；证据 `/tmp/react-excel-named-navigation-independent.json`。未选中格实际省略属性，补强测试修正了对 `false` 字符串的错误假设，未改生产实现。
- 仅公式／公式与数值格式／值与数值格式三种粘贴：补单次撤销与不受影响字段检查，相关文件 8/8 通过；证据 `/tmp/react-excel-formula-paste-independent.json`。
- 超链接新增／修改／移除：桌面／窄屏及旧交叉回归 13/13 通过；证据 `/tmp/react-excel-hyperlink-actions-independent.json`。
- Ctrl/Command 点击链接／快捷键插入链接／弹窗链接打开新标签页：相关文件 17/17 通过；证据 `/tmp/react-excel-hyperlink-entries-independent.json`。
- 取消链接草稿／Escape 丢弃草稿／非法地址拒绝后重试：超链接文件 19/19 通过；证据 `/tmp/react-excel-hyperlink-recovery-independent.json`。
- 快捷公式 SUM／AVERAGE／COUNT 下拉入口：相关文件 9/9 通过；证据 `/tmp/react-excel-quick-formula-independent.json`。
- 百分比／货币／千分位三个快捷按钮：专项 3/3 通过；证据 `/tmp/react-excel-number-shortcuts-independent.json`。
- 增加小数位／减少小数位／恢复常规格式：桌面／窄屏及相关回归 9/9 通过；证据 `/tmp/react-excel-number-precision-independent.json`。
- 日期快捷按钮／日期样式设置／文本格式设置：格式会话与错误恢复文件 14/14 通过；证据 `/tmp/react-excel-date-text-formats-independent.json`。
- 自动求和按钮／函数选择器插入草稿／取消函数选择器：相关文件 18/18 通过；证据 `/tmp/react-excel-formula-drafts-independent.json`。
- 函数搜索／分类筛选／列表选择：函数文件 11/11 通过；证据 `/tmp/react-excel-function-catalog-independent.json`。
- 格内补全／公式栏补全／Escape 关闭函数选择器：函数文件 17/17 通过；证据 `/tmp/react-excel-formula-completion-independent.json`。
- 本阶段类型检查通过；36 个改动测试文件 Lint 发现小数位测试一处超长循环声明，已整理。该文件及本批颜色／边框测试 Lint 复检通过，差异检查通过。
- 无填充／自动文字色／快捷边框：格式与色板文件 44/44 通过；证据 `/tmp/react-excel-color-resets-independent.json`。
- 填充预设色／文字预设色／自定义填充 Hex：桌面／窄屏 6/6 通过；证据 `/tmp/react-excel-color-application-independent.json`。颜色应用写入放在独立的 `color-application.spec.ts`，旧色板文件保留交叉与恢复场景。
- 自定义文字 Hex／原生填充颜色控件／原生文字颜色控件：颜色应用文件 12/12 通过；证据 `/tmp/react-excel-custom-color-independent.json`。
- 色板关闭按钮／遮罩／Escape 三种取消入口：色板文件 22/22 通过；证据 `/tmp/react-excel-palette-dismissal-independent.json`。
- 文本条件格式包含／不包含／开头是：相关文件 10/10 通过；证据 `/tmp/react-excel-conditional-text-independent.json`。补中间片段、前缀、后缀与原始空格样本，避免测试数据无法区分匹配算法。
- 结尾是／重复值／唯一值条件格式：相关文件 14/14 通过；证据 `/tmp/react-excel-conditional-duplicates-independent.json`。
- Stop if true／公式条件／前 N 项排名：相关文件 27/27 通过；证据 `/tmp/react-excel-conditional-rule-kinds-independent.json`。排名使用与种子不同的绿色，撤销逐格恢复原色，避免既有红色规则掩盖结果；首轮错误的清空颜色假设已修正，未改生产实现。
- 前百分比／后 N 项／后百分比排名：排名文件 8/8 通过；证据 `/tmp/react-excel-conditional-rank-options-independent.json`。
- 双色阶／三色阶／数据条：视觉条件文件 16/16 通过；证据 `/tmp/react-excel-conditional-visual-kinds-independent.json`。
- 数值条件大于／小于／等于：桌面／窄屏 6/6 通过；证据 `/tmp/react-excel-conditional-comparison-basic-independent.json`。
- 不等于／大于等于／小于等于：数值条件文件 12/12 通过；证据 `/tmp/react-excel-conditional-comparison-inclusive-independent.json`。
- 介于／不介于／取消规则草稿：相关文件 24/24 通过；证据 `/tmp/react-excel-conditional-bounds-cancel-independent.json`。
- Escape／条件文字颜色／越界范围纠正重试：相关文件 21/21 通过；证据 `/tmp/react-excel-conditional-recovery-independent.json`。
- 条件规则、排名、视觉种类与数值比较的对应主用例结果已分文件核对；没有拿旧报告替代后来新增的选项。React 类型检查通过，44 个改动测试文件均不超过 300 行；Lint 发现旧视觉用例两处超长断言，已仅换行修正，复检进行中。
- 生产源码与 lite WASM 指纹仍为 `d9329e109bbad7e32606de0d71932aac14fd2305`／`6d992f8ffd2d90f950ab18c180cc9dbddbf20c9a`。当前继续整数／小数／列表规则创建的独立验收。
- 上述阶段的展现边界、循环依赖、文档链接、44 个改动 E2E 的 Lint 均通过（视觉用例仅换行复检）。
- **真实缺陷，修复验收中**：创建规则测试在 D46 复现自动扩列表头绕过验证；独立浏览器用例又在 B80 复现已有表头改名绕过验证。失败证据 `/tmp/react-excel-validation-create-basic-independent.json`、`/tmp/react-excel-table-header-validation-before.json`。原生修复前专项 1 通过／2 失败，日志 `/tmp/table-header-input-validation-before.log`。
  根因是两个表头输入分支直接更新 Table 元数据／快照，没有调用既有 `validate_input_value`。仅在 Rust 用户输入入口校验最终规范化文字，未加 React／Core 拦截层。原生专项及扩表、插表头、首行输入、架构相关测试 37 通过（架构原有 1 条忽略），API 签名不变；日志 `/tmp/table-header-input-validation-after.log`。
  lite/full WASM 重建通过，指纹为 `b39441a7ed61a241fd16ebe1df4e604691ae4ef5`／`c67c17cf62ef1b113ab507fd8cf4ef68bae23245`；58/58 相关浏览器回归通过，包含两种表头的桌面／窄屏拒绝、redo 保留、正确文字重试和单次撤销、lite/full 保存恢复。报告 `/tmp/react-excel-table-header-validation-after.json`。React 类型及新增两文件 Lint 通过；旧 WASM 全量报告不冒充新产物的全量通过。
- 整数／小数／列表规则创建：上述 58 条包含本批六项独立验收。继续日期／时间／文本长度；普通输入边界在 D45 检查，表头绕过保留独立专项，避免拒绝原因互相掩盖。
- 日期／时间／文本长度规则创建：六种创建方式共 12/12 通过；证据 `/tmp/react-excel-validation-create-typed-independent.json`。
- 清除验证／取消草稿／Escape 退出：规则文件 18/18 通过；证据 `/tmp/react-excel-validation-rule-lifecycle-independent.json`。
- 忽略空白启用／禁用与非法日期／时间边界纠正重试：相关文件 38/38 通过；证据 `/tmp/react-excel-validation-blank-recovery-independent.json`。
- 验证条件介于／不介于／等于：比较文件 15/15 通过；证据 `/tmp/react-excel-validation-comparisons-independent.json`。上下界分别验证，拒绝后直接纠正同一草稿，等值重试未增加历史。
- 不等于／大于／大于等于已有独立主用例，本次 15 条也全部执行；逐项登记并复用同输入结果，不重复启动浏览器。
- 小于／小于等于同样复用本次比较文件结果；修改验证范围及规则文件 24/24 通过，证据 `/tmp/react-excel-validation-range-independent.json`。
- 27 个验证功能与两种 Table 表头输入约束共 29 项已核对各自最新文件结果（同一新版 WASM，非拼接冒充一次全量）。Core 相关 Vitest 115/115、React 相关 24/24、类型、48 个改动 E2E 的 Lint／300 行限制、展现边界、文档链接、差异检查通过。
- 降序排序／自定义多级排序／区分大小写：相关文件 19/19 通过；证据 `/tmp/react-excel-sort-entry-independent.json`。补单次撤销／重做、样式跟随及未选中区域不变；选项先切到反向草稿再选目标，避免依赖默认值通过。
- 空白排前／排后复用本次独立结果；添加排序层级桌面／窄屏 2/2 通过，证据 `/tmp/react-excel-sort-add-level-independent.json`。
- 删除／上移／下移层级：层级文件 8/8 通过；证据 `/tmp/react-excel-sort-level-actions-independent.json`。实际排序、焦点、样式和单次历史均检查。
- 首行表头选项／取消／Escape：选项文件 14/14 通过；证据 `/tmp/react-excel-sort-header-dismissal-independent.json`。表头选项包含勾选／取消勾选的桌面／窄屏变体，未提交键和选项不污染数据或历史。
- 弹窗排序列／升序／降序字段：选项文件 20/20 通过；证据 `/tmp/react-excel-sort-key-fields-independent.json`。表头与排序字段测试共用本文件内的原始记录断言，未加生产层。
- 设置选区筛选／表头列筛选／清除单列筛选：相关文件 12/12 通过；证据 `/tmp/react-excel-filter-range-actions-independent.json`。范围外数据、其它列条件、撤销及重做均检查。
- 包含文字／数值区间／值列表筛选及原有交叉回归 16/16 通过；证据 `/tmp/react-excel-filter-condition-kinds-independent.json`。检查数值上下界、样式、范围外公式及单次历史。
- 筛选大小写选项／添加条件／移除条件：条件文件 12/12 通过，证据 `/tmp/react-excel-filter-condition-actions-independent.json`。首轮测试误依赖当前活动列，已改为实际选择 A 列；未改生产代码。
- 筛选取消／Escape／非法区间纠正重试：桌面／窄屏 6/6 通过；证据 `/tmp/react-excel-filter-recovery-independent.json`。既有筛选与 redo 保留，纠正后只产生一次操作。
- 候选值展开／收起／搜索按钮：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-filter-value-controls-independent.json`。浏览与搜索不先写工作簿，收起保留草稿原值。
- 候选值勾选／选择当前页／清空选择：候选控件文件 12/12 通过，证据 `/tmp/react-excel-filter-value-selection-independent.json`。空集合筛掉所有数据行，撤销恢复；与清除筛选区分。
- 候选值 Enter 搜索／下一页／上一页及旧交叉回归 12/12 通过，证据 `/tmp/react-excel-filter-value-paging-independent.json`。1,000 个 ID 的页界、跨页选择、页外搜索及单次历史均检查。
- Table 表头筛选／清除目标 Table 筛选／重新应用及相关回归 12/12 通过，证据 `/tmp/react-excel-table-filter-actions-independent.json`，包括 lite/full 快照恢复。新增重做检查首轮插入位置错误，已调整为撤销之后执行；未改生产代码。
- Table 单列清除／取消／Escape 及相关回归 16/16 通过，证据 `/tmp/react-excel-table-filter-recovery-independent.json`。冲突条件解除后对应记录恢复，汇总正确，原规则与 redo 保留。
- 创建行分组／创建列分组／取消行分组：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-outline-group-actions-independent.json`。种子 A4 本身是文本 `00123`，测试已按实际种子校正，未改生产代码。
- 取消列分组／全部折叠行／全部展开行：相关文件 12/12 通过，证据 `/tmp/react-excel-outline-membership-bulk-independent.json`。手动隐藏保留，重复状态不制造历史或清 redo。
- 全部折叠列／全部展开列／侧边按钮折叠行子组：相关文件 10/10 通过，证据 `/tmp/react-excel-outline-column-bulk-toggle-independent.json`。菜单与侧边按钮独立验收。
- 侧边行展开／列折叠／列展开：侧边文件 8/8 通过，证据 `/tmp/react-excel-outline-gutter-actions-independent.json`。窄屏横向滚动、焦点回表格、手动隐藏和单次历史均检查。
- 行大纲第 1／2／3 级：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-outline-row-levels-independent.json`。分别验证外组折叠、子组折叠、全部展开；第三级先折叠再验证实际变化。
- 列大纲第 1／2 级／部分重叠拒绝后纠正及交叉回归 25/25 通过，证据 `/tmp/react-excel-outline-level-recovery-independent.json`，包含 lite/full 保存恢复、空投影恢复及投影竞态。拒绝不清 redo，纠正后一次提交。
- 查找当前工作表范围／原始选区范围／区分大小写及原有替换回归 14/14 通过，证据 `/tmp/react-excel-find-scope-case-independent.json`。导航后原始选区稳定，数据与历史不变。
- 匹配整个单元格／通配符／按显示值查找：选项文件 12/12 通过，证据 `/tmp/react-excel-find-match-options-independent.json`；星号、问号、转义及显示结果均检查。
- 源码查找／非法公式替换原子回滚及纠正／显示值替换拒绝后改为源码替换及相关回归 22/22 通过，证据 `/tmp/react-excel-find-source-recovery-independent.json`。失败前先将 A85 定位进虚拟视口，以便失败后立即检查未部分修改；未改生产代码。
- 查找全部／结果第一页／上一页：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-find-first-previous-independent.json`。旧综合分页用例保留交叉回归，页界、选中位置与无历史分别核对。
- 查找结果下一页／最后一页／点击结果定位及旧回归 17/17 通过，证据 `/tmp/react-excel-find-result-actions-independent.json`。末页 99 条、实际可见目标、Unicode 原值与无历史均检查。
- 查找下一个按钮／上一个按钮／Enter：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-find-navigation-independent.json`。同格多次匹配、首尾循环、原值与无历史均检查。
- 工具栏打开查找／Ctrl+F／Command+F：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-find-panel-entries-independent.json`。初始焦点、关闭后原选区及原值不变。
- Ctrl+H／Command+H／鼠标替换标签：面板入口文件 12/12 通过，证据 `/tmp/react-excel-find-replace-entries-independent.json`。只切面板、草稿保留，未提交替换不写数据。
- 鼠标查找标签／关闭按钮／Escape：面板文件 18/18 通过，证据 `/tmp/react-excel-find-panel-dismissal-independent.json`。退出后实际重做成功，草稿未破坏原值或历史。
- 标签右箭头／左箭头／Home：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-find-tabs-independent.json`，焦点、roving tabindex、标签与面板同步。
- End／Tab 首尾循环／Shift+Tab 反向循环及旧可访问性回归 14/14 通过，证据 `/tmp/react-excel-find-focus-cycle-independent.json`，焦点不逃出弹窗，草稿与原值不变。
- 空查询禁用后纠正／超长 UTF-8 查询拒绝后纠正／无匹配后纠正：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-find-query-recovery-independent.json`。旧结果失效，英文与中文字节上限分别验证，redo 保留。
- 查找 39 个主验收已逐项核对各文件最新报告成功，无跳过／重试；不是一次全量运行。React 类型、70 个改动 E2E 的 Lint／300 行限制通过；Core 查找／大纲相关 Vitest 44/44、React 查找／历史相关 16/16 通过，日志 `/tmp/react-excel-find-outline-core-vitest.log`、`/tmp/react-excel-find-history-react-vitest.log`。
- 撤销按钮／重做按钮／最近操作列表：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-history-actions-independent.json`。跨表重算、原表格式、原生地址及列表不改历史均检查。
- 关闭历史按钮／Escape／Ctrl+Z：相关文件 12/12 通过，证据 `/tmp/react-excel-history-dismissal-independent.json`。焦点回列表触发器、redo 与原格格式保留。
- 当前继续 Command+Z／Ctrl+Y／Ctrl+Shift+Z，逐个真实按键验证单次原生历史。
- **真实缺陷，已修复**：窗口大小改变后的投影保留帧会吞 Ctrl/Command+Z；普通快捷键用例曾偶发失败，独立控序的真实 Worker 浏览器用例稳定复现（`/tmp/react-excel-history-resize-before.json`），Core 新增两条也均先失败（`/tmp/react-excel-history-key-core-before.log`）。根因是撤销与格内编辑共用了 `allowEditing` 限制；只移除历史分支这一限制，仍由原 `runRustHistoryAtom` 检查编辑会话、忙碌与保护状态，不添加状态或重试层。
- 上述快捷键及保留帧缺陷修复浏览器 10/10 通过（`/tmp/react-excel-history-shortcuts-fixed.json`）；Core 60/60、React 12/12、React 类型检查通过。React 控序测试按真实 Worker 顺序先送达在途读取、后送达历史操作结果。继续 Command+Shift+Z／Command+Y／撤销后重新编辑分支。
- Command+Shift+Z／Command+Y／新编辑清除旧重做分支及既有历史交叉回归 21/21 通过，证据 `/tmp/react-excel-history-remaining-independent.json`。继续状态栏总数／数值个数／求和显示开关独立验收。
- 总数／数值个数／求和显示开关：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-statistics-count-preferences.json`。继续平均值／最小值／最大值开关。
- 六个统计显示开关 12/12 通过，证据 `/tmp/react-excel-statistics-extrema-preferences.json`。继续打开／完成／Escape；勾选即时生效，关闭保留配置及原生 redo。
- 统计设置入口及开关文件 18/18 通过，证据 `/tmp/react-excel-statistics-settings-entries.json`；三个入口均验证真实 redo 仍能执行。继续复制总数／数值个数／平均值，分别经真实系统剪贴板粘贴并检查单次历史。
- 复制总数／数值个数／平均值：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-statistics-copy-counts.json`。继续最小值／最大值／恢复全部默认显示；旧综合设置用例保留交叉回归，不再替代恢复默认的独立主验收。
- 最小值／最大值／恢复全部默认显示及统计交叉回归 37/37 通过，证据 `/tmp/react-excel-statistics-complete-actions.json`。包含精度、权限恢复、旧剪切状态及实际重做；原生统计接口的浏览器测试继续保留，但不能代替整列统计的真实 DOM 主验收。
- 整列统计／权限失败重试／旧剪切状态文件 8/8 通过，证据 `/tmp/react-excel-statistics-offscreen-recovery.json`。初轮预期 1001 有误：原 demo 的 A341:A940 合并中 599 个覆盖格本为空，非空总数 402 正确；仅修正测试预期，保留原合并示例。
- 统计 19 个主验收已逐项核对最新文件报告成功。Core 相关 37/37、React 15/15、React 类型、展现边界、76 个改动 E2E 的 Lint／300 行限制通过；Lint 两处超长行已仅换行并复检。日志 `/tmp/react-excel-statistics-history-core-vitest.log`、`/tmp/react-excel-statistics-history-react-vitest.log`、`/tmp/react-excel-history-statistics-lint-recheck.log`。新增重做保留帧 Core 分支后，历史专项 22/22 通过（`/tmp/react-excel-history-key-redo-core.log`），浏览器完整历史专项运行中。
- 当前候选历史操作完整专项 35/35 通过，证据 `/tmp/react-excel-history-current-candidate.json`；包含刷新期间撤销及重做、六种键盘组合、编辑器草稿保护和跨功能历史。继续溢出详情打开／失败后刷新／选区域三个真实入口。
- 历史 14 个主验收均已核对本次 35 条报告成功。溢出详情打开／读取失败后刷新／选择原生区域：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-spill-read-range-independent.json`。继续定位公式格／定位阻挡格／关闭按钮；定位不得修改阻挡内容、隐藏列或重做记录。
- 定位溢出公式格／阻挡格／关闭按钮：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-spill-navigation-independent.json`。继续 Escape／Tab／Shift+Tab；焦点不能逃出对话框，退出仍保留原值及 redo。
- Escape／Tab／Shift+Tab 及溢出旧回归 27/27 通过，证据 `/tmp/react-excel-spill-dialog-complete.json`，包含 lite/full 原生一格数组、数组收缩／恢复、隐藏列和清除阻挡的历史链。继续普通格／草稿禁用／超画布定位拒绝三项边界。
- 普通格／草稿禁用／超画布拒绝后继续定位：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-spill-availability-independent.json`。取消草稿回读原公式而非显示文本；超画布范围不被悄悄截断，失败不增加历史，正常定位与单次撤销／重做仍可用。
- 溢出 12 个主验收已按最新文件报告核对成功；Core 40/40、React 5/5、类型及两个新增 E2E Lint 通过，日志 `/tmp/react-excel-spill-core-vitest.log`、`/tmp/react-excel-spill-react-vitest.log`、`/tmp/react-excel-spill-typecheck.log`。继续预设边框颜色／Hex／原生颜色控件。
- 边框预设色／Hex／原生颜色控件：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-border-colors-independent.json`；1px 单边、原值／原样式、邻格、单次撤销重做及原生设置回读均检查。继续取消／Escape／非法 Hex 纠正。
- 边框取消／Escape／非法 Hex 纠正：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-border-recovery-independent.json`。无效草稿不写历史，退出回读原生双线红色，实际 redo 保留；窄屏邻格断言先定位目标再检查。继续打开设置／Tab／Shift+Tab。
- 边框打开／Tab／Shift+Tab：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-border-dialog-independent.json`。原生双线／颜色回读、草稿不写数据、焦点循环与窄屏边界均检查。继续自定义字号取消／Escape／非法输入纠正，恢复场景另放独立文件，不继续塞进 275 行的旧字号测试。
- 自定义字号取消／Escape／非法输入纠正：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-font-size-recovery-independent.json`。原种子行已有两行文字，23px 不必继续增高；改用 37px 确实触发增高，再检查单次撤销恢复原行高及其它行不变。仅修正测试样本，不改生产规则。继续打开／Tab／Shift+Tab。
- 字号打开／Tab／Shift+Tab 及边框、字号完整相关回归 77/77 通过，证据 `/tmp/react-excel-border-font-dialog-regression.json`。原生失败重试、提交中禁用、合并／冻结片段、跨行列样式及精确边框线型均执行。
- 增大字号失败后重试／减小字号失败后重试／提交中禁止编辑与取消已有独立主用例，本次直接补登记并复用上述同一候选报告，不重复启动浏览器。继续普通网格方向键的独立入口。
- 上述报告内 37 个边框／字号主验收已逐项核对成功（不包含本次未跑的快捷边框及其它字号主项）；Core 73/73、React 7/7、React 类型、四个新增格式 E2E 的 Lint、UI Core 构建均通过。日志 `/tmp/react-excel-border-font-core-vitest.log`、`/tmp/react-excel-border-font-react-vitest.log`、`/tmp/react-excel-border-font-typecheck.log`。
- 普通上／下／左导航：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-grid-arrows-initial.json`。单格选中、目标完整可见、焦点留网格、不进入编辑、不改邻格／样式／历史均检查。继续向右／Enter／Shift+Enter。
- 普通向右／Enter／Shift+Enter：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-grid-enter-navigation.json`。继续 Tab／Shift+Tab／Home，验证不逃出网格、不写数据。
- Tab／Shift+Tab／Home：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-grid-tab-home-navigation.json`。继续 End／Ctrl+Home／Command+Home。
- End／Ctrl+Home／Command+Home：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-grid-end-home-navigation.json`。继续两种 End 组合键及 Ctrl+向上，检查最后一行、最右列的完整露出。
- Ctrl+End／Command+End／Ctrl+向上：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-grid-corner-navigation.json`；原生最末格值、完整可见与无历史均检查。继续 Command+向上及两种向下组合键。
- Command+向上／Ctrl+向下／Command+向下：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-grid-vertical-boundary-navigation.json`。继续两种向左及 Ctrl+向右。
- Ctrl+向左／Command+向左／Ctrl+向右：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-grid-horizontal-boundary-navigation.json`。继续 Command+向右及 PageDown／PageUp，后两项按真实可视高度校验精确行号。
- 普通导航完整专项 48/48 通过，证据 `/tmp/react-excel-grid-navigation-complete.json`；24 个主验收逐项匹配成功，无跳过或重试。翻页按 DOM 实际高度验证精确行号及往返恢复。继续双击／F2／直接打字三个编辑入口。
- 导航 Core 47/47、React 29/29、React 类型及两个导航 E2E Lint 通过，日志 `/tmp/react-excel-grid-navigation-core.log`、`/tmp/react-excel-grid-navigation-react.log`。双击／F2／直接打字桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-editing-entries-independent.json`；原文选中／末尾光标／新字符光标、单次历史与邻格格式均检查。继续 Backspace／Delete／Escape。
- Backspace／Delete／Escape：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-cell-key-actions-independent.json`；空草稿不先清原值、立即清除重算、取消保留 redo 分别验证。继续格内 Enter／Shift+Enter／Tab 提交导航。
- 格内 Enter／Shift+Enter／Tab：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-editing-commit-navigation.json`；提交后精确选中及可见、原生公式重算、单次撤销重做与邻格样式均检查。继续 Shift+Tab／公式栏 Enter／公式栏 Escape。
- Shift+Tab／公式栏 Enter／Escape 及本文件回归 12/12 通过，证据 `/tmp/react-excel-editing-commit-bar-regression.json`。继续两种失焦提交及格内拒绝草稿纠正，复用已有真实拒绝用例，不添加重复生产层。
- 两种失焦提交及拒绝恢复、连续双击交叉回归 19/19 通过，证据 `/tmp/react-excel-editing-blur-recovery.json`。新控件保持焦点，拒绝草稿不能被下一格替换；在途写入、较新定位与下一格编辑互不覆盖。公式栏拒绝后纠正、两入口显式取消已有各自独立用例，本次补登记并复用同一报告。
- 格内／公式栏鼠标接受候选及格内 Enter：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-formula-assist-acceptance.json`；仅插入草稿、光标与参数帮助、不提前写历史，最终确认后单次撤销重做均检查。继续公式栏 Enter 及格内上下候选导航。
- 公式栏 Enter／格内上下候选导航：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-formula-assist-key-selection.json`。首轮测试定位把工具栏 SUM 与候选 SUM 混在一起，已限定到候选列表，仅修正测试定位；生产未变。继续公式栏上下候选及格内 Escape 两级取消。
- 公式栏上下候选及格内 Escape：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-formula-assist-navigation-dismissal.json`；候选选中与 aria 光标一致、第一次只关列表、第二次才丢草稿，原生 redo 保留。继续公式栏 Escape 及两个入口嵌套参数提示。
- 公式栏 Escape／两个入口嵌套参数帮助及补全专项 24/24 通过，证据 `/tmp/react-excel-formula-assist-arguments-regression.json`；共 12 个细项的各自主入口已跑。继续两个入口点击拾取引用及反向范围拖拽，复用现有独立用例。
- 编辑／补全 Core 67/67、React 21/21、React 类型与八个新增 E2E Lint 通过；18 个编辑／清除及 12 个补全主验收已按各文件最新报告逐项匹配成功（非一次全量）。日志 `/tmp/react-excel-editing-assist-core.log`、`/tmp/react-excel-editing-assist-react.log`、`/tmp/react-excel-editing-assist-types.log`。
- 两入口点击拾取／反向引用拖拽及相关回归 7/7 通过，证据 `/tmp/react-excel-formula-pointer-reference.json`。继续两入口独立 F4 四种锁定循环及格内 F2 文字／引用切换；原跨复制回归继续保留。
- 两入口 F4／格内 F2 及引用键盘交叉回归 14/14 通过，证据 `/tmp/react-excel-formula-reference-key-regression.json`；隐藏轴、合并、冻结与离屏草稿、迟到提交不抢名称框均执行。继续公式栏 F2 与两种跨表点击引用入口。
- 公式栏 F2／两种跨表点击引用及跨表交叉回归 17/17 通过，证据 `/tmp/react-excel-formula-cross-sheet-key-regression.json`；原表坐标、转义表名、失败纠正、在途禁用与返回离屏原格均检查。两入口键盘拾取／跨表反向拖拽、跨表键盘／F2 重开／Escape 各已有独立用例，按三项两组补登记并复用上述最新报告，无需重复运行。
- 引用 Core 48/48、React 8/8、类型与新增引用键盘 E2E Lint 通过，日志 `/tmp/react-excel-formula-reference-core.log`、`/tmp/react-excel-formula-reference-react.log`。拖拽列宽／Enter 自动适应行高／双击自动适应行高及相关回归 11/11 通过，证据 `/tmp/react-excel-size-autofit-drag-regression.json`。继续尺寸手柄上／下／左三个键盘入口。
- 尺寸手柄上／下／左：桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-resize-keyboard-initial.json`；精确十像素、表头及格子同步、旁边行列不变、原值样式与单次历史均检查。继续向右／Escape 取消／窗口切离取消，取消后还需实际重做并重新拖拽。
- 向右／Escape／窗口 blur 及键盘尺寸完整专项 12/12 通过，证据 `/tmp/react-excel-resize-cancellation-final.json`。原切标签诊断没有收到 blur 或 visibilitychange，是无头环境不模拟 OS 焦点；取消用例明确注入 DOM blur，后续真实拖拽、Rust 历史与重做均检查，不声称实机切窗验证，不改产品逻辑。继续 Enter 自动适应列宽／尺寸 Cancel／Escape。
- Enter 列宽／尺寸 Cancel／Escape 桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-size-dialog-cancel.json`，离屏粗体字号参与测量、邻列不变、焦点及原生历史保留均检查。继续弹窗打开回读／非法行高／非法列宽纠正。
- 尺寸打开／非法行高／非法列宽桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-size-validation-final.json`；首轮 ValidityState 序列化为空导致断言失败，改为读取实际 validity.valid，生产未改。上下界、小数、必填检查后在同一弹窗纠正，原生单次历史及邻行列不变。SIZE-013～024 十二个主验收按三份最新完整文件报告逐项匹配成功；Core 28/28、React 18/18、类型及五个新增尺寸 E2E Lint 通过，日志 `/tmp/react-excel-size-core.log`、`/tmp/react-excel-size-react.log`、`/tmp/react-excel-size-types.log`。继续上一张／下一张／按钮打开重命名。
- 工作表前后按钮（桌面）／重命名按钮（桌面及窄屏）4/4 通过，证据 `/tmp/react-excel-sheet-entries-final.json`。首轮窄屏超时核实为现有 CSS 刻意隐藏前后按钮，已按实际入口限定测试，不改产品、不宣称窄屏具备按钮。继续双击／F2／Save。
- 双击／F2／Save 桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-sheet-rename-entries.json`；单引号表名转义、跨表原式回读、单次撤销／重做后继续修改源格均执行。继续 Cancel／Escape／重名纠正。
- 重命名 Cancel／Escape／重名纠正桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-sheet-rename-recovery-initial.json`；草稿退出后实际重做旧值，拒绝后同一输入纠正并只新增一次原生历史。继续非法字符／空名／超长名三个恢复边界。
- 非法字符／空名／超长名及重命名恢复回归 12/12 通过，证据 `/tmp/react-excel-sheet-rename-validation.json`。继续保留名 History／独立向左及向右移动；原双向综合用例保留为回归，SHEET-004 主绑定改为独立向右入口。
- 保留名及左右移动完整相关回归 18/18 通过，证据 `/tmp/react-excel-sheet-movement-recovery.json`；移动后身份、选区、尺寸与原生单次历史保持，修改源表仍重算 Summary。继续删除确认打开／Cancel／Escape，关闭后用原始键盘事件检查焦点，不使用会替测试聚焦的 locator.press。
- **真实缺陷，已修复**：删除确认 Cancel 后网格失焦，原始方向键无法继续选格。浏览器先失败 `/tmp/react-excel-sheet-delete-recovery-before.json`，React 新增两条也先失败 `/tmp/react-excel-sheet-delete-focus-before.log`；原因是条件渲染先移除 dialog，原生 close 不会恢复焦点。仅在 `SheetDeleteConfirmation.tsx` 既有 effect 捕获并恢复仍连接的原 DOM 焦点，未加 atom／命令／Hook 层。修后 React 14/14（含两种焦点来源、Cancel／Escape）、桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-sheet-delete-focus-after.log`、`/tmp/react-excel-sheet-delete-recovery-after.json`。继续 Tab／Shift+Tab／删除传输失败原地重试。
- **第二个真实缺陷，已修复**：删除确认尾按钮按 Tab 焦点逃入浏览器，浏览器 `/tmp/react-excel-sheet-delete-dialog-regression.json` 与 React 两条 `/tmp/react-excel-sheet-delete-tab-before.log` 均先失败。复用现有 `cycleDialogFocus`，没有新增焦点抽象。修后 React 16/16、删除框完整专项 12/12（含传输发送前失败一次、同框原生重试及单次撤销／重做）通过，证据 `/tmp/react-excel-sheet-delete-tab-after.log`、`/tmp/react-excel-sheet-delete-dialog-final.json`。桌面／窄屏截图已查看，无对话框溢出；技能自带 visual-runtime 脚本未安装，使用既有 Playwright 截图与 DOM 溢出／焦点检查，不声称执行了不存在的工具。工作表 Core 17/17、类型通过；新增 E2E 两处 no-shadow 已改名，Lint 待复验。继续旧工作表交叉回归，随后检查尺寸弹窗同类问题。
- 工作表旧交叉回归 39/39 通过，证据 `/tmp/react-excel-sheet-existing-regression.json`；工作表 26 个主验收按各文件最新完整报告匹配成功，Lint 复验通过 `/tmp/react-excel-sheet-lint-final.log`。下一组三项为尺寸弹窗 Tab／Shift+Tab／传输失败原地重试。前两项 React 2/2 先失败，浏览器 Tab 也先失败，证据 `/tmp/react-excel-size-tab-before.log`、`/tmp/react-excel-size-interaction-before.json`；仅在原尺寸 dialog 接现有焦点循环函数，修后验收进行中。
- 尺寸弹窗键盘循环修后桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-size-interaction-after.json`，发送失败同框保留 44px 草稿，原生重试只有一条历史，旁边行不变。React 20/20、类型、Lint 通过（`/tmp/react-excel-size-interaction-react.log`、`/tmp/react-excel-size-interaction-types.log`、`/tmp/react-excel-size-interaction-lint.log`），桌面／窄屏截图已查看。继续合并确认 Cancel／Escape／Tab，不在此批结束时终止 goal。
- **合并确认两项真实交互缺陷，已修复**：Cancel 关闭后失焦、Tab 越过尾按钮，分别先在浏览器 `/tmp/react-excel-merge-dialog-before.json`、`/tmp/react-excel-merge-tab-reproduction.json` 失败；React 四条也先失败 `/tmp/react-excel-merge-dialog-unit-before.log`。确认框复用既有焦点循环，原菜单单独传一个 DOM ref 恢复焦点，不传 atom／命令对象。修后桌面／窄屏 6/6 `/tmp/react-excel-merge-dialog-after.json`，相关 React 29/29、类型通过；Lint 一处签名超长已换行，待复验。桌面／窄屏截图已查看。继续 Shift+Tab／打开确认／确认发送失败重新确认。
- 合并打开／Shift+Tab／确认发送失败重试及原有合并回归 22/22 通过，证据 `/tmp/react-excel-merge-complete.json`；合并 9 个主验收逐项匹配成功。首次确认发送失败保留原多格内容，重新选择必须再次确认，随后原生单次撤销／重做恢复值与格式。演示中原合并区域、隐藏锚点与离屏合并回归均保留。继续门禁及格式刷单次／拖拽／连续刷入口。
- 对话框相关 Core 20/20、React 构建、展现层边界检查、合并最终 Lint 通过（`/tmp/react-excel-dialog-commands-core.log`、`/tmp/react-excel-dialog-build.log`、`/tmp/react-excel-dialog-presentation.log`、`/tmp/react-excel-merge-lint-clean.log`）。构建只有既有大 chunk 警告，不新增依赖或切分任务。格式刷源码三个入口各有现成独立用例，本批补登记并运行完整文件，不再复制一份测试。
- 格式刷单次／拖拽／双击连续刷及相关完整回归 14/14 通过，证据 `/tmp/react-excel-format-painter-candidate.json`，包括剪贴板权限独立、捕获快照、跨表退出、冻结离屏及失败纠正。本批只补独立绑定，无生产改动。继续 Enter 应用／再点按钮退出／Escape 退出；三项同样有独立用例且已在该报告执行，补登记后复用同一候选证据，不重复浏览器运行。
- Enter 应用／按钮退出／Escape 退出已复用上述成功报告，格式刷 Core 12/12、React 4/4 通过，日志 `/tmp/react-excel-painter-core.log`、`/tmp/react-excel-painter-react.log`。继续格式刷尺寸错误纠正（现有独立用例复用成功证据）／工具栏剪切／工具栏粘贴；后两项新增真实按钮入口验收，检查跨表消费者及原生单次历史。
- 工具栏剪切／粘贴桌面／窄屏 4/4 通过，证据 `/tmp/react-excel-clipboard-button-entries.json`；剪切源在 Paste 前不清除，移动后跨表公式跟随目标，值／样式及原生单次历史验证。格式刷错误纠正复用已跑报告。继续键盘 Paste／打开选择性粘贴／Cancel 草稿；剪贴板捕获放在 Undo 准备之后，不能用失效的旧捕获掩盖会话语义。
- 键盘 Paste／选择性粘贴打开及 Cancel、按钮回归 10/10 通过，证据 `/tmp/react-excel-clipboard-session-entries.json`；目标原值、默认选项及实际 redo 均检查，桌面／窄屏截图已查看。继续 Escape／Tab／Shift+Tab，先复现焦点行为再决定生产修改。
- **选择性粘贴键盘缺陷，已修复**：Escape 正常，Tab 从尾按钮逃出弹窗，浏览器 `/tmp/react-excel-paste-session-before.json` 及 React 两条 `/tmp/react-excel-paste-tab-unit-before.log` 均先失败。仅补现有焦点循环导入与绑定两行；Core 48/48、React 23/23、类型及四文件 Lint 通过（`/tmp/react-excel-clipboard-session-core.log`、`/tmp/react-excel-clipboard-session-react.log`、`/tmp/react-excel-clipboard-session-types.log`、`/tmp/react-excel-clipboard-session-lint.log`）。48/48 浏览器剪贴板交叉回归通过 `/tmp/react-excel-clipboard-session-regression.json`。格式刷 7 个主验收已匹配成功，继续弹窗全部／仅值／仅格式，不用同名按钮代替。
- 弹窗全部／仅值／仅格式桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-paste-content-initial.json`；取值、字体归属、邻格、原生单次撤销／重做均检查。CLIP-023～030 八个主验收已匹配本次完整回归报告成功。继续值及格式／仅公式／公式及数字格式，使用原生带格式公式种子验证冻结值与实时计算的差别。
- 弹窗值及格式／仅公式／公式及数字格式桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-paste-formula-dialog-initial.json`；原始值、相对引用、数字格式、字体归属及修改依赖后的冻结／实时计算均检查。继续值及数字格式／弹窗仅列宽／原生拒绝后纠正，复用已有独立列宽主用例，不为登记数重复造测试。
- 弹窗值及数字格式／列宽／拒绝纠正及相关回归 16/16 通过，证据 `/tmp/react-excel-paste-dialog-modes-final.json`，列宽复用同候选 `/tmp/react-excel-clipboard-session-regression.json`。CLIP-034～039 六个主验收逐项匹配成功。继续弹窗不运算／加法／减法，检查原生依赖公式、目标格式及单次历史。
- 弹窗不运算／加法／减法桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-paste-dialog-arithmetic-initial.json`；目标值、原生依赖计算、源与邻格、格式及一次撤销／重做均检查。继续乘法／除法／转置，转置单独文件只负责复选框对矩形形状的影响。
- 弹窗乘法／除法／转置及运算回归 12/12 通过，证据 `/tmp/react-excel-paste-dialog-operations-final.json`；纵向目标两格及其依赖、邻列、源数据和一次历史均检查。继续跳过空白／列宽互斥／权限等待，复用并加强既有两条会话用例。
- 弹窗跳过空白／列宽互斥／权限等待及相关回归 12/12 通过，证据 `/tmp/react-excel-paste-dialog-options-final.json`；空白保留公式，0／false 实际写入；列宽清掉运算／转置／跳过空白，权限等待不能重复提交或 Escape 关闭。继续历史 Tab／Shift+Tab／空历史，先浏览器复现。
- 历史弹窗 Tab 逃出实际关闭按钮，浏览器 `/tmp/react-excel-history-dialog-before.json` 先 1 passed／1 failed，React `/tmp/react-excel-history-tab-unit-before.log` 正反两条均失败。只加既有 `cycleDialogFocus` 的导入与绑定两行，不增 atom 或历史层；剪贴板 CLIP-031～048 十八个主验收已按完整文件最新报告逐项匹配成功。
- 历史最终专项 41/41 通过，证据 `/tmp/react-excel-history-dialog-regression.json`；HIST-001～017 全部主验收逐项匹配成功。React 11/11、Core 31/31、类型及八文件 Lint 通过（`/tmp/react-excel-history-dialog-react-after.log`、`/tmp/react-excel-history-dialog-core.log`、`/tmp/react-excel-history-dialog-types.log`、`/tmp/react-excel-history-paste-lint.log`），桌面／窄屏截图已查看。继续序列填充打开／Cancel／Escape。
- 序列填充打开／Cancel／Escape 桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-series-session-initial.json`；默认数值／方向／样本数、源与邻格格式、草稿重置及真实重做检查。继续 Tab／Shift+Tab／非法样本数纠正；未把只读面板行为额外复制为另一套状态。
- 序列填充 Tab 同样逃出模态框，浏览器 `/tmp/react-excel-series-dialog-before.json` 先 3 passed／1 failed，React `/tmp/react-excel-series-tab-unit-before.log` 两条均失败。只补现有焦点循环导入及绑定两行；非法样本数测试另负责 HTML 必填／小数／下界及 Core 目的区校验，未改推断与写入链路。
- 序列／日期／自定义列表最终交叉 54/54 通过，证据 `/tmp/react-excel-series-dialog-after.json`；React 15/15、Core 68/68、类型通过（`/tmp/react-excel-series-dialog-react-after.log`、`/tmp/react-excel-series-dialog-core.log`、`/tmp/react-excel-series-dialog-types.log`），桌面／窄屏截图已查看。Lint 一处测试行 102 字符仅换行修正，正在重检；继续自定义列表三个草稿入口并汇总单测及构建门禁，不把本批等同整体 goal 完成。
- 汇总门禁：UI Core 全量 3444/3444（239 文件）、React 全量 561/561（105 文件）、两包构建、展现层边界、循环依赖和序列 Lint 复检通过；日志 `/tmp/react-excel-dialog-milestone-{core-full,react-full,core-build,react-build,presentation,cycles}.log`、`/tmp/react-excel-series-dialog-lint-final.log`。构建只有既有 500kB chunk 提示。FILL-003～008、012～020 十五个主验收按本次 54 项报告匹配成功；这不是整个产品的浏览器全量证据。继续自定义列表新建按钮／选择保存项／下拉框未保存项。
- 自定义列表新建按钮／下拉未保存项／保存项选择桌面与窄屏 6/6 通过，证据 `/tmp/react-excel-custom-list-entries.json`；丢弃未保存草稿不删预设、不写格，Apply 后一次历史含格式恢复。继续序列方向向下／向右／日期；日期主验收复用本次已跑 54 项报告，不重复启动未变输入。
- 序列方向下拉向下／向右桌面／窄屏 4/4 通过，证据 `/tmp/react-excel-series-directions.json`；实际切换到相反方向再改回，目标公式及布尔值可一次恢复，源和邻格不变。日期序列主用例复用 `/tmp/react-excel-series-dialog-after.json`。继续填充柄向下／向上／无拖动点击，原测试已独立，复用而非复制。
- 填充柄及矩阵完整专项 22/22 通过，证据 `/tmp/react-excel-fill-handle-current.json`；向下／向上／不拖动已独立绑定。继续 Ctrl 强制复制／Command 强制复制／公式拖填三项，均复用该同候选完整文件报告，不重复测试代码。
- 填充柄 Ctrl／Command 强制复制及公式拖填六个主验收（含上一批）逐项匹配成功；底边自动滚动／右边自动滚动并提交／合并目标拒绝后重试三项继续复用 `/tmp/react-excel-fill-handle-current.json` 的已执行证据。下一批拆左右拖填及 Escape，不让综合用例代替独立入口。
- 左／右拖填及 Escape 中断后重新拖填桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-fill-horizontal-cancel-initial.json`；下划线、源与邻格、原生一次历史及既有 redo 保留均检查。继续 pointercancel／真实释放指针捕获／窗口 blur，注入事件明确标注 DOM 测试，不冒充真实系统应用切换。
- 中断扩展首轮 2 passed／1 failed（`/tmp/react-excel-fill-cancellation-final.json`）：失捕获测试只调用 releasePointerCapture，漏了后续原生 pointer 事件，尚未观察到浏览器派发 lostpointercapture。补读实际 pointerId、真实鼠标移动及事件到达断言，不把该测试步骤问题记为产品缺陷；原预览、源、redo 和重新拖填断言全部保留。
- 中断恢复最终 8/8 通过，证据 `/tmp/react-excel-fill-cancellation-verified.json`；真实捕获丢失和 DOM pointercancel／blur 均保留旧 redo、原始源及选区，再次拖填只产生一条原生历史，生产未改。继续 Ctrl+D／Command+D／Ctrl+R，拆开原来 D/R 综合快捷键用例。
- Ctrl+D／Command+D／Ctrl+R 桌面／窄屏 6/6 通过，证据 `/tmp/react-excel-fill-shortcuts-initial.json`；真实网格焦点、相对／绝对引用、下划线／粗体继承及一次撤销／重做检查。继续 Command+R／上边持续自动滚动／左边持续自动滚动，保留原综合回归不删除。
- Command+R／上边持续滚动／左边持续滚动及定向填充完整专项 23/23 通过，证据 `/tmp/react-excel-fill-shortcuts-reverse-scroll.json`；按住边缘不再移动鼠标也继续滚动，Escape 后不写格、不增加历史。继续冻结源拖填／列表拒绝后纠正／非法序列几何三项，复用已执行的独立用例，不新增重复测试。
- 冻结源拖填／列表拒绝后纠正／非法序列几何独立绑定完成，FILL-036～050 十五个主验收按最新完整文件报告匹配成功。下一批文件面板打开／关闭／Escape；另补跑双击填充旧专项作为当前候选证据。
- 文件面板打开／关闭／Escape 与双击填充完整专项 12/12 通过（`/tmp/react-excel-file-dialog-initial-fixed.json`）。首轮新测试误写种子深红色，按原始 `#c00000` 修正，未修改产品。下一批 Tab／Shift+Tab／无效文件原地纠正，先证明浏览器是否逃焦点。
- 文件面板 Tab 真实逃出，浏览器先 5 passed／1 failed（`/tmp/react-excel-file-dialog-tab-before.json`），React 正反两条均失败（`/tmp/react-excel-file-tab-unit-before.log`）；复用焦点循环，仅增加导入与绑定两行。修复后 React 8/8、Core 33/33、类型与十文件 Lint 通过（一处旧断言仅换行后复检），证据 `/tmp/react-excel-file-tab-unit-after.log`、`/tmp/react-excel-file-dialog-core.log`、`/tmp/react-excel-file-dialog-types.log`、`/tmp/react-excel-file-fill-lint-final.log`；继续浏览器完整文件回归。
- 文件完整回归 23/23 通过（`/tmp/react-excel-file-dialog-after.json`），桌面及窄屏截图已查看，保持原生保存／打开、错误纠正及替换后全新历史。继续统计设置 Tab／Shift+Tab／刷新恢复六项默认值，不新增本地保存能力。
- 统计设置 Tab 先真实失败（`/tmp/react-excel-statistics-tab-before.json`），React 正反两条也均失败（`/tmp/react-excel-statistics-tab-unit-before.log`）；仍只加既有焦点循环的导入与绑定两行。修复后 React 9/9、Core 19/19、三文件 Lint 通过（`/tmp/react-excel-statistics-tab-unit-after.log`、`/tmp/react-excel-statistics-tab-core.log`、`/tmp/react-excel-statistics-tab-lint.log`）。FILE-001～010 十个主验收逐项匹配本次完整文件回归成功，统计浏览器全专项继续执行。
- 统计显示／复制／权限恢复／会话设置专项 44/44 通过（`/tmp/react-excel-statistics-dialog-after.json`）；STAT-001～022 全部主验收逐项匹配成功。桌面及窄屏截图已查看，只有既有 DOM 焦点修复，不改原生计算；继续 Go To 打开／Cancel／Escape。
- Go To 打开／取消／Escape 桌面与窄屏 6/6 通过（`/tmp/react-excel-go-to-session-initial.json`）；原选区、原滚动、目标未提交、草稿重置和原生 redo 保留均验证。继续 Tab／Shift+Tab／非法地址原地纠正，保留旧跨表综合用例。
- Go To Tab／Shift+Tab／非法地址纠正与原复杂定位回归 22/22 通过（`/tmp/react-excel-go-to-dialog-current.json`）；桌面及窄屏截图已查看。继续 A1 区域／相对 R1C1／带引号跨表地址的实际 Go 按钮入口，不新增定位状态层。
- A1 区域／相对 R1C1／带引号跨表 Go 按钮独立专项 6/6 通过（`/tmp/react-excel-go-to-references.json`），定位后网格焦点、最近记录规范化、原生邻格及无额外历史均检查。源码核对发现排序／筛选弹窗未接焦点循环，下一批排序打开／Tab／Shift+Tab 先复现，导航剩余入口随后继续。
- 排序面板 Tab 原生逃焦先复现 1 passed／1 failed（`/tmp/react-excel-sort-dialog-before.json`），React 正反两条也均失败（`/tmp/react-excel-sort-tab-unit-before.log`）。只补既有焦点工具导入与绑定；修复后 React 8/8、Core 17/17、五文件 Lint 通过（`/tmp/react-excel-sort-tab-unit-after.log`、`/tmp/react-excel-sort-tab-core.log`、`/tmp/react-excel-sort-navigation-lint.log`）。继续完整排序浏览器回归。
- 排序完整专项 45/45 通过（`/tmp/react-excel-sort-dialog-after.json`），桌面及窄屏截图已查看并留存 `/tmp/react-excel-sort-open-{1280,390}.png`。继续筛选打开／Tab／Shift+Tab，同时覆盖 Table 表头列入口，验证禁用列选择器不能成为焦点循环起点。
- 筛选 Tab 原生逃焦先复现 1 passed／1 failed（`/tmp/react-excel-filter-dialog-before.json`）；首轮 React 两条工具栏循环失败，另两条表头测试漏 await act 导致面板尚未渲染，不把后者算产品缺陷。只补生产焦点工具导入与绑定两行，并纠正测试等待；最终 React 14/14、Core 41/41、Lint 通过（`/tmp/react-excel-filter-tab-unit-final.log`、`/tmp/react-excel-filter-tab-core.log`、`/tmp/react-excel-filter-tab-lint-final.log`）。继续筛选／Table 筛选／候选值全部专项。
- 筛选／候选值／Table 筛选完整专项 101/101 通过（`/tmp/react-excel-filter-dialog-after.json`），包含两个真实 WASM 版本的保存恢复。桌面工具栏、窄屏 Table 表头截图已查看并留存 `/tmp/react-excel-filter-toolbar-1280.png`、`/tmp/react-excel-filter-table-column-390.png`；两种入口首控件不同，均正确跳过禁用项。当前四个新缺陷的生产改动合计四文件八行，仅复用焦点循环。继续 React 全量及构建汇总，再推进未完成入口清单，不将此检查点视作 goal 完成。
- 汇总 React 全量 571/571（105 文件）通过（`/tmp/react-excel-modal-milestone-react-full.log`），全项目 Lint、展现边界、698 项登记校验及循环依赖通过。类型检查发现三份新 RTL 单测误用 Playwright 的 exact 参数，只删除不被支持的选项；RTL 字符串 name 本身精确匹配，断言未弱化。最终相关 24/24、类型、构建及三文件 Lint 再过（`/tmp/react-excel-modal-milestone-{tests-final,types-final,react-build,tests-lint-final}.log`）。生产源 SHA-1 清单摘要 `a8d79a25188a45ad4bd0be2ae479945347ee4fea`，WASM lite/full 摘要仍为 `b39441a7ed61a241fd16ebe1df4e604691ae4ef5`／`c67c17cf62ef1b113ab507fd8cf4ef68bae23245`；本轮 47 个新主验收按最新专项报告逐项匹配成功。继续 Enter 定位／最近位置点击／无匹配条件纠正三项。
- Enter 提交／最近位置点击及定位条件完整专项 18/18 通过（`/tmp/react-excel-go-to-submit-special.json`），含两版实际 WASM 的极大空区域与拒绝溢出。最近位置使用当时绝对坐标，不会随当前格漂移；原公式、字体及历史不变。继续定位条件打开／取消／Escape 三项，生产未改。
- 定位条件打开／取消／Escape 桌面及窄屏 6/6 通过（`/tmp/react-excel-go-to-special-session-initial.json`），截图已查看并留存 `/tmp/react-excel-special-open-{1280,390}.png`；有界作用域、错误值、原样式、原生 redo 不变。继续正反焦点循环及分类 End 三项。
- 定位条件正反 Tab 及分类 End 共 12/12 通过（`/tmp/react-excel-navigation-dialog-ribbon.json`），没有生产改动。继续分类 ArrowRight／ArrowLeft／Home，保留原分类综合测试验证普通移动与隐藏工具快捷键。
- 分类左右键／Home 及原分类完整回归 11/11 通过（`/tmp/react-excel-ribbon-keyboard-complete.json`）；ARIA 单选、首尾循环、焦点、公式及格式不变、原生 redo 保留均验证。继续数字格式打开／取消／Escape 三项，原数值格式与公式不因预览写入。
- 数字格式打开／取消／Escape 桌面和窄屏 6/6 通过（`/tmp/react-excel-number-dialog-initial.json`）；原生千分位回读、美元草稿预览不落盘、关闭后原设置与 redo 保留均验证。截图已查看并留存 `/tmp/react-excel-number-settings-open-{1280,390}.png`。继续 Tab／Shift+Tab／非法小数位纠正三项，生产未改。
- 整表公式查询／名称改名及删除／失效名称定位：相关文件 21/21 通过（`/tmp/react-excel-navigation-names-current.json`），未改生产源码。导航与数字格式新增五文件 Lint 通过。继续 Ctrl／Command 双击及矩阵强制复制，新增测试文件只负责双击 modifier 的复制语义。
- 填充双击、矩阵与错误恢复 15/15 通过（`/tmp/react-excel-fill-double-copy-final.json`）。首次 Control 双击失败后真实事件诊断证明 macOS 只发送 contextmenu，不发送 dblclick；Meta 两宽度原本即通过，并非产品 bug。测试明确验证 Mac 原生右键不写入后可用 Meta 复制，非 Mac 分支验证真实 Ctrl 复制，不注入假事件、不跳过用例。无相邻延续／合并拒绝后重试／右邻首个间隙三个独立用例也复用这份实际结果，登记 FILL-054..056。未改生产代码；继续去重表头及两种记录定位。
- 去重首行表头／重复记录定位／首条记录定位及原分页交叉回归 11/11 通过（`/tmp/react-excel-duplicates-navigation-current.json`）。继续三个文字比较策略的独立实际删除验收，不把预览计数当成数据变更已正确。
- 精确／忽略大小写／去首尾空白：桌面及窄屏实际删除 6/6 通过（`/tmp/react-excel-duplicates-comparison-basic.json`），逐条检查稳定保留顺序、样式随记录移动、整次单撤销及重做。继续组合比较／选择全部列／清空列，列选择测试只负责预览与确认失效及 redo 保留。
- 组合比较／选择全部列／清空列及四种策略交叉回归 12/12 通过（`/tmp/react-excel-duplicates-column-choices.json`）；旧确认不能沿用，空比较列原地报错后可更正，取消不破坏 redo。继续面板打开／取消／Escape，独立文件只负责未提交草稿的会话边界。
- 去重面板打开／取消／Escape 桌面及窄屏 6/6 通过（`/tmp/react-excel-duplicates-dialog-initial.json`），初始焦点、选区、默认字段恢复、原样式与 redo 保留均验证，截图已生成。继续正反 Tab 及更新预览后重新确认三项。
- 去重 Tab／Shift+Tab／刷新后重新确认及会话回归 12/12 通过（`/tmp/react-excel-duplicates-dialog-final.json`），取消焦点和 redo 均正确；桌面／窄屏截图已查看并留存 `/tmp/react-excel-duplicates-open-{1280,390}.png`。继续分列打开／取消／Escape；未新增生产状态或逻辑。
- 分列打开／取消／Escape 桌面及窄屏 6/6 通过（`/tmp/react-excel-text-columns-session-initial.json`），默认目标、源文字、目标原值及字体、redo 均保留。截图已查看并留存 `/tmp/react-excel-text-columns-open-{1280,390}.png`。继续正反 Tab 与非法目标纠正；目标测试只负责拒绝到合法提交的单次历史边界。
- 分列正反 Tab／非法目标纠正及复杂源区回归 20/20 通过（`/tmp/react-excel-text-columns-dialog-final.json`），覆盖纠正后的实际覆盖、一次撤销与重做分支替换，以及重叠／合并／溢出拒绝。继续 Preserve／General／Text 三种显式字段类型，使用日期目标格式区分保留、重置和强制文字语义；测试文件只负责文字类字段转换。
- Preserve／General／Text 桌面及窄屏 6/6 通过（`/tmp/react-excel-text-column-literal-types-final.json`），值、原格式保留或替换、字体、公式样文字不计算及原子历史均检查。首次测试误认为数字面板存在 General 分类；源码明确映射为 Number 草稿，修正该预期后原断言全部保留，非产品缺陷。继续三种常用日期顺序；新文件只负责显式日期顺序转换。
- MDY／DMY／YMD 显式日期顺序桌面及窄屏 6/6 通过（`/tmp/react-excel-text-column-date-basic.json`），日期显示、原始序号 45351、源文本及邻格保留、两次原生写入分别撤销／重做均检查。继续 MYD／DYM／YDM 并交叉跑既有字段类型回归。
- 六种日期顺序及既有字段类型回归 24/24 通过（`/tmp/react-excel-text-column-date-complete.json`），包含 400 行和预览列上限外的字段转换。继续 Skip／源字段编号纠正／更换规则清空类型三个入口。
- 验证记录纠正：此前源码指纹管道未固定 `rg --files` 枚举顺序，同一内容会产生不同汇总值。后续统一 `LC_ALL=C sort` 后逐文件计算，当前为 `30d41083df6ccc11c7161addf6c9801c9c0b6849`；本轮生产文件无 15:11 之后修改，新增内容仅为 E2E 与文档，不能把无序汇总值的变化误报为代码变化。
- Skip／源字段编号纠正／更换规则重置类型桌面及窄屏 6/6 通过（`/tmp/react-excel-text-column-field-rules.json`），结果压紧、原始字段索引、四种非法编号及单次历史均验证。继续三个预设分隔符入口，测试文件只负责分隔符勾选后的原生拆分。
- Tab／分号／空格分隔符桌面及窄屏 6/6 通过（`/tmp/react-excel-text-column-delimiters.json`），保留前导零、源区、邻格及两次写入的独立历史。继续自定义字符／单引号／关闭引号保护，测试文件只负责分隔边界，不用 JS 解析器替代 Rust 结果。
- 自定义分隔符／单引号保护／关闭引号保护桌面及窄屏 6/6 通过（`/tmp/react-excel-text-column-qualifiers.json`），逐字符验证原始引号和空格、前导零、输出边界及原子历史。继续连续分隔符合并开关与双引号保护；新文件只负责空字段覆盖时的格式保持。
- 连续分隔符合并开关／双引号保护桌面及窄屏 6/6 通过（`/tmp/react-excel-text-column-empty-fields.json`），空字段实际清掉 C98 原有文字而保留斜体，整次覆盖可撤销／重做。继续小数分隔符／千位分隔符／尾随负号的独立入口，测试只负责数字选项的原生类型与历史。
- 小数分隔符／千位分隔符／尾随负号及原地区解析 11/11 通过（`/tmp/react-excel-text-column-number-controls.json`），统计 Sum 额外验证数值类型，包含 400 行不间断空格解析。30 个分列细项主用例逐项匹配最新文件结果，新增分列测试 Lint、React 类型、展现层边界均通过。登记门禁目前为 773 项（仅绑定检查，不是全量执行证明）。固定排序源码指纹仍为 `30d41083df6ccc11c7161addf6c9801c9c0b6849`；继续去重下一页／上一页／直接比较列切换。
- 去重下一页／上一页／单列比较键切换及列选择回归 10/10 通过（`/tmp/react-excel-duplicates-pages-current.json`），第二页全部 20 条记录、首条来源、翻页清确认及只保留原粘贴历史均检查。继续名称管理器打开／正反 Tab；新增测试文件只负责管理器会话边界。
- 名称管理器打开／正反 Tab 桌面及窄屏 6/6 通过（`/tmp/react-excel-name-manager-dialog-initial.json`），默认字段、原公式与字体、名称种子及 redo 不变。继续 Cancel／Escape／重名原地纠正；纠错测试只负责同一草稿拒绝到一次成功创建的历史边界。
- Tables 打开／正反 Tab 桌面及窄屏 6/6 通过（`/tmp/react-excel-table-dialog-initial-final.json`）。首次用例误认为 DemoTable 是目录首项，实际按名称排序的 CalculatedOrders 在前；修正该测试假设，未改生产实现。继续 Cancel／Escape／范围重叠原地纠正，新文件只负责拒绝到创建的原子历史。
- Tables 会话／重叠纠正／原 CRUD 回归 25/25 通过（`/tmp/react-excel-table-dialog-complete.json`）；原表、结构化引用、斜体及历史分支均保持正确。继续条件格式打开／正反 Tab，新文件只负责规则管理面板的只读会话边界。
- 条件格式打开／正反 Tab 桌面及窄屏 6/6 通过（`/tmp/react-excel-conditional-dialog-current.json`），规则目录、条件色、选区及 redo 均不变。继续数据验证打开／正反 Tab，新文件只负责已有列表规则的只读面板会话。
- 数据验证打开／正反 Tab 桌面及窄屏 6/6 通过（`/tmp/react-excel-validation-dialog-current.json`），已有列表、相邻验证值及跨表 redo 不变。继续函数选择器打开／正反 Tab，新文件只负责浏览原生目录时的公式与历史隔离。
- 函数选择器打开／正反 Tab 桌面及窄屏 6/6 通过（`/tmp/react-excel-function-dialog-current.json`），目录、原公式、字体及 redo 不变。继续超链接打开／正反 Tab，新文件只负责动态出现链接时的面板焦点边界。
- 超链接打开／正反 Tab 桌面及窄屏 6/6 通过（`/tmp/react-excel-hyperlink-dialog-current.json`），空 URL／合法 URL 动态边界、公式、字体与 redo 均验证。继续填充色板打开／正反 Tab，新文件只负责未提交颜色草稿的面板会话。
- 填充色板打开／正反 Tab 桌面及窄屏 6/6 通过（`/tmp/react-excel-fill-palette-dialog-current.json`），未提交自定义草稿不写颜色、公式或历史。继续文字色板同三个入口，沿用同一会话测试的 kind 变体，主验收仍分别登记两个真实按钮。
- 两种色板及既有颜色交叉回归 46/46 通过（`/tmp/react-excel-palette-dialog-complete.json`）。本阶段 11 个新增／改动 E2E 的 Lint、React 类型、差异检查通过；登记门禁为 806 项，仅证明绑定。继续横向／斜向滚动及多行定位，复用既有细粒度用例，不重复编写同一行为的测试。
- 横向／斜向滚动及多行定位相关 7/7 通过（`/tmp/react-excel-scroll-stability-current.json`），中间帧绝对坐标、retained 状态、公式栏高度及仅必要滚动均检查。继续普通拖选下／右／上边缘，新文件只负责持续捕获时的自动滚动，不与填充柄混用主验收。
- **真实缺陷，修复中**：下／右通过，上边缘实际滚动但 Name box 始终为 H300（`/tmp/react-excel-selection-edge-initial.json`，2 passed／1 failed，余项因 max-failures 未执行；trace `/tmp/react-excel-selection-top-before-trace.zip`）。坐标 fallback 将表头处负 y 当成冻结区外负坐标，返回 null 而丢弃扩选。新增 `drag-hit-test.test.ts` 只负责捕获拖选时表头坐标到真实单元格的映射，先跑修复前失败证据；不改变 atom 或 Rust 数据链。
- 表头拖选坐标修复：真实修复前单测 `/tmp/react-excel-drag-hit-before-real.log` 为 6 failed／1 passed（最初脚本相对路径写错导致的采集失败不算复现证据）。仅将局部 x／y 限为非负，保留原有冻结／尺寸映射；相关 React 6 文件 28/28、类型检查通过。下／右／上桌面及窄屏 E2E 6/6 通过（`/tmp/react-excel-selection-edge-after.json`）。继续左／斜向／松手停止，同一文件覆盖四边捕获的会话边界，随后回归共用映射的填充及冻结场景。
- 普通四边／斜向／松手停止及填充、冻结、公式引用拖选回归 27/27 通过（`/tmp/react-excel-selection-edge-complete.json`），无额外原生历史，redo 保留。继续布局错误关闭／重试／处理中防重复；后两项复用原有独立用例，新增文件只负责错误提示关闭的无写入边界。源码复核还发现 NameBox 的失焦提交与 Escape 取消须独立登记，保留为下一批，不宣称源码核对已穷尽。
- 布局错误关闭／原生拒绝重试／处理中防重复及原布局交叉回归 16/16 通过（`/tmp/react-excel-layout-recovery-current.json`）；关闭不写原生历史，旧 redo 保留。继续名称框失焦定位／Escape 取消／失焦创建名称；新文件只负责 NameBox 提交入口的只读与写入历史边界。
- 名称框失焦定位／Escape／失焦创建名称桌面及窄屏 6/6 通过（`/tmp/react-excel-name-box-session-current.json`），真实点击切换分类后异步回包不抢焦点，创建只增一条名称历史。继续点击即替换全地址／空白失焦还原／越界地址原地纠正，保持同一文件的 NameBox 会话职责。
- 名称框六种入口、原命名定位及视口交叉回归 23/23 通过（`/tmp/react-excel-name-box-session-complete.json`）。本轮发现的入口缺口已补登记，下一步是冻结候选的全量验收；下方矩阵不是全量通过证明。能力说明中把未编辑 Enter 误写成进入编辑，现按实际源码／NAV-019 修正文档，未修改键盘行为。

### 当前 React 入口核对矩阵（2026-10-20，已核对并通过全量验收）

核对对象是 `src/workbook` 的实际事件入口：按钮、菜单项、选择框、表单提交、格内／公式栏键盘、
指针捕获及失焦。不把所有 Rust API 或内置公式名称各算作一个新 UI 入口，也不从测试数量倒推范围。
同一控件的等价颜色／尺寸／文字参数及平台原生修饰键是变体；不同按钮、命令、提交入口及转换语义
在 [FEATURES](e2e/FEATURES.md) 分别绑定主验收。下面是源码到登记分组的人工复核索引，不代替逐项运行。

| React 源码入口（相对 `src/workbook`） | 已核对的操作范围 | 功能分组 |
| --- | --- | --- |
| `selection/use-grid-pointer-selection.ts`、`use-grid-drag-autoscroll.ts`、`grid/viewport/GridHeading.tsx` | 单选／矩形／Shift／表头／四边拖选／捕获结束 | SEL |
| `grid/viewport/use-workbook-grid-events.ts`、UI Core keyboard intents | 方向／首页末页／翻页／修饰键扩选；编辑入口及历史快捷键 | NAV、SEL、EDIT、HIST |
| `grid/editor/CellEditor.tsx`、`chrome/formula-bar/FormulaBar.tsx` | 两种编辑器的键盘／失焦／拒绝纠正／IME／原始类型 | EDIT |
| `chrome/formula-bar/NameBox.tsx` | 地址／区域／名称、Enter／失焦、Escape／空白／越界纠正、点击全选 | NAV |
| `formula/FormulaAssist.tsx`、`grid/editor/use-formula-input.ts` | 鼠标／键盘补全、参数帮助、引用拾取／锁定／跨表 | CALC |
| `clipboard/use-grid-clipboard.ts`、`chrome/ribbon/ClipboardTools.tsx`、`PasteSpecialTools.tsx` | 系统事件／按钮、复制格式、各粘贴语义及组合、失败恢复 | CLIP |
| `chrome/ribbon/ClearTools.tsx`、网格 Delete | 清内容／格式／全部，单区及多区原子边界 | CLEAR |
| `chrome/ribbon/HistoryTools.tsx` | 撤销／重做、列表／关闭／焦点循环；网格快捷键另列 | HIST |
| `chrome/ribbon/FillTools.tsx`、`FillSeriesTools.tsx`、`fill-series/CustomFillLists.tsx`、`grid/fill/FillHandle.tsx` | 定向／序列／名称列表／自定义预设、拖拽／双击、边缘及取消恢复 | FILL |
| `chrome/ribbon/WorkbookRibbon.tsx`、`FontSizeTools.tsx` | 字体／字号／粗斜下划删除线／缩进／换行及自定义字号会话 | FONT |
| `chrome/ribbon/TextLayoutTools.tsx`、`ColorTools.tsx` | 对齐／旋转／双颜色入口、预设／原生控件／Hex、错误及只读会话 | STYLE |
| `chrome/ribbon/NumberFormatTools.tsx`、快捷格式按钮 | 数字类别／快捷格式／精度／只读预览／草稿及错误恢复 | NUM |
| `chrome/ribbon/BorderTools.tsx`、快捷边框按钮 | 十种位置／六种线型／三种颜色入口／会话及纠正 | BORDER |
| `chrome/ribbon/FormatPainterTools.tsx` | 单次／连续／取消、格式隔离及尺寸错误恢复 | PAINT |
| `chrome/ribbon/ConditionalFormatTools.tsx` | 原生规则 CRUD／排序／启用／复制、各规则语义与会话 | CF |
| `chrome/ribbon/SelectionSizeTools.tsx`、`grid/viewport/GridResizeHandle.tsx` | 行列尺寸、拖拽／四方向键／双击／Enter、取消及原生尺寸恢复 | SIZE |
| `chrome/ribbon/VisibilityTools.tsx`、`FreezeTools.tsx` | 行列隐藏／恢复、首行首列／当前格冻结及取消 | SIZE、FREEZE |
| `chrome/ribbon/OutlineTools.tsx`、`grid/viewport/OutlineGutters.tsx` | 行列分组／取消、展开／折叠／级别与嵌套 | OUTLINE |
| `chrome/ribbon/StructureTools.tsx`、`MergeTools.tsx`、`MergeConfirmation.tsx` | 插删行列／合并／拆分、确认／取消及引用保持 | STRUCT、MERGE |
| `chrome/footer/WorkbookSheetTabs.tsx`、`SheetDeleteConfirmation.tsx` | 新增／切换／移动／多入口改名／删除确认及视图记忆 | SHEET |
| `chrome/ribbon/NamedRangeTools.tsx`、`NamedTableList.tsx` | 名称 CRUD／范围／工作表／定位 Table、只读会话／重名恢复 | NAME、NAV |
| `chrome/ribbon/TableTools.tsx`、`TableAppearance.tsx`、`TableColumns.tsx`、`TableTotals.tsx` | Table 目录／结构／外观／列名／九种汇总及输入约束 | TABLE |
| `chrome/ribbon/SortTools.tsx`、`FilterTools.tsx`、`FilterConditionFields.tsx`、`FilterValueChoices.tsx` | 快捷／多级排序、区域／列／Table 筛选、候选分页及错误恢复 | DATA、TABLE |
| `chrome/ribbon/TextColumnsTools.tsx`、`TextColumnTypes.tsx`、`TextColumnNumberOptions.tsx`、`RemoveDuplicatesTools.tsx` | 分列各转换语义／覆盖／预览、去重比较／分页／定位／确认及纠正 | DATA |
| `chrome/ribbon/FindReplaceTools.tsx`、`FindResults.tsx` | 查询选项／翻页／导航／替换、各快捷键与只读／拒绝恢复 | FIND |
| `chrome/ribbon/DataValidationTools.tsx`、`grid/editor/CellValidationList.tsx` | 六种规则／八种比较／空白／输入列表、清除／会话／纠正 | RULE |
| `chrome/ribbon/QuickFormulaTools.tsx`、`InsertFunctionTools.tsx`、`CalculationTools.tsx` | 快捷公式／函数目录／重算／显示公式及目录会话 | CALC |
| `chrome/ribbon/SpillTools.tsx` | 查询／刷新／定位／选区、不可定位提示与只读会话 | SPILL |
| `hyperlink/HyperlinkTools.tsx`、`use-grid-hyperlink.ts` | 按钮／快捷键／平台点击、新增修改移除／打开与拒绝恢复 | LINK |
| `chrome/footer/SelectionStatus.tsx`、`SelectionStatisticsSettings.tsx` | 六统计／复制／显示偏好／恢复默认／刷新／权限恢复 | STAT |
| `chrome/header/WorkbookFileTools.tsx` | 下载／打开／新建／确认、同文件重选及坏文件恢复 | FILE |
| `chrome/ribbon/RibbonTabs.tsx`、`chrome/header/LanguageSelect.tsx`、viewport 渲染 | 分类鼠标／键盘、实时语言、三轴稳定滚动及多行定位 | VIEW |

范围边界仍保持用户要求：不改缩放、不加自动保存、不动 Solid／Vue，不删默认合并演示或旧工作区改动，
不自动提交／推送。未实现的保护 UI、非连续区域手动追加、协作及其它完整产品计划不以占位测试充数。
本轮真实产品修复是表头拖选坐标映射；最终候选源码固定排序指纹为
`90f086d36e74371fe5c9f2d614e63c6dc74c6c62`，lite/full WASM 沿用现有已修复表头验证的构件。
单次全量 E2E 执行前冻结源码、测试及 WASM；通过后再按唯一主用例逐项核对，不能拼接专项报告冒充全量。

### 最终候选全量验收（2026-10-20，已通过）

- 基线 HEAD 为 `1c47e643`，包含原工作区未提交改动，不自动提交或推送。
- React／UI Core 源码固定排序 SHA-1：`90f086d36e74371fe5c9f2d614e63c6dc74c6c62`；
  E2E 目录固定排序 SHA-1：`828bd25d211013249b5aa44a28a1ca9a86a1de95`。
- lite WASM：`b39441a7ed61a241fd16ebe1df4e604691ae4ef5`；
  full WASM：`c67c17cf62ef1b113ab507fd8cf4ef68bae23245`。
- 当前候选 React Vitest 578/578（106 文件）、UI Core Vitest 3444/3444（239 文件），
  类型、根 Lint、改动 E2E Lint、构建、展现层边界、循环依赖、文档链接及差异检查通过。
  功能清单检查器自身 7/7 通过；登记检查与下面的实际执行检查分别完成。
- 执行命令：`PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/react-excel-final-implemented-entry-full.json pnpm --filter @einfach/react-excel e2e --max-failures=1 --reporter=json`。
  输出日志 `/tmp/react-excel-final-implemented-entry-full.log`；执行期间源码、测试及 WASM 冻结，
  只运行这一条完整回归，原进程退出 0。完整 E2E 为 2218/2218，耗时 55.1 分钟，
  skipped／unexpected／flaky／报告级错误均为 0；每个测试恰好一个 passed 结果，retry 均为 0。
- 执行 `pnpm check:e2e-features --results /tmp/react-excel-final-implemented-entry-full.json`，
  824 个登记操作全部有同报告中的唯一主用例成功证据，未拼接专项报告充数。
  结束后复核上述源码、E2E 目录及两种 WASM 指纹与执行前完全一致。
- 全量结束后仅更新这两份验收文档；E2E TypeScript 源码固定排序 SHA-1 为
  `c590c96030ceb4e80d8e4e1f063ab77d49f92bc6`，不因清单说明文字更新重跑产品测试。
- 本轮真实产品问题：捕获指针停在上／左表头时，负坐标被误当作冻结区，页面继续滚动而选区停止延伸。
  首次真实浏览器失败和修复前单测均已保留；只在既有 DOM 命中计算中把坐标限制到最近单元格，
  不增加 atom、状态镜像或传输层。四边、斜向、松开停止及冻结／尺寸变体有独立回归，最终全量也通过。
- 宽屏／390px 窄屏面板与原合并演示截图已留存并复核；共享 visual-runtime 脚本不可用，
  使用持久 Playwright 的截图、真实焦点及溢出断言，不声称运行了不存在的视觉工具。
  当前候选仍未提交或推送。完整产品的未实现范围继续保留，不以此次既有入口验收冒充全产品完成。

- 排序／筛选／Table 筛选／大纲共 65 个主验收已按对应最新文件报告核对成功（不是一次全量运行）；React 类型、64 个改动 E2E 的 Lint／300 行限制、差异检查通过。
- 本阶段 React 类型、展现边界、54 个改动 E2E 的 300 行限制及 Lint 通过（两处旧超长断言整理换行后专项复检通过）；排序与筛选对应 28 个主验收已按最新文件报告核对，无缺失／重试。
- 历史 Table、文件、格式细项、导航及其它已实现入口仍在核对中，未宣布清单穷尽。

## 前一批验收补强（2026-10-20，已验收）

本轮只补条件格式三个现有入口的独立验收：新增、修改、删除，分别登记为
[CF-001／CF-002／CF-003](e2e/FEATURES.md)，不再把旧的综合生命周期用例当作三个功能的主验收。
新增 [规则生命周期 E2E](e2e/format/conditional-rule-lifecycle.spec.ts)，各操作分别在 1280px／390px
执行，新增专项 6/6；条件格式与 lite/full 保存恢复相关回归 52/52（含这 6 项，1.4 分钟）通过，
零失败／跳过／flaky／重试。原综合用例保留，继续检查连续三次原生操作的历史链。

新增覆盖实际按钮、规则数量、范围／阈值／颜色回读、非命中格及相邻规则不变、原数值不变、
单次撤销／重做；新增规则包含无效数值后纠正重试，修改规则包含取消后重新打开仍为原值。
修改／删除直接用现有 Summary 规则，不依赖测试先新增成功；没有改演示数据或生产实现。
React 条件格式 Vitest 18/18、Core 相关 Vitest 67/67、脚本契约 17/17、React 类型检查、
功能登记、展现边界、循环依赖、文档链接及差异检查通过。对照表现有 175 项，历史细项仍待继续回填。

验收基线仍为 `1c47e643` 加旧工作区。开始时旧候选指纹与前轮 `ca9df2a…` 完全一致；
本轮前后生产源码指纹均为 `d9329e109bbad7e32606de0d71932aac14fd2305`，
旧 E2E（不含对照表及本轮新文件）均为 `1e8aa1b0d888ac5a00dc38be1b21db4f0de49ccc`，
lite WASM 仍为 `6d992f8ffd2d90f950ab18c180cc9dbddbf20c9a`。
因此沿用前轮 1129 条全量、全量单测、构建及 Lint 的同输入证据，不把专项重测称作新一轮全量。
新文件指纹 `18c7e4d4855de63c24454ad4572ebf77a89c4f02`；原链路仍为
React 按钮 → `runNativeConditionalFormatAtom` → Rust 原生命令及返回投影 → React，未加运行层。

报告 `/tmp/react-excel-conditional-lifecycle.json`、`/tmp/react-excel-conditional-lifecycle-related.json`；
新三项独立结果检查通过。旧全量报告单独核对会明确缺少 CF-001～003；
仅在确认原输入未变后，旧 172 项加新三项的分批证据核对为 175 项全部有成功记录。
本批已验收，完整历史功能点清单仍未穷尽；未 commit／push，旧工作区改动全部保留。

## 上一轮验收补强（2026-10-19，已验收）

按用户要求落地“功能点 → 独立主 E2E”对应规则，登记在 [E2E 对照表](e2e/FEATURES.md)，
由 `pnpm check:e2e-features` 核对真实 Playwright 采集结果；已接入 E2E 命令及 CI。
同一主用例不能重复充当多个功能的验收；skip／fixme／预期失败不算覆盖。
登记不等于运行通过，结果需用 `--results` 对照同一候选代码的 JSON 报告。
首轮登记 172 项；历史 CRUD、菜单选项等细项仍需回填、拆分，不能把登记数当完整产品覆盖率。

用户指出的 Shift 点击确实未接入。新增测试先复现只选中 B6 而非 A3:B6，
React 只转交 `extend`，既有 Core command 复用原锚点，同一次转换同步选区及指针；
不新增 atom、Rust 请求或状态层。已覆盖普通选择、Shift 点击、反向缩选、拖拽、
Shift 四方向／PageUp／PageDown、鼠标键盘混用，以及扩选后批量格式及单次撤销。
新增 36 条真实浏览器用例，桌面 1280px／窄屏 390px 分别执行。
最终完整 E2E 单轮 1129/1129，耗时 29.8 分钟，零失败／跳过／flaky／重试；
`pnpm check:e2e-features --results /tmp/react-excel-e2e-contract-full.json` 核对 172 项全部通过。
旧的 1093 条报告会明确缺失本轮 18 个选区主用例，不能当作这轮成功证据。
另修前置采集继承 JSON 输出环境变量、可能覆盖正式报告的问题；真实 CLI 回归已补，
脚本契约 17/17、Core 全量 3440/3440、React 全量 541/541 通过。
两包构建、React 类型、展现边界、循环依赖、Lint、文档链接及差异检查通过。
验收基线为 `1c47e643` 加当前工作区；浏览器运行前后 React 源码／E2E／Core 源码／
采集脚本指纹均为 `ca9df2a1bb5cdc187739722cd195c5f06ab85845`，lite WASM 均为
`6d992f8ffd2d90f950ab18c180cc9dbddbf20c9a`。原生未改，沿用前批原生验收。
日志 `/tmp/react-excel-e2e-contract-full.log`；服务 `http://127.0.0.1:5183/` 返回 200，
测试服务 5191 已退出。本轮选区修复与门禁已验收，历史功能清单的细粒度回填仍未完成。
treehelp／treehelp2 属于用户另一个项目，未纳入本仓；旧工作区改动保留，未 commit／push。

## 上一批次（2026-10-19，已验收）

继续 #12 的三个自定义填充列表功能：新增并复用、修改、删除。仅作为当前工作簿会话的填充预设，
保存／修改／删除不写格子、不生成原生历史；点击“应用序列”才复用已有 Rust 填充命令。
切表保留，新建／成功打开另一工作簿或刷新清空；不恢复已暂停的本地自动保存，不接拖拽自动识别。
具体操作、归属及证据见[自定义列表预设](docs/custom-fill-lists-wave.md)。
旧响应复活预设的边界先由单测复现再修复，Core 专项 23/23、React 专项 13/13、
真实 Worker 新列表专项最终 9/9 通过。Core 全量 3439/3439、React 全量 540/540；
完整 E2E 单轮 1093/1093，耗时 27.9 分钟，零失败／跳过／flaky，结束后代码与 WASM 指纹未变。
桌面／窄屏／中文截图已目检；两包构建、类型、Lint、边界、循环依赖及差异检查通过。
本批三个功能已验收，原生代码未改，沿用上一批原生全量证据；完整产品仍有未完成项。
上一批改动继续保留，不自动 commit／push。服务保持 `http://127.0.0.1:5183/`。

## 前一批（2026-10-16，已验收）

按用户要求，先将上一轮合并演示、测试夹具隔离、滚动边框及首帧修复提交为 `1c47e643`，未 push。
以下旧段落中的“未提交”是当时状态；上一轮 goal 已完成，完整产品 41 项范围并未完成。

本批按三项继续 #12：多列竖向独立序列、多行横向独立序列、双击填充柄沿相邻连续数据向下延伸。
原生先整体预检再统一写入，复用一条 Worker 请求、一次历史及既有 command atom；没有新的运行层。
保留原 66 组合并 demo，只增加 6 个空白格种子。缩放与已暂停的本地自动保存均未改。
具体规则、手测样例及证据见[独立序列与双击填充](docs/fill-independent-wave.md)。
本批已验收：新增浏览器专项 11/11、Rust 全量 3537 passed／10 ignored、WASM 192 passed／1 ignored；
Core 全量 3427/3427、React 最终全量 537/537。来源行高缓存专项先复现再修复。
完整 E2E 首轮 735 通过／1 失败／348 未运行；旧统计用例漏算新 D30:D31 样例，
保留精确总和及滚动断言并更新预期后，统计文件 7/7、剩余续跑 344/344 通过。
三份报告按测试 ID 去重，1084/1084 全部覆盖，无遗漏；不是一轮完整零失败运行。
桌面／窄屏截图已目检；静态门禁、类型、构建和差异检查通过。技能约束本批只交付三项，
没有新增运行层；存量超限文件仅做必要接线并在批次文档列明，不借本批扩大重构。
本批 goal 已完成，完整 41 项目标仍有剩余。本批不自动 commit／push；服务保持 `http://127.0.0.1:5183/`。

## 历史修复轮（2026-10-14 起）

### 保留合并演示、隔离测试数据与滚动边框修复（2026-10-16）

上一轮填充定位提交为 `643b93a6`，未 push。本轮不新增功能，不自动 commit／push。

撤回未经确认的演示迁移：默认 Sales Orders 仍保留原 66 组合并、128 列画布与 Summary，
未删改原样例。基础订单生成器保留完整数据，产品工作簿组合时再叠加合并种子。
需要 1,000 条完整订单的筛选、排序、查找、行列结构等 E2E 改用
`e2e/fixtures/plain-sales-orders/`；仅替换初始数据，仍使用同一视图、UI Core、真实 Rust Worker／WASM。
未注册新产品页面，未新增 atom、请求协议或运行层。单测验证默认样例未变及四地区各 250 条。

复现并修复 `border-hidden-merge.spec.ts`：左邻格虽在缓冲窗口，却已被滚动裁剪，
不能继续独占共边。Core 保留相邻边框事实，React 只提供实际裁剪判断；
合并格在邻格不可绘制时接手该边段，冻结接缝仍只画一次。
已通过隐藏合并边框及演示隔离 E2E 6 项（1280px／390px）；筛选三组 26 项通过。
窄屏菜单补可访问名称；旧筛选布局测试改为核对既有两行布局及筛选前后高度不变，没有改生产 CSS。

完整回归另抓到窄屏跨表公式输入后横向位置被拉回：恢复的区域首格只剩一部分可见，
首帧补偿却把缓冲窗口当成实际可见窗口。现在只对发布真实尺寸前已完整可见的目标补偿，
保留手动滚动／切表恢复位置；名称框在请求前或等待中定位仍正常。未新增定位标记或状态层。

当前验收基线为 `643b93a6` 加本轮工作区。浏览器 1,073 项按失败处停止、隔离数据、
定向复测、续跑剩余文件的方式全部覆盖，曾失败的项目均复测通过；不是一次全量零失败运行。
原先依赖完整订单／16 列的测试只换测试入口，不改预期条数。边框旧断言改为检查实际共边
绘制方的颜色、线型与线宽，仍验证另一面不重复绘制、撤销／重做及行高不变。
最终代码的相关 30 项真实 Rust/WASM E2E 全过，覆盖跨表 Enter／Escape、名称框、首帧
冻结补偿、隐藏合并边框及默认演示往返（1280px／390px）。
Core 全量 3420/3420，React 全量 533/533，共享 React Cells 24/24。
并行跑 Core、React、浏览器、Lint 时，React 曾有两项超过默认 5 秒；其余检查结束后
独立重跑 React 全量，51.23 秒全部通过，未改超时或断言，不把前一次结果写成通过。
Core 构建、React 类型和生产构建、展现边界及循环依赖通过。Lint 全量发现首帧文件
一处行宽超限，换行后该文件复查通过；文档链接与 `git diff --check` 通过。
桌面／窄屏截图保存在 `/tmp/react-excel-goal.w8RXUx/` 并已目检；共享视觉脚本不可用，
使用 Playwright 截图与坐标、滚动、溢出、焦点断言。新写／大改文件均低于 300 行。
本轮 goal 已完成，未 commit／push。用户开发服务仍为 `http://127.0.0.1:5183/`；
测试临时服务已正常退出，生产构建不包含测试夹具页面。

### 填充定位修复（2026-10-16）

先按用户要求提交上一批：`6add7193` 为 CI 磁盘／导航测试修复，`2ecdda25` 为超链接功能；未 push。
本轮只修已有填充定位：名称框把连续范围传给既有 scrollToCellAtom，UI Core 按轴检查实际尺寸，
能容纳则整体 nearest 可见，过大则退回首格；已经可见不多滚。沿用隐藏零尺寸与冻结区计算，
没有新增 atom、工作簿镜像、Worker 请求或 Rust API。
另修首次原生投影补回特殊行高／列宽后目标被挤出底边：尺寸合并沿用既有滚动计算，
只保住更新前已可见的目标；手动滚离、其它工作表、重复尺寸不会强行追踪。
对应 Core 回归先失败 3 项，真实名称框单格用例也先失败（底边超出 18px），修复后均通过。

真实浏览器继续抓到边缘填充柄按下即自动滚动的问题：DOM 指针捕获记录实际移动，超过 3px 才启动
原有自动滚动。松手、Escape、失焦和指针取消仍走既有 command；按住未移动不预览、不写入。
新增 Core 范围几何回归先失败 5 项、React 按下未移动回归先失败 1 项，修复后均通过。
新增名称框真实浏览器用例原实现先失败；覆盖桌面／窄屏、重复定位、隐藏列、过大范围及边缘按住。

四个千行填充旧用例先通过真实界面取消演示压力合并，仍使用原订单、原填充断言与单步撤销断言。
普通拖拽测试先露出实际目的格再取坐标，不再向缓存的屏外坐标拖拽；专门的四边自动滚动用例保留。
Core 全量 3419/3419（4 workers）、React 全量 529/529（2 workers）；
类型、两包构建、Lint、边界、循环依赖通过。
Rust 与 WASM 未改，沿用 `2ecdda25` 原生验收。本轮填充修复暂未提交。

验收基线为 `2ecdda25` 加本轮工作区。填充／定位专项共 67 项分组通过；桌面 1280px 与窄屏
390px 截图已复核，含隐藏列、过大范围、边缘按住与无额外滚动；共享视觉脚本不可用，
使用 Playwright 截图及尺寸、溢出、焦点断言。新写／大改文件均低于 300 行。
执行 `pnpm --filter @einfach/react-excel e2e --max-failures=1` 的完整集合共 1071 项，
实际 130 通过、1 失败、940 未运行，3.4 分钟在首个失败处自动停止，没有重启全量。
失败为 `e2e/editing/filter-interactions.spec.ts:31` 的筛选复制场景，期望过滤 750 行、实际 836；
本轮不扩大为筛选修复，也没有把实际数改进断言来伪造通过。完整回归仍未通过。
单独重跑该用例仍失败；只读检查当前导入种子，1000 行区域值中实际只有 164 个 West，
因此过滤 836 与数据一致。合并压力种子已把部分原始地区替换为空值／锚点文字，旧 250 条假设失效。

### 单元格超链接（2026-10-16，专项通过，完整回归未通过）

本地自动保存按用户要求暂停。本批仅三项：插入／打开链接、修改地址与显示文字、移除链接。
React、UI Core、Rust Core、WASM 的实现与专项测试均按 `hyperlink/` 聚合；Worker 原生接线
放在 `rust-workbook/hyperlink/`，不让普通 UI 模块直接依赖 WASM。链路仍是一条 command atom
发送一个原生命令，返回一次可见投影；没有 React workbook 镜像或逐格链接 atom。
地址为 Rust 稀疏元数据，不加入 cellStyle，不复制一套显示值；历史、插删行列、剪贴板及文件恢复复用原链路。
只支持 HTTP／HTTPS，示例在 Sales Orders B2／B3，公式 HYPERLINK() 暂不自动变成可点击链接。
边界及操作见[当前能力](docs/current-capabilities.md)。已于 `2ecdda25` 提交；未 push。

提交前基于 `29236233` 的工作区：UI Core Vitest 3405/3405（4 workers）、React Vitest
527/527（2 workers）、Canvas 14/14、共享 React Cells 23/23；Rust Core 默认全量通过、
WASM 原生 192 通过／1 忽略，API 快照只增加一个 change_hyperlink 导出并通过架构检查。
lite/full WASM、两包构建、类型、Lingui 严格编译、Lint、展现边界、循环依赖通过。
超链接专项 7 项覆盖种子、三项操作、拒绝／重试、历史、复制／剪切、文件恢复、中英文及
1280／390px 布局／焦点；共享视觉脚本不可用，沿用 Playwright 的截图与溢出／焦点检查。

完整 1069 项浏览器集合实际执行至 104 通过、17 失败、1 中断，余下 947 未运行，已停止失败长跑。
不能记为全量验收通过。定向复现 Summary A40:A41：nearest 定位只保证首格可见，末格填充柄在屏外；
千行填充旧用例使用 A2:A1001，现有合并种子使选区合理扩到 A2:DX1001，与旧断言冲突。
本批未改这些填充／定位实现，也未降低断言或拉长超时；后续单独处理，不暗中纳入超链接三项。
原生回归另抓到本批链接接线对扩表自动表头做源格反查而产生下溢，已只映射真实粘贴矩形并补测；
扩表 12/12 通过后，重新跑过 Rust Core 默认全量，不沿用失败结果。

同时按批次规则检查上一次推送 `29236233`：远程 CI 实际失败为 Rust runner 磁盘耗尽、
Node 24 导航测试 5 秒超时。前者取消 target 缓存并关闭 CI 原生调试符号，后者把连续按键置于
React act 批次；不提高超时、不减少断言。远程结果须待用户授权推送后再检查，不宣称已转绿。

### Lingui 遗漏文案补齐（2026-10-16）

针对溢出详情截图，补齐现有功能弹窗、动态菜单选项、统计、工作表操作及可访问标签。
Core 的已知英文反馈在 React 显示处经 Lingui 翻译，包含编辑拒绝、剪贴板、定位、
排序筛选、文件恢复、函数说明与历史名称；未知原生诊断保留原文，不更改 Core／Rust。
单元格值、工作表名称、公式标识、日期解析类型和汇总函数值均保持原样，缩放行为未改。
新增源码文案检查与参数化反馈单测；真实浏览器覆盖截图弹窗的 1280／390px、
常用弹窗及中文编辑拒绝后的取消、重试、历史和语言切换。未宣称全量底层异常已翻译。

### Lingui 首批接入与 Vite 升级（2026-10-16）

按用户要求接入 Lingui 6.9.1，并升级当前主线到 Vite 8.3.4／React 插件 6.1.2。
Vitest 2 与 Vite 8 混用实际启动失败，因此主线统一到 Vitest 5.0.5，根入口改为
`vitest.config.ts` 的 `test.projects`；暂停包不纳入本轮。开发／CI 使用 Node 22.19+，
不更改已发布包的 22.12 消费者基线，CI 另在该版本加载构建后的 ESM/CJS 入口。

官方 Provider、原生宏转换和 PO 词典负责界面语言，不新增语言 atom、翻译 Hook 或业务状态镜像。
右上角可中英文切换；URL／保存偏好／浏览器语言依次作为初始语言来源，存储受限仍可切换。
覆盖身份栏、文件面板、分类、常用字体／数字格式、剪贴板、历史、快捷公式、重算、隐藏／冻结，
以及名称框／编辑器标签。高级弹窗、统计详情、工作表操作与 Core／Rust 诊断仍有英文，
不能据此宣称整个产品国际化完成；数据、表名、公式和数字格式语义保持原样。

语言单测验证草稿、光标、选区不因词典切换重建，同页两工作簿只共享语言、不共享命令状态。
真实 Rust 浏览器用例覆盖 1280／390px 的中英文编辑、撤销、分类切换和刷新；生产预览也独立验证。
相关编辑回归中，旧焦点测试的 B100／C100 已落进 demo 新合并区 B99:D101，改用普通 B300／C300；
列 B 的定位补 `exact`，避免同时匹配 BA…BZ。没有改业务行为或削弱原焦点／格式断言。
验证命令见 README：根 `pnpm test`、`pnpm build`、React `i18n:check`、定向 Playwright；
本轮未执行完整浏览器集合，也未 commit/push。

暂停新增功能，按用户截图修复已有表现。滚动时旧投影曾被搬到新窗口位置，真实浏览器捕获到
纵向 28px／横向 120px 的中间帧跳动；删除 `placementWindow`，旧格、行号与合并格保留原坐标，
新投影回来后统一替换。没有新增缓存、atom 或 Rust 请求层；远距离跳转未返回的数据不以旧格冒充。
六个工具栏下拉框补用已有 `tool-select`，统一 28px 高度、字号与圆角，保留键盘焦点提示。
用户第二张图的红色双线来自 B6 原始数据的 double 下边框，确认来源后保留正常边框功能。

新增浏览器回归先失败 5/5，修复后与冻结／切表交叉共 19/19 通过；React Vitest 428/428、
类型检查、UI Core 与 React 构建、展现层边界通过。桌面 1280px／窄屏 390px 截图已复核；
共享视觉脚本不可用，沿用 Playwright 的尺寸、溢出和焦点断言。未重复全量 E2E，未提交。
子 agent 另确认待处理：名称框对已可见格强制顶对齐；顶部分类标签及底部缩放控件仍为无响应占位。

续修（按用户指定只处理前两项，缩放保持不动）：名称框改用既有双轴 nearest，已可见目标不滚动、
离屏目标只滚到可见。顶部分类由 UI Core 的一个 store 内状态及 command atom 驱动，React 复用
既有工具；Start 保留全部入口，其余分类筛选对应工具。分类支持方向键／Home／End，窄屏完整显示
五个标签；隐藏入口不卸载快捷键弹窗。新增浏览器专项及工具栏样式交叉 7/7、React 单测 429/429、
UI Core 分类隔离单测 1/1、类型与两包构建通过。1280px／390px 截图已检查；未改 Rust，未提交。

### 已有功能交叉回归／错误恢复（2026-10-14）

只补已有行为，不新增功能，缩放保持不动。参考 Univer 固定提交
`209b81ad90f8a126ad65dc51f6efa604013a3c77` 的
[筛选后复制](https://github.com/dream-num/univer/blob/209b81ad90f8a126ad65dc51f6efa604013a3c77/packages/sheets-ui/src/services/clipboard/__tests__/clipboard-copy-filter.spec.ts)、
[拒绝非法输入后继续写入](https://github.com/dream-num/univer/blob/209b81ad90f8a126ad65dc51f6efa604013a3c77/packages/sheets-data-validation-ui/src/controllers/__tests__/dv-reject-input.controller.spec.ts)、
[撤销重做](https://github.com/dream-num/univer/blob/209b81ad90f8a126ad65dc51f6efa604013a3c77/packages/core/src/services/undoredo/__tests__/undoredo.service.spec.ts)
的场景，不复制实现或引入它的依赖。Luckysheet 已归档，本次检查主分支没有找到常规测试目录或 test 脚本。

- 剪贴板权限拒绝 → 原数据／旧快照保留 → 重试 → 撤销重做；包含切到 Formulas 后键盘粘贴。
- 数据验证拒绝 → Escape 取消 → 保留原 redo → 名称框定位下一格 → 再编辑／撤销。
  单元格和公式栏入口均覆盖 1280px、390px。
- 筛选、合并、冻结、文件打开失败与剪贴板／历史交叉沿用现有真实 Rust E2E；
  筛选公式用例改为先定位相邻格再取值，不再假定 nearest 定位后下面两行一定挂载。

新增 8 条浏览器用例实际抓到：浏览器拒绝剪切写入时，Rust 已替换旧快照，导致下一次粘贴丢格式。
修复为 `React → UI Core command → Rust 暂存快照 → 浏览器写入 → Rust 确认/丢弃`；
失败保留正式快照，成功立即释放暂存槽；等待期间工作簿已变则拒绝迟到确认。
不新增 workbook 镜像、自动重试、历史条目。`clipboard-capture.ts` 只集中原生快照调用，
runtime 仍管理命令/token，数据和样式留在 Rust。旧 WASM capture 导出保留，新增导出及 API 快照同步更新。

验证：交叉 E2E **64/64**；UI Core Vitest **3264/3264**、React Vitest **429/429**；
WASM 原生 **190 通过、1 忽略**，API／架构 **10 通过、1 忽略**；lite/full WASM 重建、
展现层边界、类型检查和 React 构建通过。抽取后的剪贴板／格式刷／Copy As 追加 E2E **26/26**、
command／Worker 单测 **52/52** 通过（与前述集合有重叠，不累加成独立用例数）。
这不是全量 E2E 或跨浏览器验收；Worker 崩溃／重连及刷新持久化不据此宣称完成。未提交。

### 真实操作修复：公式栏键盘失焦（2026-10-14）

在真实 Chromium 操作中复现：公式栏 Enter 保存后，输入框因 pending 禁用而失焦到 body，
方向键无法继续移动选区；校验拒绝后直接输入也没有进入保留的草稿。Escape 取消则仍停在公式栏，
无法恢复网格导航。原测试只检查保存值，且 E2E 的 `locator.press()` 会主动聚焦目标，掩盖了失焦。

`FormulaBar.tsx` 根据既有 command 结果恢复 DOM 焦点：保存／取消回自己的网格，拒绝回公式栏；
用户已移到名称框等控件或原 DOM 已卸载时不抢焦点。取消先同步结束草稿，blur 只提交仍活动且
未在提交中的会话，防止取消后重新提交或写入一个多余的 blocked 状态。Rust 与 UI Core 命令不变。

新增 `e2e/editing/formula-bar-focus.spec.ts`，使用 `page.keyboard` 验证当前真实焦点的连续操作，
覆盖桌面／窄屏的保存→方向键→取消→撤销重做、非法输入→键盘修正→成功提交，以及慢响应后
名称框草稿保留。修复前 4/5 失败，修复后 5/5 通过。新增对应 React 单测复现保存、取消，
控制浏览器失焦边界及异步返回，另验双工作簿焦点隔离；首批单测修复前 3/4 失败。

交叉验证：8 个相关浏览器文件 **53/53**，React 全量 **503/503**；两包构建、React 类型检查、
展现层边界、循环依赖与本轮 ESLint 通过。测试基于 `5e38d559` 的当前未提交工作区；
这不是全量浏览器验收，未改缩放，未 commit/push。之前覆盖率报告仍是单测审计收尾时的快照。

### 真实操作修复：草稿所有权与失焦后连续编辑（2026-10-14）

本轮从连续操作抓到两处问题，不以单测通过数量代替 bug 证据：

- Summary H45 输入非法整数 `5.5`，点击 H44 触发失焦提交；被校验拒绝后再双击 H44，
  原草稿及错误被新编辑覆盖。格内／公式栏两入口、桌面／窄屏及显式取消的 6 条 E2E
  修复前全部失败。UI Core 现在拒绝用新编辑替换活动草稿，拒绝后回到原格，React 只恢复其焦点。
- 正常修改 B3 后直接双击 C4，第一笔写入成功但第二格编辑不打开；真实 Worker 延迟写入时也能复现。
  第二组首批 4 条 E2E 修复前 3 条失败。双击现在等既有写入的完成结果，成功才开始下一格；
  失败保留原草稿，结果未知不解除原锁。用户已改选别处、换连接或进入名称框则丢弃迟到意图。
- 收尾追加验证 Enter 等待期间双击下一格，发现旧 Enter 的焦点恢复会把新编辑器移焦点回网格。
  格内入口修复前失败，公式栏对照通过；`CellEditor` 现在先核对 DOM 输入框仍属于原格，
  不让旧操作处理下一格的焦点。两种入口的对应 React 测试及真实浏览器测试均补入连续编辑回归。

链路仍是 `React 双击 → 既有 UI Core 开始编辑命令 → 既有写入结果 → 开始草稿／保留旧草稿 → React 焦点`。
只给已有写入 ticket 增加完成 Promise，没有第二次写入、自动重试、全局队列或 React 状态镜像。
普通开始与等待后的开始在同一个文件复用草稿检查。新增测试各自只负责草稿所有权、失焦连续编辑；
React 对应测试复用现有测试文件。专项浏览器用例另检查实际焦点、写入地址、一次提交、撤销隔离，
包含等待时被拒绝及名称框／新选区覆盖旧意图。

验证：10 个相关浏览器文件 **79/79**；UI Core 全量 **3386/3386**、React 全量 **509/509**。
两包构建、React 类型检查、展现层边界、循环依赖及本轮 ESLint 通过；构建仍有既有的
500KB chunk 提示，不是构建失败。新增或实质修改的源文件／测试均低于 300 行。

缩放未改，Rust 未改，未 commit/push。本轮专项回归不替代全量浏览器验收。

### 单测补强第二轮（2026-10-14）

本轮只改测试与测试 fixture，没有修改产品实现，没有重复跑未受影响的 Rust／E2E。
新增 **54 条 Vitest**：

- React 浏览器剪贴板边界 22 条：原生 API 缺失、同步／异步权限拒绝、Rust Promise 拒绝、
  HTML 转义、Copy As 不携带内部 token、空文本／非文本内容、解码失败与重试。
  直接测试真实读写函数，只 mock 浏览器边界，避免整模块 mock 漏掉异常处理。
- UI Core 原生快照调用 13 条：准确坐标、普通复制与格式刷槽隔离、导出缺失、
  拒绝旧即时捕获兜底、迟到确认丢弃、原生失败传播。
- UI Core command 异步结算 13 条：Rust／浏览器不同完成顺序、三个等待阶段的重复操作阻止、
  失败清理、显式重试、读剪贴板期间连接／编辑状态改变、错误 acknowledgement 不发布投影。
- 文件命令新增 6 条：OS 读取、导出、下载、Worker 创建失败后的恢复，退出后的迟到导出不下载，
  下载未结束时阻止替换工作簿。既有大小校验补入小数、NaN 与 Infinity。

遵守单一职责：新增测试各自覆盖一个边界；两组 command 测试共用
`spreadsheet-ui-core/test/support/system-clipboard-store.ts`，不复制 store 初始化。
定向 V8 覆盖率：`browser-clipboard.ts` 和 `clipboard-capture.ts` 的行、分支、函数均 **100%**；
仅说明这两个模块，不据此宣称整条链路或全项目完整覆盖。
UI Core 全量 **3296/3296**、React 全量 **451/451**，类型、两包构建、展现层边界、
本轮文件 ESLint 与 `git diff --check` 通过；构建仍有既有大 chunk 提示。
下一轮继续核对编辑／投影异步恢复缺口；目标仍在进行中，未 commit。

### 编辑／投影单测补强第三轮（2026-10-14）

新增 **45 条**，仍只改测试：

- 编辑 ACK 新增 13 条：缺失／非法 revision、错误 sheet、合法版本确认后不重复提交；
  不确定的写入继续保留草稿和锁，不把未知结果当成失败再自动重发。
- 有限超时操作新增 25 条：非法 deadline 使用默认值、同步／异步拒绝、迟到 resolve/reject、
  timer 清理、后续操作不受旧计时器影响、异常 error 对象安全生成反馈。
- 可见投影新增 5 条：旧请求拒绝或错误响应仍排空最新窗口、中间窗口合并、
  最新请求失败保留上一帧并允许显式重读、非法窗口不占用读取通道。
- React 新增 2 条：公式栏失败后修改并成功提交、投影 error → ready 后恢复编辑。
  同时补全原有“可重试”测试：不止改草稿，还必须真的再次提交并编辑下一格；
  验证三次写入的地址／内容、新 requestId、无额外投影读取。

按职责只新增 `editing-bounded-operation.test.ts`；其余扩展既有对应测试文件，均低于 300 行。
调用链和状态归属未改：React 事件 → UI Core command atom → Rust；测试仅控制异步边界。
本轮专项 UI Core **50/50**、React **5/5**（含原有测试）通过；全量 UI Core **3339/3339**、
React **453/453**，类型检查、两包构建、展现层边界、本轮 ESLint 与 diff 检查通过。
生产代码未变，没有重复跑 Rust／E2E；既有构建大 chunk 提示未扩大处理。
单测补强目标仍在进行，未 commit。

### 历史／格式恢复单测补强第四轮（2026-10-14）

新增 UI Core **14 条**：历史错误 ACK、受影响工作表不存在、换连接后的迟到结果；
多区域格式失败后重试、非法 ACK、不重复提交、旧连接结果不能解除新操作的忙碌状态。
另补全 Core 与 React 两个已有重试用例，必须真实完成“失败 → 重试成功 → 重做”，
不再只断言重复失败。没有修改生产代码或增加状态层。

全量 UI Core **3353/3353**、React **453/453**，类型、两包构建、展现层边界、
本轮 ESLint 和 diff 检查通过；没有重复未受影响的 Rust／E2E。
按用户确认，后续审计范围扩大为整个 React + UI Core 的覆盖缺口，不以这些专项通过代替完整审计。

### React + UI Core 完整覆盖扫描（2026-10-14）

两包完整 V8 扫描通过：React 453 条、UI Core 3353 条；原始行覆盖率分别为
94.59% / 90.46%，分支为 88.80% / 83.34%。完整模块清单、低覆盖文件及优先级见
[单测覆盖缺口审计](./docs/unit-test-coverage-audit.md)。这些数字不是产品完成率。

扫描后新增 Worker 结算／故障测试 11 条并通过，传输模块定向四项覆盖率达到 100%；
没有修改生产代码。完整基线百分比未混入后跑的专项结果。
后续优先处理 Runtime 失败反馈、拖拽取消、自动尺寸 DOM 测量；冻结已有真实 E2E，
另补组合单测；未被 React 调用的公共 API 单列，不为了数字接回旧链路。未提交。

### DOM／组件恢复单测补强第五轮（2026-10-14）

新增 React **23 条**：Runtime 失败／替换／卸载 6 条、自动尺寸测量 4 条、
自动滚动生命周期 6 条、尺寸取消后重试 4 条、真实网格结束事件 3 条。
新增文件各自只测一个边界，所有新增／改动测试均低于 300 行。
真实网格单测先复现 lostpointercapture 后选区仍 active；修复只在 WorkbookGrid
绑定已有取消处理器。新的真实浏览器捕获释放回归也通过，没有新增 atom 或控制层。

React 全量 **476/476**、类型、两包构建、边界和本轮 lint／diff 检查通过。
浏览器尺寸／拖拽交叉 **10/12**，隔离重测失败用例 **1/2**；不能记录为全绿。
确认新交叉缺陷：Summary F90 的多行公式栏高度与投影窗口互相影响，网格高度逐帧在
417/447px 间切换，第 90 行表头反复卸载，点击无法稳定完成。另有一次自动尺寸后焦点失败，
隔离重测通过但尚未证明同因。具体证据见[审计报告](./docs/unit-test-coverage-audit.md)。
保留原失败测试，不放宽断言；下一步先处理这个布局循环。未提交，缩放未动。

### 视口布局循环回归第六轮（2026-10-14）

修复第五轮确认的 F90 布局循环：现有 setViewportSizeAtom 在缩小窗口时保留原本可见活动格，
复用 nearest；手动滚离、隐藏、冻结遮挡、其它表或首次测量不追过去。公式栏仍按内容展示多行，
没有增加状态层、单元格镜像或第二次数据读取。

新增 Core **10 条**、桌面/390px 连续帧 E2E **2 条**。Core 两个正向用例先失败后通过；
最终 UI Core **3374/3374**、React **476/476**，名称框/自动尺寸/冻结/拖拽 E2E **20/20**。
第五轮失败的两条原测试不改断言均通过。类型、两包构建、展现层边界、循环依赖、lint、diff 通过。
本轮实现 100 行、扩展单测 199 行，遵守单一职责；未改 Rust，未重复其全量回归。
接着审计冻结组合、交互一致性与剩余错误分支，不宣称全部覆盖缺口已补齐；未提交。

### 冻结／键盘／分列恢复单测补强第七轮（2026-10-14）

只改测试，新增 React **22 条**：冻结窗格 10、工具栏标签键盘 9、分列异常恢复 3。
冻结覆盖非默认尺寸、三个窗格、单轴、视口裁剪和旧内容清除；标签验证焦点/ARIA/store 隔离；
分列验证失败后真实重试、重新预览及覆盖授权、提交中关闭/重复操作门禁。
另将 Core Table 既有失败用例补到修改草稿并成功重试，不仅停留在错误状态。

React 全量 **498/498**、Core Table 专项 **17/17**；FrozenGrid/RibbonTabs 的定向
V8 四项覆盖率均 100%，不代表整包 100%。类型、两包构建、边界、lint、diff 通过。
本轮未改生产代码，没有重复未受影响的 Rust/E2E；新增测试各自单一职责且低于 300 行。
继续做剩余面板异常分支及公共 API 的审计收尾；未提交，缩放未动。

### 本轮单测补强验收（2026-10-14）

最后核对八类原生面板的拒绝、恢复、迟到结果与并发门禁；补数据验证写入断连成功/失败 2 条，
加强数据验证、去重、筛选的真实重试。未接入 React 的公共接口已按用途单列，不擅自删改或接回旧链。
详细范围、证据及保留欠账见[覆盖审计结论](./docs/unit-test-coverage-audit.md)。

最终完整带覆盖率运行：React **498/498**（101 文件），UI Core **3376/3376**（231 文件），
合计 **3874 条**。相较单测目标开始时净新增 **181 条**，另强化多个旧用例；不是把各轮专项重复相加。
React 行/分支覆盖 **97.41%/89.09%**，UI Core **90.50%/83.45%**。
最终两包构建、类型、边界、循环依赖、lint/diff/文档检查通过；修复相关 E2E **20/20**。

两包全范围审计与本轮主线高风险补强完成；公开未接入 API 的契约欠账、低风险回调仍明确保留，
不宣称 100% 分支覆盖、全部产品可用或完整 E2E 验收。保持原链路，没有新控制层；缩放未动。
全部改动未 commit/push，HEAD 仍为 `5e38d559`。

## 全范围核对

| 原编号 | 能力 | React 当前状态 / 剩余工作 |
| --- | --- | --- |
| 01 | 工作表管理 | 创建、切换、重命名、删除、左右移动及单元格/剪贴板静态跨表引用随动已有；会话内每表视图记忆通过全量 E2E 578/578；衍生引用随动及刷新持久化待补 |
| 02 | 行列结构、清空 | 清除内容/格式/全部、连续选区行列插删及原生历史已接 React；多区域三种清除及一次撤销／重做已验收（完整 E2E 959/959、Vitest 5711/5711）。单元格局部位移等扩展待补 |
| 03 | 行高、列宽、隐藏 | 大字体撑高所在行；输入/拖拽/自动适应行高列宽、恢复默认尺寸、隐藏/恢复行列已接入；本批三项已验收，合并格策略见[本批记录](docs/size-interaction-wave.md) |
| 04 | 合并与拆分 | 合并、合并后居中、取消合并三项已验收，含剪贴板/导航回归及原生种子；冻结交叉已验证，见[合并记录](docs/merge-wave.md)及[冻结记录](docs/freeze-wave.md) |
| 05 | 冻结窗格 | 首行、首列、按当前格冻结／取消冻结三项交互已验收，含原生种子、编辑遮挡修正及全量 E2E；原生文件保存／打开恢复已接入，自动刷新恢复仍待补，见[本批记录](docs/freeze-wave.md) |
| 06 | 选区、定位 | 单区、行列整表、键盘、名称框已有；本轮补接鼠标 Shift 点击／拖拽扩选，新增选区 E2E 36 项，完整回归 1129/1129 通过。A1／R1C1 定位弹窗、跨表定位、最近 10 次定位已验收。常量／公式／空白原生定位、多区域结果显示及去重计数已验收，含长区域活动格修复，完整 E2E 946/946、Vitest 5699/5699 通过。手动非连续多区、其他 Go To Special 条件及完整多区域操作仍待补 |
| 07 | 分组与大纲 | 行分组／取消、列分组／取消、折叠／展开三项已验收，含嵌套、层级控件、原生历史及 lite/full 保存恢复；完整 E2E 709/709、Vitest 5371/5371 通过。页面刷新持久化仍随 #41 核对 |
| 08 | 直接编辑 | 编辑、提交、取消、连续编辑、原始数值、强制文本、布尔值、百分比、无歧义日期输入、Alt+Enter 换行和输入法组合键保护已有；24 小时／累计时长、AM/PM、显式带分数输入通过全量 E2E 492/492；地区日期、日期时间组合、亚秒及真实系统输入法跨浏览器交互仍待补 |
| 09 | 公式栏与引用 | 公式栏可编辑，同表点击/拖选引用、F4 相对/绝对/混合引用已验收；键盘引用拾取、Shift 扩展、F2 模式切换及跨表点击/拖选/键盘引用已有。完整原生目录补全、插入草稿及 lite499/full502 内置条目的中英文参数帮助已验收，含可选／重复组、示例及实现限制；最终完整 E2E 2474/2474 通过。完整参数填写表单与全部引用着色仍待补 |
| 10–11 | 剪贴板、选择性粘贴 | 系统复制/同表剪切/矩形粘贴、内容模式、转置、跳过空白、平铺、加减乘除、组合选项面板、仅列宽、Copy As 文本/Markdown/HTML 已接入 Rust 数据；跨表剪切、部分公式范围移动、多区域、Copy As 图片及完整投影、批注等选项待补 |
| 12 | 自动填充与序列 | 定向复制、序列面板、四方向填充柄及星期／月份／自定义列表面板已验收，见[名称序列记录](docs/fill-named-series-wave.md)；日期面板与拖拽已接入，见[日期记录](docs/date-input-wave.md)；多行列独立序列及双击填充已验收，见[独立序列记录](docs/fill-independent-wave.md)；自定义列表会话预设的新增复用／修改／删除已验收，见[预设记录](docs/custom-fill-lists-wave.md)，自定义列表拖拽识别仍待补 |
| 13 | 分列 | 分隔符拆列、固定宽度拆列、目标位置与覆盖确认已验收；逐列常规／文本、显式日期顺序、跳过列已验收；小数／千位分隔符及尾随负号已验收（全量 E2E 597/597）；月份名称及文件导入等仍待补 |
| 14 | 查找替换 | 字面量／通配符查找、分页完整结果列表、结果定位、当前／全部替换已验收；格式及保护交叉语义随对应项继续核对，见[列表批次](docs/find-results-wave.md) |
| 15、36 | 撤销重做及历史 | 单格输入、格式、清除、行列尺寸/隐藏、粘贴、同表剪切、工作表管理的 Rust 撤销/重做及最近操作列表已有；其余命令历史与持久版本待补 |
| 16 | 富值及特殊类型 | 基础值渲染已有；特殊类型入口与编辑待补 |
| 17 | 常用格式工具 | 常用字体、颜色、对齐等已有；颜色选择/恢复默认已通过全量 E2E 432/432；水平/垂直对齐及旋转直接选择通过全量 442/442；自定义字号、增大/减小字号通过全量 455/455，其余完整工具待补 |
| 18–19 | 单元格格式、数字格式 | 数字/百分比/货币设置弹窗通过全量 E2E 469/469；科学计数、分数、时间通过全量 479/479；日期样式、文本格式和原生预览通过全量 E2E 569/569；完整格式会话与其余类别待补 |
| 20 | 格式刷 | 单次、连续、退出三项普通格式刷已接 Rust，含完整替换／平铺、原生历史、剪贴板隔离、失败重试；全量 E2E 506/506 通过，条件格式规则随对应引擎能力继续核对 |
| 21–22 | 条件格式、数据验证 | 数值、公式、排名、色阶、数据条、字面量文本、按类型和值的重复／唯一值及停止后续规则已验收；本轮补齐自动／数值／百分比／百分位／公式阈值及三箭头／交通灯／旗帜图标集。整数／小数、列表、日期／时间、文本长度验证及八种比较条件已有；相对公式验证、选格输入提示及 Stop／Warning／Information 已验收，后两者仅明确 Continue 后提交，非法 Stop 批量输入整次拒绝。最终完整 E2E 2474/2474，其中高级条件格式70、验证34项全过。通配符／地区比较、按显示格式比较重复及其它未列高级能力仍待补 |
| 23 | 边框、旋转及格式投影 | 边框位置、六种线型、颜色设置及共边后写覆盖、清除/撤销、冻结接缝已验收，通过全量 E2E 557/557，含合并/隐藏/填充/粘贴交叉；对角线、高级旋转及条件格式边框交叉等仍待补 |
| 24–26 | 公式解析、函数目录、自定义公式 | SUM／AVERAGE／COUNT 快捷草稿、原生完整目录搜索／分类、插入草稿及扩展补全已验收；显式单格数组引用保形、溢出范围查看与阻挡格定位已有。当前 lite499/full502 内置条目的完整中英文原生帮助及 Formulas → Custom formulas 入口已验收：注册／替换／移除工作簿级 Rust 参数表达式、跨表调用／重算、历史和文件往返，不执行任意脚本。最终完整 E2E 2474/2474，其中帮助16、自定义公式31项全过。完整参数填写表单及宿主脚本／异步函数产品能力仍未完成，不等于 #24–26 全部范围完成 |
| 27 | 命名区域与名称管理 | 管理器的新建、修改、删除已验收，含 Rust 动态范围、原子历史、结构随动、名称消费者改写及 v1 保存恢复；最终完整 E2E 721/721、Vitest 5401/5401、Rust 默认 3164／lite 3124 项通过。名称框定位／快捷创建与 Go To 名称定位已验收（完整 E2E 728/728、Vitest 5423/5423）；命名公式及局部作用域仍待补，不能将本批视为 #27 全部完成 |
| 28 | 重算与异步公式 | 当前表／整个工作簿手动重算、显示公式已验收：完整 E2E 922/922、Vitest 5648/5648；自动／手动计算模式、真实异步调用及失败恢复仍待补。当前主线只接 Rust，不恢复 TS/Solid 产品路线 |
| 29 | 排序与筛选 | 升序、降序、多列排序、级别优先级调整、区分大小写及空格置顶／沉底已验收，见[排序批次](docs/sort-wave.md)，全量 E2E 888/888。原生条件筛选、重新应用、清除筛选及复制/排序/统计交叉已验收；指定区域、表头入口、单列清除、完整候选值勾选／搜索／分页已验收。查询全选、高级筛选、颜色／自定义顺序等仍待补 |
| 30 | 删除重复项 | Rust 区域内原子去重、比较列、表头及文本比较选项已验收，完整 E2E 603/603 通过。分页预览、重复记录定位、首条保留记录定位已验收，完整 E2E 608/608、Rust 默认 3002/lite 2962 项通过；不以旧 UI Core scanner 测试宣称产品完成 |
| 31 | 状态栏摘要 | Rust 六项、显示项配置、恢复默认、原始数值复制已验收；排除筛掉行、保留手动隐藏行的统计已接 Rust 并通过全量回归，见[既有记录](docs/status-bar-wave.md) |
| 32 | Excel Table | 创建、重命名、转普通区域、汇总行、列名编辑／定位、手动范围调整、输入自动扩展、样式预设／隔行底色／首列强调及计算列已分批验收；隔列底色、末列强调、表头显隐及空表输入位置交叉已验收。向下／向右粘贴扩表、新记录继承计算列、面板追加行、Tab 末格追加及 Shift+Tab 反向跨行均已验收。Table 独立条件筛选／清除／重新应用已验收：完整 E2E 872/872、Vitest 5542/5542，含多作用域共存、结构随动、原生历史和 lite/full 保存恢复；其余样式选项及完整 Table 数据管理交叉能力仍待核对 |
| 33 | 外部数据连接 | 原计划延后；不以本地 fixture 宣称完成 |
| 34–35 | 批注、备注及协作 | Note 纯文本备注与 Comments 本地线程已接入并验收，含新增／修改／删除、回复／解决／重开、独立同格共存、结构位移、原生历史与文件往返；最终完整 E2E 中备注26、批注51、共存2项全过。显示名与本机时间不是认证身份；远程协作、身份、通知及服务端持久服务仍需真实契约，不以本地线程替代 |
| 37–39 | 更改记录、版本、个人视图 | **已暂停**（2026-10-29，非协作产品目标）；不接入、不留占位 |
| 40 | 保护与解锁 | Data → Worksheet protection 的保护／解除、允许编辑范围新增／移除已接 Rust 权威写入守卫及 React UI，并验证 raw lite/full WASM、历史和文件往返；最终完整 E2E 中保护26项全过。允许区可改内容／格式，锁格原子拒绝，工作表设置仍锁定；保护配置不进入内容 Undo。不包含密码认证、加密或服务端权限 |
| 41 | 加载、投影、恢复 | Rust 初始化、可见窗口和过期结果防护已有；原生文件下载／打开、空白工作簿三项已验收：完整 E2E 907/907、Vitest 5610/5610。自动保存、刷新恢复、完整错误恢复及服务端持久化仍待补，不以本地文件替代版本服务 |

### 后续边界只读核对

- 条件格式原先仅保存不透明 JSON。现已由[原生规则解析](../rust/excel-core/src/workbook_conditional_format_rule.rs)和[显示投影](../rust/excel-core/src/workbook_conditional_format_projection.rs)消费数值、公式、排名、色阶和数据条规则，React Worker 已接入；[规则写入与删除](../rust/excel-core/src/workbook_conditional_format.rs)的 revision 溢出检查也已移到实际修改之前，拒绝原子性测试通过。本轮高级阈值与三类图标集已接原生计算、投影、历史及文件并通过最终回归；通配符／地区比较、按显示格式比较重复等未列能力仍保留，不能据此宣布完整条件格式完成。
- [`define_name`](../rust/excel-core/src/workbook_names.rs) 仍保留原有“求值后保存常量／LAMBDA”语义；新命名区域通过 [`define_named_range`](../rust/excel-core/src/workbook_named_ranges.rs) 在同一名称表内保存稳定表身份与范围，不保存值快照。动态求值与结构随动已接入，名称 CRUD 历史、持久化与前端管理仍须本批补齐，不能据此宣布完整名称管理完成。
- Excel Table 低层[注册接口](../rust/excel-core/src/workbook_table_registry.rs)与 [WASM 保存恢复入口](../rust/wasm/src/wasm_workbook_tables.rs)仍保留；React 交互现通过 [`change_table`](../rust/wasm/src/wasm_workbook_table_commands.rs)调用[原生历史](../rust/excel-core/src/workbook_history_table.rs)，不把低层 `deleteTable` 当成转换。表头规范化、公式消费者改写、撤销重做及同一次返回投影已接入；验收进度见下方 Table 批次，不能据此宣布完整 #32 完成。

## 批次账本

### 多区域文字样式、颜色、数字格式（已验收）

本批三项：对全部选区设置文字样式、设置字体／填充颜色、设置数字格式。复用已有工具栏及 command atom，不把 TypeScript 循环写区当成原子操作；多区域边框等其余能力不据此宣称完成。
目标调用链：React 既有入口 → UI Core 一次格式命令 → 一次 Rust 多目标 patch → 一次投影。值、cellStyle／rowStyle／columnStyle、行高与撤销仍由 Rust 管理。

原生阶段已在既有 `workbook_history_format.rs` 扩展 `patch_format_selection`（文件 130 行），未添加新的事务框架。
1–500 个目标全部预检后，在一次 Store batch 中调用现有属性 patch 并生成一次历史；超过 100000 个寻址格、无效后区、部分合并格会在写入前整次拒绝。
行列目标的历史覆盖原有画布外样式交叉点，但不保存／恢复单元格值；相同 patch 重叠或重复应用不制造额外历史。自动颜色仍用显式清除覆盖继承色，不以黑色冒充。
新测试 `format_selection.rs`（132 行）验证三类格式、间隙保留、公式不变、一次撤销／重做、后区拒绝、重叠幂等、远处样式及目标行字号撑高。
默认原生格式／清除／边框历史专项 **19/19**（`63815` 退出 0），日志 `/tmp/excel-multi-format-native.log`。

lite 原生格式／清除／边框历史／工作簿历史／历史边界专项 **30/30**（`6919` 退出 0），日志 `/tmp/excel-multi-format-native-lite.log`。
WASM `patch_format_selection` 只解码多目标与现有 CellStyle patch；wire **2/2**（`49792` 退出 0）。API 快照仅新增这一条导出，架构检查 **10 passed / 1 ignored**（`41288` 退出 0）。
lite/full WASM 已重建（`6545` 退出 0）。普通稀疏格式统一走原生事务，Worker 不再给普通 patch 外套 JS 历史；完整格式旧接口未删除，几何边框仍保留单区域命令。
UI Core 收集全部目标、逐区校验保护，一次发出既有 `format.setRange`；字号尺寸按原生返回的完整受影响范围更新，覆盖后续离屏选区，不只缓存主区域。
React 继续使用已有字体、颜色和数字格式入口，仅改底栏提示。多区域边框仍明确拒绝，不会悄悄只写第一块。

原始种子保留 E93 的文本数字 `30`，新增 H93 的数值 `0.25` 与蓝色字体；选 Summary `A93:H94` → `Go to special` → `Constants`，可对照第一块与 H93 的格式变化、D93 公式间隙不变、一次撤销。
初轮浏览器 **26 passed / 3 failed**（`2340` 退出 1）暴露测试把 E93 当数值及窄屏检查未挂载列的问题；保留原文本数据，改用 H93 真数值作为第二块对照。
后续原生浏览器测试又把 `getCellDisplay` 原始显示当成数字格式结果；对照实际 API 后，分别断言原值不变与 `snapshotCell.formattedDisplay`。General 不提供后者，数字格式才提供，未改变生产逻辑来迎合错误断言。
最终专项 E2E **16/16**（12.9 秒，`9380` 退出 0），日志 `/tmp/excel-multi-format-final-focused-v2.log`：包含 lite/full 三类格式保存恢复、一次历史、字体撑高目标行、非法后区整次拒绝后重试、桌面／390px 面板。
UI Core 专项 **28/28**（`93705` 退出 0）；完整 Vitest **5728/5728**（369 文件，`9019` 退出 0）；React **428/428**（95 文件）、循环依赖和文档检查通过（`24524` 退出 0）。
根构建通过；主线 lint 首轮发现新测试一行超长，已仅折行修正。已查看 `/tmp/excel-multi-format-panel-390.png` 与 `/tmp/excel-multi-format-result-1280.png`，现有样式与底栏无文字溢出；沿用持久 Playwright 视觉／浏览器错误检查，未新增视觉框架。
新增源码及测试均低于 300 行；既有 `runtime.ts` 保持 500 行，只修正尺寸读取范围，不扩大为无关重构。

原生完整 lib 回归已通过（`8444` 退出 0）：默认 **1655 passed / 3 ignored**、lite **1632 passed / 3 ignored**、WASM **189 passed / 1 ignored**。
日志 `/tmp/excel-multi-format-core-lib.log`、`/tmp/excel-multi-format-lite-lib.log`、`/tmp/excel-multi-format-wasm-lib.log`。
主线 lint 通过；追加 E2E lint 的两处长行已仅折行修正，最终 E2E lint／文档／差异检查通过（`61054` 退出 0）。5183 演示服务返回 HTTP 200。

首轮完整 E2E 原会话 `28464` 已退出 1：**974 passed / 1 failed**（14 分钟），日志 `/tmp/excel-multi-format-full-e2e-frozen.log`。整轮源码、测试和 WASM 冻结至终态，未因观察超时重启。
WASM SHA-256：lite `ca49c99da95d44ade27496604ba6fc9905c2b993f3f238af50abd894aa6dad27`；full `a7df0cffba4c14c58c36a21c84841d7232d93419f00771edc3b46b2f14c8c4ac`。
源码／测试清单校验和 `483fcc275b2dd0bf17f80e67906f4a1309e2d42664345fa6725dc15c84a638ef`：在仓库根对以下路径执行 `git ls-files -z --cached --others --exclude-standard -- <paths> | xargs -0 shasum -a 256 | shasum -a 256`，paths 依次为 `excel/react-excel/src`、`excel/react-excel/test`、`excel/react-excel/e2e`、`excel/spreadsheet-ui-core/src`、`excel/spreadsheet-ui-core/test`、`excel/rust/excel-core/src`、`excel/rust/excel-core/tests`、`excel/rust/wasm/src`，不包含允许更新的文档。
唯一失败为 `number-format-session.spec.ts` 的整列文本格式后外部粘贴：Summary D 列穿过 A15:D15 合并框，格式操作被拒绝，弹窗未关闭。三项已接入但尚未全量验收，不能以上一批 959 项通过替代本批回归。
本次按用户要求将本批与上一批重复报错修复一并提交、推送为阶段快照；提交不代表完整 E2E 已验收，完整 41 项目标保持不变。
提交前核对源码／测试校验和与上述冻结值一致；暂存会改变清单中原未跟踪文件的排序，后续比较应按文件路径排序后核对内容，不能把清单顺序变化当成源码修改。
合并格交叉回归已在独立 5183 浏览器会话复现（`22379` 退出 0）：合并 B2:C3 后选第 2 行或 B 列，点击 Bold，实际 `format.setRange` 请求分别携带 row／column scope，Rust 都返回 `Select the entire merged cell before formatting.`。非合并目标 D2／B4 字重仍为 400。问题位于新增预检，不是 Worker 传输或 React 丢事件。
行列选区在 `merged-selection.ts` 明确保留轴语义，不扩展合并框。原完整回归退出后，原生新增轴交叉测试先红（`35464` 退出 101），真实浏览器第 17 行填色用例先红（`44052` 退出 1），日志 `/tmp/excel-axis-merge-native-red.log`、`/tmp/excel-axis-merge-browser-red.log`。
修复仅将完整合并格预检限定为 cell scope，未新增 React／UI Core 状态或传输层。`format_selection.rs` 新增原生行／列锚点与覆盖格测试；`axis-format-merged.spec.ts` 专门验证桌面／390px 行列填色、轴外不变、保留合并及一次撤销／重做。当前正在重建 lite/full WASM 和执行修复后回归，本修复尚未提交。

修复后默认／lite 原生格式、清除、边框历史专项均 **20/20**（`93627` 退出 0），lite/full WASM 重建成功（`73493` 退出 0）。浏览器首轮 **33 passed / 2 failed**（`34959` 退出 1）：两项窄屏新测试直接读取未挂载 C 列，尚未执行格式动作就超时；改用真实名称框逐格定位，保留全部格式、内容、轴外、合并几何及撤销断言，生产代码没有随之改变。
最终专项 **35/35**（31.4 秒，`91381` 退出 0），日志 `/tmp/excel-axis-merge-focused-e2e-v2.log`，包含原先完整回归失败的整列文本格式粘贴。已查看 `/tmp/excel-axis-merge-format-1280.png` 与 `/tmp/excel-axis-merge-format-390.png`；沿用持久 Playwright 截图、页面宽度和浏览器异常检查，未改界面布局。
根构建（`51067` 退出 0）、文档／展现层边界／循环依赖（`16455` 退出 0）、新增 E2E lint 与差异检查（`47462` 退出 0）通过。源码只在原生预检加 scope 条件及解释注释；UI Core／React 生产代码与此前完整 Vitest **5728/5728** 的版本一致。三个相关文件分别 131／169／63 行，未增新抽象。
修复后的原生完整 lib 链 `83546` 已退出 0：默认 **1655 passed / 3 ignored**、lite **1632 passed / 3 ignored**、WASM **189 passed / 1 ignored**。日志 `/tmp/excel-axis-merge-core-lib.log`、`/tmp/excel-axis-merge-lite-lib.log`、`/tmp/excel-axis-merge-wasm-lib.log`。

**最终验收：原会话 `29244` 已退出 0，完整 E2E 983/983（14.3 分钟）通过；结束时源码／测试及两种 WASM 校验和与下列冻结值一致。本批三项完成，不代表全部 41 项计划完成。** 当时日志为 `/tmp/excel-multi-format-final-full-e2e.log`；临时日志不作为长期存档。
WASM SHA-256：lite `8ac3f7f423bc1aeb1f6cfa26e2c92572e4f4877a51f7a10a1ff8f18d9ae60fa1`；full `92d16997de476a24239e0ef3495741bb4f80d70045f796de3c9fb1b48dc66d33`。
源码／测试按路径排序后校验和 `09d39c3758ee6e8767e1cde0e12bde26d4c6ebac598fbe095000a653ebcb6f97`：与上文相同的八个路径，命令增加 `LC_ALL=C sort -z`，即 `git ls-files -z --cached --others --exclude-standard -- <paths> | LC_ALL=C sort -z | xargs -0 shasum -a 256 | shasum -a 256`。文档不在冻结清单中。
本次合并格轴格式修复及补测尚未提交；`5e38d559` 为已推送的修复前阶段快照，不能用其 CI 代替当前修复的验收。
修复前提交 `5e38d559` 的 [CI](https://github.com/allroad88888888/einfach-excel/actions/runs/38192255084) 已完成且 Node 22、Node 24、Rust 全部成功；当前修复以上述本地同版本证据及最终完整 E2E 为准。

### 多区域清除内容、清除格式、全部清除（已验收）

最终验收：修复后的完整 E2E **959/959**（13.6 分钟，原会话 `39947` 正常退出 0），日志 `/tmp/excel-multi-clear-final-full-e2e.log`，没有失败、跳过或重试。
整轮源码、测试与 WASM 冻结，结束后 SHA-256 与启动时完全一致。结合下述原生、Vitest、构建和静态检查，本批三项完成；完整 41 项计划仍有未完成项。
主体代码已随 `5632dce6` 推送；重复报错修复及本次验收文档随上述多区域格式阶段快照提交。下方失败／运行中记录保留为过程证据，以本段终态为准。

本批只扩展既有三种清除到全部选区，每次命令保留一次撤销／重做；普通格式写入的多区支持仍待后续，不把三个清除模式等同于全部多区操作完成。
调用链保持 React 既有清除入口 → UI Core 清除 command atom → 一次 Rust 请求 → 原生多范围历史事务 → 一次返回投影。
先实现原生预检、清除、回滚和回归；值／样式／历史仍归 Rust，UI Core 只提供目标几何与模式，不在 TypeScript 循环改格子。

原生阶段：`workbook_history_clear.rs`（95 行）接入 `WorkbookHistory::clear_selection`，接受 1–500 个带样式 scope 的目标，先检查全部坐标／完整合并格／数组锚点，再一次 Store batch 清除及完成历史。
内容清除保留稀疏扫描，完整 17179869184 格理论范围不分配空格；格式／全部清除暂沿用可控写入预算，超过 100000 个寻址格整次拒绝，不能先写前几个区域。
行列样式历史覆盖轴上已有的远处交叉点，内容历史只包含实际选中范围；行高／列宽不属于清除内容或格式。三种模式保留选区间空隙及原生公式源码。
`clear_selection.rs`（156 行）七项回归覆盖三种模式、多区一次撤销／重做、无效后区原子拒绝、重叠边框、回滚、整表稀疏清除、数组子格与另一选区锚点、行列远处样式及尺寸。
先用既有历史 API 复现相邻清除撤销残留：`34006` 退出 101，日志 `/tmp/excel-multi-clear-history-red.log`。`history.finish` 现将按时间追加的 before-image 逆序回放，避免晚快照的中间态盖过最初状态；没有复制第二套历史引擎。
默认及 lite 的清除／边框格式历史／工作簿历史专项均 **24/24**（`16234`、`30490` 均退出 0），日志 `/tmp/excel-multi-clear-native.log`、`/tmp/excel-multi-clear-native-lite.log`。
WASM `clear_selection` 仅解码并调用上述原生方法；wire 专项 **2/2**（`79443` 退出 0），首次编译缺少 WorkbookHistory import 已修正。API 快照生成及架构检查 **10 passed / 1 ignored**（`62074` 退出 0）。快照仅新增本次 clear_selection 及先前漏记的 function_catalog／locate_cells／recalculate 四项，没有删改原签名。
完整原生库回归原会话 `38303` 已退出 0：默认 core lib **1655 passed / 3 ignored**、lite core lib **1632 passed / 3 ignored**、WASM lib **187 passed / 1 ignored**。
日志 `/tmp/excel-multi-clear-core-lib.log`、`/tmp/excel-multi-clear-lite-lib.log`、`/tmp/excel-multi-clear-wasm-lib.log`；lite/full WASM 已重建（`33033` 退出 0）。

既有 `range.clear` 现携带全部目标，Worker 只转发一次 `clear_selection`，不再由 TypeScript 分别改内容／格式或包第二层历史。
UI Core 校验全部区域并提供等待／失败反馈；React 的 `ClearTools` 只负责三个按钮，底栏显示错误与多区说明。普通多区域格式仍明确拒绝。
Summary `A93` 斜体、`C93` 粗体、`E93` 下划线，未选中的 `D93` 公式保留黄色背景，可对照三种清除与一次撤销。
新增文件均低于 300 行；未添加数据镜像、第二套历史或新的传输层。

最终完整 Vitest **5710/5710**（367 文件），日志 `/tmp/excel-multi-clear-final-unit.log`；React **422/422**（94 文件）及根构建通过，日志 `/tmp/excel-multi-clear-react-all-v3.log`、`/tmp/excel-multi-clear-build-v3.log`，保留既有大包提示。
页面清除／定位专项 **24/24**（`72468` 退出 0）；最新多区页面及 lite/full 原生浏览器专项 **14/14**，日志 `/tmp/excel-multi-clear-final-focused.log`，覆盖持久化恢复、一次历史、容量拒绝、稀疏整表清除、数组拒绝和桌面／390px 重试。
构建中发现的测试类型错误已修正；最新专项 E2E lint 的变量遮蔽与长行也已修正并通过复验。
提交前循环依赖检查通过（749 modules／2154 dependencies），文档与展现层边界通过；提交门禁 **2334/2334**、主线类型及 lint 通过。
本批及上一批长区域活动格修复已在 `5632dce6` 提交并推送 `origin/main`。

完整 959 项 E2E 原会话 `22583` 已退出 1：**953 passed / 6 failed**（13.6 分钟），日志 `/tmp/excel-multi-clear-full-e2e-frozen.log`，不能将本批标为已验收。
测试基线为 `5632dce6`，整轮只更新文档，源码、测试及 WASM 保持冻结；结束后核对 WASM 哈希未变，没有中途重启。
WASM SHA-256：lite `9cc734eb24b66b8dcaed8fbc4dc37ca087ca48383c0325346dfb55f1671fcb4a`；full `73e1b2616c1172965001995a7dde986bf257db750b5d88b083f3ac6e54fc3497`。
六项失败来自颜色、字号、数字格式、文字布局的拒绝重试用例：格式面板已有错误提示，新增底栏又重复展示同一次错误，导致双重 alert。
待原会话终态后补 UI Core 回归，先得到 **1 failed / 16 passed**（`95277` 退出 1），日志 `/tmp/excel-clear-feedback-red.log`。
修复仅让底栏接收清除错误，格式错误继续由原有面板处理；没有改测试定位器来绕开双重提示，没有新增状态层或改动 Rust。
修复后格式／清除专项 E2E **42/42**（49.3 秒，`94668` 退出 0），完整 Vitest **5711/5711**、React **422/422**（`54474` 退出 0），构建／lint／循环依赖／文档通过（`40950` 退出 0）。
日志分别为 `/tmp/excel-clear-feedback-focused-e2e.log`、`/tmp/excel-clear-feedback-unit.log`、`/tmp/excel-clear-feedback-react.log`、`/tmp/excel-clear-feedback-build.log`、`/tmp/excel-clear-feedback-lint.log`、`/tmp/excel-clear-feedback-cycles.log`、`/tmp/excel-clear-feedback-docs.log`。
已查看专项生成的 390px 数字格式错误截图及 1280px 清除错误截图：前者只在面板显示，后者保留底栏提示，无文字截断；缺少共享 visual-runtime，沿用持久 Playwright 的尺寸／溢出／浏览器错误检查。
源码文件 157 行、回归文件 199 行；复用既有 UI Core 命令，只区分错误显示归属，没有新增文件或状态层。
修复后完整 959 项 E2E 原会话 `39947` 已退出 0，日志 `/tmp/excel-multi-clear-final-full-e2e.log`；不要再轮询或重启已完成的进程。
本轮为 `5632dce6` 加未提交修复；命令文件 SHA-256 `ed49a16f0d08eeb373d2c8b568a2ddc331d432850fdef267a7fb9b13cd62d4af`，回归文件 SHA-256 `78bd260f012b63b574eaec01692b0cc073c6e7b91f03143d172ed63c1a96f0f7`；WASM 哈希同上。
本批以修复后的完整 959 项通过验收，不以上一轮 953 项通过替代；本次修复未提交或推送。
本批已完成，可选择下一批三个相关功能；完整 41 项目标继续保持，不能以本批完成代替整个计划。

### 定位常量、定位公式、定位空白格（已验收）

最终验收：完整 E2E **946/946**（13.4 分钟，原会话 `87423` 正常退出 0），日志 `/tmp/excel-locate-active-full-e2e.log`，无失败／跳过／重试。整轮源码、测试、WASM 冻结。结合下列单测、原生、构建、静态检查，本批三项完成；活动格修复未提交，不代表 #06 或完整 41 项全部完成。下方运行中记录是阶段历史，不再轮询已结束的会话。

检查点 `420d85e3` 已提交并推送 `origin/main`，提交门禁 **3116/3116** 通过。下方待修及运行中记录为当时状态，以最新收尾记录为准。

长区域活动格收尾：新增 UI Core 断言先出现 **3 failed / 15 passed**（`24908` 退出 1），确认三种条件均把活动格放到末格。
浏览器新回归首轮 **2 failed**（`48819` 退出 1）：桌面复现公式栏 disabled；窄屏先遇到状态栏本来隐藏的断言错误，改为检查计数节点内容而非强制显示。
现只反转原生定位结果的 anchor／focus，选区几何不变，活动格与滚动目标统一到首个匹配格，不加新状态、RPC 或数据镜像。
UI Core／Worker／计数专项 **22/22**（`17780` 退出 0）；真实浏览器专项 **15/15**（16.1 秒，`5989` 退出 0），日志 `/tmp/excel-locate-active-focused.log`。
新增桌面及 390px 用例从 G1001 定位全部公式，验证 G2 可见、末格未挂载、完整 1000 格计数、公式栏编辑 G2／一次撤销以及 G1001 未被改写。
最终完整 Vitest **5699/5699**（366 文件，`34292` 退出 0），React **418/418**（93 文件）及根构建（`29373` 退出 0）通过，保留既有主包超过 500 kB 提示。
主线 lint 通过；追加 E2E lint 发现既有 catch 换行问题，`40160` 退出 1 后只修换行。最终 E2E lint／循环依赖／文档链 **`31681` 退出 0**，748 modules／2153 dependencies 无循环，差异检查通过。
修改涉及的源文件／单测／E2E 分别 117／128／187 行，未新增层或文件。5183 演示服务返回 HTTP 200。
**最新续跑点：完整 946 项 E2E 原会话 `87423` 已启动，日志 `/tmp/excel-locate-active-full-e2e.log`。源码、测试、WASM 冻结至该会话终态；只轮询同一进程，不因观察超时重启。**
本次修复未提交；新的完整 E2E 尚无终态，不以此前 944 项替代修改后的全量验收。此前 `65499` 已完成，不再轮询。

本批三项通过 `Go to special`（`⌖`）选择。单格时查整张演示画布，连续多格／行／列时只查选区；
弹窗明确显示范围，包括隐藏行列。合并格按完整矩形选择，Rust 返回实际扩展后的查询边界。
已有非连续多区域作为输入时明确要求先选连续范围，不只取主区域悄悄查询；本批不宣称 #06 全部完成。

调用链：React → `runGoToSpecialAtom` → 一次 `workbook.locate` → Rust `locate_cells` → 一次 `setMultiRegionSelectionAtom` → 多区域渲染。
分类只读原生稀疏索引，不在 TypeScript 扫描视口或镜像工作簿；空白按矩形补集计算，完整 17179869184 格空表只返回一个矩形。
公式身份不依赖显示文字；空字符串公式／错误公式不是空白，已安装的数组子格继承原生锚点身份，空合并格仍是空白。
合并格不与邻格拼成新的包围矩形，避免界面展开合并区域时误选不匹配格。超过 500 个独立区域时整个请求报错，不截断。
没有匹配、错误、关闭重开、连接更换、选区改变及过期版本都保留原选区；只读定位不修改内容、隐藏设置或原生历史。

演示复用 Summary `A93:F94`：常量 `A93:C93`／`E93:F93`／`A94`，公式 `D93`／`B94:C94`，空白 `D94:F94`。
`A94` 是空字符串常量、`B94` 是返回空字符串的公式；不新增重复种子。网格改为直接读多区域几何 atom，普通区、冻结区和合并格同步显示。
外框从 `SpreadsheetGrid.tsx` 抽到 `SelectionOutlines.tsx`（46 行），主网格从 228 行降至 154 行；没有再传递 controller 对象。

当前验证：Rust 默认／lite 定位专项各 **10/10**（原会话 `69554` 退出 0），包括 48 组小网格稠密对照、空白整表、离屏惰性公式、数组缩放／阻挡恢复、合并边界与容量拒绝。
WASM wire **2/2**（`26995` 退出 0），双构件构建 **`98240` 退出 0**；浏览器测试实际调用 lite/full 的新导出。
UI Core 专项 **17/17**（`90039`），React／外框专项 **9/9**（`42156`），均退出 0。
完整 Vitest **5693/5693**（364 文件，`81042` 退出 0）；完整 React **417/417**（92 文件）。
最终根构建＋React 链 `94368` 退出 0，仍保留主包超过 500 kB 的既有提示；首次构建发现新测试误用 Playwright 的 `exact` 参数，已修正后完整重跑。
持久专项 E2E **11/11**（12.9 秒，`24692` 退出 0），日志 `/tmp/excel-locate-e2e-focused-v2.log`。
首轮 **9 passed / 2 failed**（`31701` 退出 1）是错误等待冻结行定位重置正文滚动、错误要求窄屏离屏选区端点可编辑；已改为显式滚动及等待定位入口，不改产品绕开断言。
已查看 `/tmp/excel-locate-1280.png`、`/tmp/excel-locate-390.png`，复用现有定位弹窗样式；共享 visual-runtime 不可用，使用持久 Playwright 的尺寸／焦点／错误检查。

首轮完整 **942/942** 已通过，13.4 分钟，原会话 `47195` 正常退出 0；日志 `/tmp/excel-locate-full-e2e-frozen.log`。整轮源码、测试、WASM 冻结，无失败／跳过／重试。
冻结期间只读复查发现两处遗漏：底部 `Selected` 只计主区域，格式／清除也只取主区域。等首轮终态后才补测和修正，没有热改正在执行的全量队列。
新增回归先 **1 passed / 3 failed**（`64044`），证明常量 6 格显示 3、公式 3 格显示 1；独立写入回归 `41378` 失败，证实粗体静默修改主区。
现在 `selection/cell-count.ts`（35 行）只派生 UI 选区并集数量，不读取值、不保存副本；含重叠去重、整表大计数、跨表身份及 100 组矩形对照测试。
格式／清除命令暂时拒绝多区域，底栏沿用已有样式明确提示先选连续范围；原选区、内容、样式、历史不变，恢复单区后命令正常。
这是防止部分写入的阶段性保护，**不是多区域格式、清空、批量历史已完成**；完整多区写入仍保留在计划中，不以限制代替最终目标。
补测 UI Core **21/21**、底栏 React **1/1**（`8829` 退出 0）；最终专项 E2E **13/13**（16.7 秒，`68545` 退出 0），日志 `/tmp/excel-locate-final-focused-v3.log`。
已查看 `/tmp/excel-locate-selected-1280.png`、`/tmp/excel-locate-selected-390.png`，完整选区与底栏提示可见且不溢出。
最终完整 Vitest **5699/5699**（366 文件，`14835` 退出 0）；React **418/418**（93 文件）及根构建（`58114` 退出 0）通过，仍有既有大包提示。

**续跑点：补丁后完整 944 项 E2E 原会话 `65499` 已启动，日志 `/tmp/excel-locate-final-full-e2e-v2.log`；尚无终态，不可标为最终验收通过。**
新一轮期间产品源码、测试和 WASM 冻结；只轮询同一会话，不因观察超时重启。
冻结期间独立只读浏览器实测发现长区域活动格问题：Sales Orders 从单格定位全部公式，结果 `G2:G1001`，
G2 已挂载、G1001 未挂载，公式栏值为空且 disabled。`native-special.ts` 将 focus 设为区域右下角，却滚动到左上角；
须等 `65499` 终态后补回归并统一为首个匹配格（保留完整区域几何），不能以当前用例已通过忽略此缺口。
最终 lint 复验链 `59875` 已退出 1，日志 `/tmp/excel-locate-final-lint-v2.log`：底栏第 24 行超长，计数测试第 35 行循环内函数声明及第 38 行超长。
循环依赖子命令因 `&&` 未执行。由于 944 项 E2E 已启动并冻结，三处写法修正须等 `65499` 终态后处理：
拆开底栏 JSX 开始标签、将测试随机数辅助函数移到循环外、折行矩形构造。完成后重新验证 lint／类型／计数测试；不能把当前 lint 标成通过。
随后独立循环依赖／文档链 `78387` 已退出 0：748 modules／2153 dependencies 无循环，416 份活文档／3783 份文件路径有效，差异检查通过。
原生 lib 默认 **1655 passed / 3 ignored**、lite **1632 passed / 3 ignored**、WASM lib **185 passed / 1 ignored**；原会话 `90691` 已退出 0，日志 `/tmp/excel-locate-native-lite-lib.log`、`/tmp/excel-locate-wasm-lib.log`。
补丁前 lint／循环依赖链原会话 `4561` 已退出 0，747 modules／2151 dependencies 无循环；日志 `/tmp/excel-locate-lint-final.log`、`/tmp/excel-locate-cycles-final.log`。差异检查通过，5183 演示服务返回 HTTP 200。
新增生产文件均低于 300 行；既有命令分派 500 行，`selection/index.ts` 存量超限（1286 行，本次增加 6 行纯派生几何），未扩大成无关重构。
提交检查点更新：原会话 `65499` 已正常退出 0，完整 E2E **944/944**（13.4 分钟），整轮源码、测试与 WASM 保持冻结。
结束后仅修正上述三处 lint 写法：底栏文本折行保留空格，测试随机数函数移到循环外，矩形构造折行；不改产品逻辑。
按用户要求提交并推送当前进度；此次是检查点，不是验收完成。以上长区域活动格问题仍待修复，完整 41 项目标保持不变；完成本轮验收后再选下一批。

### 单格数组引用、溢出范围、阻挡格定位（已验收）

提交更新：本批已在 `8dd62642` 提交并推送 `origin/main`，提交门禁 **2288/2288** 通过；下方“尚未提交”为当时阶段记录。

最终验收：完整 E2E **931/931**，13.6 分钟，原会话 `91491` 正常退出 0，无失败、跳过或重试。
日志 `/tmp/excel-spill-full-e2e-frozen.log`；整轮产品源码、测试和 WASM 保持冻结，没有重启队列或用专项替代全量。
结合下述原生、Vitest、构建和静态门禁，本批三项已验收，尚未提交；不代表 #24–26 或完整 41 项计划全部完成。

本批仍为三项：显式 `#` 引用缩到 1×1 后保留数组身份；从数组任一格查看并选择原生溢出范围；
从 `#SPILL!` 锚点定位第一个原生阻挡格。工具栏 `Spill details`（`#`）提供范围、尺寸与公式格，
复用已有选区和滚动；关闭／定位不修改内容或历史，不自动清除阻挡，不取消隐藏行列。
没有可定位阻挡格时提示检查工作表边界／数组大小；超出演示画布的范围明确拒绝定位，不截断范围。

调用链：React → `runSpillAtom` → 一次 `formula.inspectSpill` → 已有 Rust `spillAnchor`／`spillInfo`／`spillBlocker` → UI Core 只读结果 → React。
WASM 稀疏读取只求值活动格；没有按整个可见窗口逐格请求、复制数组索引或新增订阅生命周期。
查询期间禁用重复操作；关闭重开、连接更换、选区变化及投影版本变化不会拿旧结果抢回选区。
普通单格引用、1×1 普通区域和 `INDEX` 取单值仍保留标量；本次修复专门保留显式 `#` 的数组语义，不宣称所有数组公式完全兼容 Office。

Summary 演示：`H57:H59` 是 `SEQUENCE(3)`，`F57:F59` 是 `H57#*10`；把 H57 改为 `SEQUENCE(1)` 后，
H63 的 `SUM(F57#)` 应从 60 变成 10。`H62` 是独立单格数组；`F62` 被 `F63` 的文字挡住，定位后清除 F63 可恢复，撤销可还原。
首轮浏览器 **3 passed / 5 failed**（`83840` 退出 1）暴露新样例与已有数据校验种子重叠；迁到空闲坐标，并添加所有导入 chunk 地址唯一性测试。
冻结／隐藏列交叉首轮 **8 passed / 1 failed**（`86997` 退出 1）是测试忽略隐藏 G1 原有内容；现先定位并明确清除真实阻挡，再验证二维数组恢复，不改引擎绕开阻挡。

当前证据：新原生专项先 **0/3** 复现，修复后新专项与引用／重算回归默认／lite 各 **21/21**；
手动重算原有绕行样例已换回 `Source!A1#*10`，最后双配置重算／形状专项各 **9/9**。
Rust 默认 lib **1655 passed / 3 ignored**、lite lib **1632 passed / 3 ignored**（原会话 `22258` 退出 0）；
WASM lib **183 passed / 1 ignored**（`20650` 退出 0），双 WASM 构建 `32459` 退出 0。
UI Core 专项 **17/17**，React 专项 **5/5**；React 全量 **412/412**（91 文件）。根构建通过，仍保留主包超过 500 kB 的既有提示（构建＋React 原会话 `48328` 退出 0）。
最终持久专项 E2E **9/9**，9.3 秒，`12580` 退出 0，日志 `/tmp/excel-spill-e2e-cross-final.log`，包含 lite/full 构件、真实原生历史、冻结区、隐藏阻挡与桌面／390px 键盘操作。
共享 visual-runtime 脚本不可用，使用持久 Playwright；已查看 `/tmp/excel-spill-1280.png`、`/tmp/excel-spill-390.png`，调整按钮间距并保留现有界面风格。

完整 **931 项 E2E** 已沿原会话 `91491` 运行至成功终态，日志 `/tmp/excel-spill-full-e2e-frozen.log`；产品源码、测试和 WASM 全程冻结。
完整 Vitest **5671/5671**（361 文件，75.04 秒），原会话 `96511` 退出 0，日志 `/tmp/excel-spill-unit.log`；
完整 lint／循环依赖／文档原会话 `79867` 退出 0，744 modules／2136 dependencies 无循环；主线类型及专项 lint 通过。
本次文档更新后重新验证 416 份活文档／3770 份文件无失效路径，差异检查通过。演示服务 `http://127.0.0.1:5183/` 返回 HTTP 200。
整批已验收、尚未提交；完整 41 项目标继续保持，后续仍按三项小批推进。

新增生产职责：`spill-commands.ts` 读取原生溢出信息（58 行），`spill/command.ts` 处理查询／定位用例（91 行），`SpillTools.tsx` 渲染入口（66 行）。
修改的 Rust 求值文件均低于 300 行；既有分派文件 495 行，接口聚合 `commands.ts` 存量超限（336 行，本次增加 1 行），未借小功能扩成无关重构。

### 当前表重算、整个工作簿重算、显示公式（已验收）

提交更新：本批已在 `eb999090` 提交并推送 `origin/main`，提交门禁 **2073/2073** 通过；下方“尚未提交”保留为当时阶段记录。

最终验收：完整 E2E **922/922**，13.2 分钟，原会话 `75613` 正常退出 0，日志 `/tmp/excel-manual-calculation-full-e2e-final.log`。
无失败、跳过或重试；产品源码、测试与 WASM 在整轮复验中冻结。结合下述原生、单测、构建与静态门禁，本批三项已验收；尚未提交，不代表 #28 或完整 41 项目标已经完成。

本批仅三项：`Recalculate` 菜单重算当前表／整个工作簿，`Show formulas` 显示当前表原始公式。
链路为 React 事件 → UI Core command atom → 原生 `Workbook::recalculate` → 同次返回可见投影。
Rust 只枚举已有公式，包括离屏及懒导入公式；复用 Store 失效传播与动态数组几何维护，不扫描空白网格、重写公式或新增撤销记录。
当前表重算允许跨表下游更新，但不会强制失效无关表的公式。异步自定义函数保持既有在途／已结算缓存，不假装本批完成异步宿主功能。

显示公式仅保存按连接、工作表隔离的会话偏好；普通、冻结、合并区域共用取文规则，不改原始投影、数字格式、数据或剪贴板。
编辑草稿期间三个入口禁用。Summary 的 D62 是 `=RAND()`，E62 是 `=D62*2`，可直接点击重算检查结果及下游。

阶段证据：原生重算专项默认／lite 各 **6/6**，覆盖跨表依赖、离屏公式、空表、错误、原生撤销、动态数组扩缩、碰撞恢复及异步去重；
UI Core 专项 **11/11**，React 专项 **4/4**；完整 Vitest **5648/5648**（358 文件）、React 独立 **406/406**（90 文件）。
双 WASM 构建完成（会话 `93082` 退出 0），真实浏览器专项 **8/8**，包括两种 WASM 构件、冻结／合并区、历史、按表视图记忆与 1280px／390px 键盘操作。
共享 visual-runtime 未安装，改用仓库持久 Playwright；已检查 `/tmp/excel-calculation-1280.png`、`/tmp/excel-calculation-390.png`，焦点及视口边界正常。

首轮完整 E2E 会话 `73774` 正常结束（退出 1）：**920 passed / 2 failed**，13.4 分钟，日志 `/tmp/excel-manual-calculation-full-e2e-frozen.log`。全程产品源码／WASM 冻结，未在观察超时时重复启动。
原生默认 lib **1655 passed / 3 ignored**、lite lib **1632 passed / 3 ignored**、WASM lib **183 passed / 1 ignored**；原会话 `7050` 已退出 0。
根构建与 React 单测会话 `66531`、完整 lint 会话 `52516` 均退出 0；构建保留现有主包超过 500 kB 提示。边界检查与循环依赖检查（741 modules / 2121 dependencies）通过。
E2E lint 的测试超长行已修正，两份涉及的测试文件 lint 与差异检查通过（会话 `80967` 退出 0）；没有更改产品逻辑。本批尚未提交。

两处失败已根据 trace 修正：范围隔离测试在 B2 按 Enter 后立即取到旧值 `Acme Co.`，现等待原生提交显示且 Undo 可用后再保存 RAND 数值；
整列统计的旧断言未包括新种子，现验证 D 列 11 个数值、20 个非空内容、总和 `61 + D62` 与对应平均数，仍严格比较滚动前后统计不变。
原 trace 保存在 `/tmp/excel-calculation-first-run.ctWBeg`；没有加固定睡眠、跳过测试或放宽范围隔离／撤销断言。
相关两组持久浏览器测试连续 3 轮 **45/45** 通过（会话 `93785` 退出 0，35.2 秒，`/tmp/excel-manual-calculation-cross-repeat.log`）。
修正后的完整复验已沿原会话 `75613` 运行到成功终态，没有用上述专项或单个修复用例替代完整回归。

文件职责：`workbook_calculation.rs` 负责原生重算，WASM 文件提供调用入口，UI Core `calculation/command.ts` 负责请求及结果发布，`formula-view.ts` 负责临时显示偏好，React `CalculationTools.tsx` 负责入口渲染。
新增生产文件均低于 300 行；存量 Worker 分派文件本次仅增加 10 行，现为 490 行，未顺带扩大为无关重构。计算事实留在 Rust，视图开关留在 UI Core；没有第二份公式结果缓存。

另外发现既有公式语义差异：1×1 区域算术结果会收敛为标量，再对该结果使用 `#` 会报引用错误；这不是手动重算新增的行为。
重算专项使用真正保留数组的 `SEQUENCE(ROWS(Source!A1#),1,10,10)`，覆盖 4→1→3→4 的动态几何。原有区域／数组形状兼容性继续随 #24–26 跟踪，不能据本批宣称完全兼容 Office。

### 原生函数目录、插入草稿、扩展补全（已验收）

提交更新：本批已在 `5783fe4d` 提交并推送 `origin/main`，提交门禁 **2228/2228** 通过；下方“尚未提交”是当时阶段记录。

最终验收：完整 E2E **914/914**（13.0 分钟，原会话 `80047` 正常退出 0，`/tmp/excel-function-catalog-full-e2e-frozen.log`），无失败、跳过或重试；本批 7 项包含于完整队列，产品源码与 WASM 全程冻结，沿原进程运行到终态。Vitest **5633/5633**（354 文件）、React 独立 **402/402**（89 文件），会话 `41603` 正常退出 0。根构建、完整 lint、展现层边界及循环依赖检查（738 modules / 2109 dependencies）通过，会话 `49957` 正常退出 0；构建仍提示现有主包体积超过 500 kB，未当作错误隐藏。E2E lint、文档及差异检查通过（`24306` 退出 0）。结合下述原生门禁，本批三项已验收，尚未提交。

本批仅三项：按名称／分类浏览当前 Rust 构建的全部函数；选中函数后创建活动格的公式栏草稿；格内与公式栏自动补全共用同一原生目录。目录与求值由 Rust 同一张分发表生成，lite 499／full 502 项（含别名），保留名策略不变。502 个名称到求值器的映射逐项比对与上次提交完全一致。启动或成功打开／新建工作簿时读取一次元数据，不随滚动或每次按键请求 Worker。

现有 21 项参数帮助保留，其余函数不伪造参数签名。IMAGE、HYPERLINK、TRANSLATE 显示原生语义限制；完整参数表单、所有函数帮助、自定义公式入口并未完成，因此不能据此标记 #24–26 或完整 41 项计划完成。没有新数据种子：本批是只读目录与编辑入口，所有提交复用既有原生单格写入和撤销链。

阶段证据：目录源码／编译一致性门禁默认和 lite 各 **7/7**；原生 core lib 默认 **1654 passed / 3 ignored**、lite **1631 passed / 3 ignored**；WASM lib **183 passed / 1 ignored**（会话 `58419` 正常退出 0）。双 WASM 构建完成（`52262` 退出 0）。真实浏览器目录、插入、补全、窄屏及 lite/full 构件 **7/7**（`/tmp/excel-function-picker-e2e-acceptance.log`，10.3 秒），此前连同快捷公式及文件替换交叉 **23/23**（`21527` 退出 0）。

首轮真实 WASM 暴露 Option 空值为 undefined，已修正元数据边界并加入 fixture；浏览器搜索框 Escape 被默认清空行为吞掉，已修正为一次取消并加 React 回归。全量单测首轮两处旧假 Worker／补全 fixture 未提供目录，已改为显式目录，不在产品增加旧 21 项 fallback。

前端 skill 检查 1280px／390px 截图后，将 SUM 完全匹配排在 DSUM 前，搜索排序由 `search.ts` 与补全共用。共享 visual-runtime 未安装，使用持久 Playwright 截图、焦点／溢出／页面错误断言；截图在 `/tmp/excel-function-picker-1280.png` 和 `-390.png`。新增生产文件均低于 300 行；存量 Worker 分派 480 行，本次仅增只读目录分支，不扩大为无关重构。完整 41 项目标仍未完成；收尾仅更新文档，尚未提交。

### 原生文件下载、打开、空白工作簿（已验收）

提交更新：本批已按用户要求在 `0b01f178` 提交并推送 `origin/main`，提交门禁 **2239/2239** 通过；下方“未提交”是当时的阶段记录。

最终验收：完整 E2E **907/907**（12.9 分钟，原会话 `75678` 正常退出 0，`/tmp/excel-workbook-files-full-e2e-frozen.log`），无失败、跳过或重试；本批 7 项真实浏览器／lite-full 文件回读均包含在完整队列中。全程未修改产品源码或 WASM。结合下述全量单测、构建及静态检查，本批三项已验收；不代表 #41 或完整 41 项目标完成。收尾仅更新文档，尚未提交。

本批仅三项：File → Download workbook 下载 `.einfach.json`；Open workbook 确认后打开；New blank workbook 确认后创建 1,048,576 行 × 16,384 列空白表。不是 XLSX，也没有自动保存或云端上传。标题栏原先固定的 “Saved locally” 已改为真实的 “In memory”。取消替换或坏文件保留当前工作簿与原生 Undo 历史；成功替换从第一张表 A1 开始，新 Undo 历史为空。

调用链：浏览器文件手势 → UI Core command atom → Worker 中的原生 snapshot／restore → 元数据与可见投影 → React。文件封装只补标题和有限画布大小，数据、公式、格式、Table、验证等仍是 Rust 原生快照，不创建 TS 工作簿镜像。文件上限 64 MiB；先用候选 Worker 校验，成功才换连接并释放旧 Worker。旧投影回包检查连接身份，旧尺寸／查询结果不能串入新工作簿；编辑中的草稿禁止被文件动作替换。

阶段验证：全量 Vitest **5610/5610**（350 文件），React 独立 **398/398**（88 文件），新增 UI Core／React 专项 **33/33**。页面与真实 lite/full 文件封装回读专项 **7/7**，包含空白表 `XFD1048576` 编辑及恢复后冻结／隐藏／行高列宽断言（`/tmp/excel-workbook-files-e2e-acceptance.log`，23.1 秒）。首轮原生文件 fixture 使用了错误的验证字段，已修正为现有 Rust 契约；一条旧失焦测试改用现有 Insert 页签作为外部焦点，提交断言不变。根构建、lint、E2E lint、React 类型、展现层边界、文档及差异检查通过，循环依赖通过（733 modules / 2091 dependencies）。上述检查会话 `22333`、`51263`、`83648` 均正常退出 0。

完整队列沿原会话执行到终态，没有因观察超时重启；启动时 Playwright PID `89474`。演示 `http://127.0.0.1:5183/` 可访问。

前端 skill 沿用现有工作簿 token；1280px／390px 截图已检查，文件面板无横向溢出且 Escape 恢复焦点。共享 visual-runtime 未安装，使用持久 Playwright 截图、焦点／溢出／页面错误断言。按单一职责规则，新文件均低于 300 行；存量 Worker 分派 `runtime.ts` 475 行、协议 `commands.ts` 335 行本次仅增文件命令，不扩大为无关拆分。当前未提交，完整 41 项目标仍未完成。

### 条件格式：文本、重复／唯一值、停止后续规则（已验收）

提交更新：本批已按用户要求在 `74c46871` 提交并推送 `origin/main`，提交门禁 **2515/2515** 通过；下方“未提交”是当时的阶段记录。

最终验收：完整 E2E **900/900**（13.0 分钟，原会话 `95123` 退出 0，`/tmp/excel-cf-text-full-e2e-frozen.log`），无失败、跳过或重试，含本批 10 项页面测试及 2 项真实 lite/full 保存恢复。全量 Vitest **5577/5577**、React 独立 **392/392**；原生默认／lite 的九组条件格式专项各 **50 项**通过（lite 的最后新增 Stop 场景已在 `30430` 复跑，3/3，不重复累计旧 2 项），核心 lib 默认 **1654 passed / 3 ignored**、lite **1631 passed / 3 ignored**，WASM lib **183 passed / 1 ignored**。Rust 专项 `42153`、lib `35756` 均正常退出 0。

完整 E2E 期间产品源码和 WASM 冻结；结束后只调整 JSX 文案与持久化测试的两处换行。JSX 的 SWC 编译 SHA-256 前后相同（`91caf18e9b96f1bc799a4d5f3c680ad5625d9d4c3a6c767ac7c4d76c8276e09b`），真实页面／构件专项再跑 **12/12**（`39549` 退出 0，`/tmp/excel-cf-text-post-wrap-e2e.log`）。完整 lint、E2E lint、UI Core 构建、React 类型／构建、边界、文档和差异检查均通过，收尾会话 `74164`、`41612` 正常退出 0。根构建和循环依赖此前也已通过。演示 `http://127.0.0.1:5183/` 可访问。

批次 skill 保持本批只有三项；单一职责规则使文本判定、重复键契约分别位于独立 Rust 模块，新／大改文件均低于 300 行。前端沿用现有紧凑面板，窄屏长表单允许滚动，提交／取消固定可见。没有新增可写工作簿镜像或传输层。当前代码、测试及验收文档均未提交，不自动 commit/push；完整 41 项目标仍未完成。以下阶段记录保留，以本段为最新状态。

本批只做三项：文本包含／不包含／开头／结尾；同一规则全范围的重复／唯一值；命中后停止低优先级规则。React 复用原面板与 `runNativeConditionalFormatAtom`，Worker 继续传递 `conditionalFormat.change`，所有匹配、优先级、历史及显示样式都由 Rust 计算。重复值复用原范围派生 atom，滚动不重新扫描，跨区域共享统计域，离屏数据和公式结果参与；不新增前端数据副本或传输层。

演示在 Summary `E85:F89`：E 列 Ready／ready／Review／On hold／公式结果，F 列 Cedar／cedar／Birch／公式结果／空文本。原生第 9 条文本规则开启 Stop，Ready 绿色且不继承第 11 条斜体；第 10 条标红重复值，可改为 Unique。原 8 条规则的顺序不变。样例避开原查找、统计和尺寸样例，不覆盖旧数据。

语义边界：文本为忽略大小写的字面量匹配，保留空白，不宣称通配符或地区语言比较。重复值比较计算后的类型和值，数字与文本不混同，空值／空文本／错误不标记；并非完整 Office 格式化显示值比较。Stop 参考 [Microsoft 条件格式 API 说明](https://learn.microsoft.com/en-us/office/dev/add-ins/excel/excel-add-ins-conditional-formatting)：命中后拦截所有低优先级效果，包含色阶／数据条；不清掉基础样式或更高级规则。色阶／数据条自身不提供 Stop 控件，Rust 拒绝非法组合。

阶段验证：新增 Rust 专项 7/7，UI Core／Worker／React 专项 55/55，WASM lib 183 passed / 1 ignored；lite/full 构件已重建。首轮页面专项 23/24，唯一失败是新增断言把默认底色写死为透明，已改为验证未高亮并正在复跑；旧查找替换与规则管理通过。完整 Vitest、构建、lint、lite 原生专项及最终页面专项正在运行，尚不作为本批最终验收。未自动提交或推送。完整 41 项目标仍未完成。

后续阶段证据：新功能、旧公式／排名、桌面／390px 和真实 lite/full 保存恢复最终专项 **21/21**（`/tmp/excel-cf-text-focused-corrected.log`，会话 `23553` 退出 0）。全量 Vitest **5577/5577**、React 独立 **392/392**（会话 `86458` 退出 0）。先前 39/40 的窄屏提交按钮问题已修复为面板内固定操作栏；演示清单两处旧断言已同步，并新增样例不得覆盖旧格子的检查。根构建、类型、边界及循环依赖通过（727 modules / 2075 dependencies），尚有产品 JSX 和持久化测试各一处长行，冻结回归结束后仅换行并复核 lint。

完整 E2E 正在原会话 `95123` 执行，日志 `/tmp/excel-cf-text-full-e2e-frozen.log`，共 **900** 项；执行中不修改产品源码或 WASM，不重启队列。默认／lite Rust 核心 lib 原会话 `35756`；默认专项 `42153`；lite 专项 `29418` 已退出 0，最后新增的 Stop 场景另以 `/tmp/excel-cf-text-stop-lite-final.log` 复跑。上述句子仅记录运行证据，未将本批升级为已验收。桌面／窄屏截图 `/tmp/excel-cf-text-1280.png`、`/tmp/excel-cf-text-390.png` 已检查；长表单允许面板内滚动，提交与取消固定可见。共享 visual-runtime 未安装，用持久 Playwright 溢出、焦点、页面错误断言补充，不宣称运行不存在的视觉工具。演示 `http://127.0.0.1:5183/` 返回 200。

### 排序优先级、大小写与空格位置（已验收）

提交更新：本批及前一批文档已按用户要求在 `1c223c9b` 提交并推送 `origin/main`；提交门禁 2008/2008 通过。下方“未提交”字样为验收时的历史记录，不代表当前提交状态。

该提交 [CI](https://github.com/allroad88888888/einfach-excel/actions/runs/38174075127) 已完成并全部成功：Node 22.12.0／24 构建与单测、Rust 默认／lite、benchmark 编译、WASM 原生及 headless Chrome 均通过；docs 与 Publish 工作流也成功。此证据仅属于排序提交，不替代当前未提交的条件格式回归。

最终验收：完整 E2E **888/888**（12.3 分钟，原会话 `74761` 正常退出 0，日志 `/tmp/excel-sort-options-full-e2e-frozen.log`），无失败、跳过或重试，本批八项页面交互与两项真实 lite/full 保存恢复全部包含其中。Rust 核心 lib 默认 **1654 passed / 3 ignored**、lite **1631 passed / 3 ignored**（原会话 `21480` 退出 0），结合下方各配置原生专项、WASM 与完整 Vitest，闭合本批三项验收。E2E 完成后仅将持久化测试的一处长行换行，产品源码、WASM 及断言语义不变；E2E lint 通过，对应真实构件测试再跑 **2/2**（`/tmp/excel-sort-options-persistence-final.log`）。文档与差异检查通过，演示 `http://127.0.0.1:5183/` 返回 200。

本批按批次 skill 和单一职责规则复用现有命令链，前端 skill 用于保留紧凑样式及桌面／窄屏焦点验证。未新增前端排序器或工作簿镜像。当前生产改动、测试及本次验收说明均未提交，不自动 commit/push。完整 41 项目标仍未完成；以下阶段证据保留，以本段为最新状态。

本批三项：上下移动排序级别；区分大小写；真正空单元格置顶／沉底。优先级和大小写入口参考 [Microsoft 排序说明](https://support.microsoft.com/en-us/excel/sort-data-in-a-range-or-table-in-excel)，空格置顶是本项目显式选项，默认保持空格最后。沿用现有确定性 Unicode 码点比较，不宣称地区语言排序；空文本及返回空文本的公式仍属于文本，不归为空单元格。排序级别调整携带列与升降序一起移动，提交前只修改草稿，取消／重开恢复默认。

调用链不变：React `SortTools` → UI Core `configureSortAtom`／`sortSelectionAtom` → 原有 `range.sort` → Rust 稳定行置换／历史 → 原生投影。面板是唯一选项草稿；Worker 不再强制 `caseSensitive: false`，仅验证并转发两个布尔选项到原生排序键。`SortKey.empty_first` 只改变空格与非空值的比较，排序相等时继续比较下一层；手动隐藏行参与，筛选掉的行保持原位。存量 `sort.rs` 原为 1168 行，本次只局部增加字段及比较分支，不借机大拆；新测试分原生比较、WASM 协议和真实页面职责组织，均低于 300 行。

演示复用 Summary `D32:F37` 的 Maple／maple／带空格文本及记录 ID，只在 F38、F39 补 `empty-a`、`empty-b`，其 D/E 真正留空；原名称序列、去重样本不改。选 `D32:F39` → Custom sort → 勾表头，测试大小写与空格位置；选 `A25:C29` 添加 B 列降序，再上移成第一关键字，可比较多级优先级。新增选项仅改变本次原生排序，面板选项本身不保存到工作簿。

当前证据：命令／Worker／React 专项 **23/23**；完整 Vitest **5567/5567**、React 独立 **388/388**；Rust 新选项专项默认／lite 各 **5/5**，连同筛选、跨表、合并及 spill 相邻回归各 **20/20**；原生旧排序 lib 专项 **38/38**，WASM lib **182 passed / 1 ignored**。lite/full 均重建，真实构件排序结果保存／恢复和原生历史 **2/2 E2E**；页面新增八项与旧排序、去重、名称序列共 **42/42 E2E**。根构建、主线类型、lint、边界、循环依赖通过。桌面／390px 截图已检查，移动后的字段焦点与提交按钮可见；共享 visual-runtime 仍缺失，使用持久 Playwright 溢出／焦点／控制台断言补充。

队列记录：完整 E2E 会话 `74761`、Rust 默认／lite 核心 lib 会话 `21480` 均已正常退出，未重启。原生日志为 `/tmp/excel-sort-options-core-lib.log` 与 `/tmp/excel-sort-options-core-lib-lite.log`。生产源码与 WASM 在 E2E 期间冻结，唯一 E2E 长行问题已在队列结束后修正并复核。此前 878/878 只属于上一批，本批以新增完整 888/888 证据验收。

### 筛选值列表、搜索与分页（已验收）

最终验收：提交 `90ee7061` 的完整 E2E **878/878**（12.2 分钟，原会话 `76867` 正常退出 0，日志 `/tmp/excel-filter-values-full-e2e-frozen.log`）通过，无失败、跳过或重试；本批六项持久页面测试全部包含其中。全量 Vitest **5562/5562**、React 独立测试 **387/387**、提交钩子受影响测试 **3085/3085** 通过，根构建、UI Core 构建、类型、lint、边界、循环依赖及文档检查通过。生产源码与 WASM 构件在完整页面回归期间未修改。

同提交 [CI](https://github.com/allroad88888888/einfach-excel/actions/runs/38171505647) 全部成功：实际日志 `/tmp/excel-filter-values-ci-rust.log` 确认 Rust 默认 **3471 passed / 10 ignored**、lite **3431 passed / 10 ignored**、WASM 原生 **180 passed / 1 ignored**、WASM Chrome **7/7**、基础 atom **64/64**，benchmark 编译通过；Node 22.12.0／24 构建与单测均通过，文档和发布流程成功。桌面／390px 截图已检查，候选、搜索、分页及提交可见；视觉 skill 所需的共享脚本缺失，使用持久 Playwright 的溢出／焦点／控制台断言补充，未宣称执行不存在的 visual-lint。演示 `http://127.0.0.1:5183/` 返回 200。

调用链：React 事件 → UI Core command atom → 只读 Rust 候选查询 → 当前页 atom → React；确认时复用原有筛选写命令与原生历史。`panel-state.ts` 是唯一条件草稿，`values.ts` 只负责候选交互，React 组件只显示控件，WASM 只转换协议。新增层均服务当前功能，没有工作簿镜像。生产代码已提交推送；本次只更新验收与使用说明，尚未提交。以下保留阶段记录，以本段为当前状态；完整 41 项目标仍未完成。

手动复测：Sales Orders 选 `A1:H1001`，通过工具栏筛选菜单设置选区范围，点 A 列表头筛选按钮 → `Choose values`。勾选 `SO-10001`，翻页勾选 `SO-10051`，搜索并勾选 `SO-11000`，点击 `Apply filter` 后仅保留三条数据，Undo／Redo 一步恢复。Summary 的 DemoTable 可用相同入口筛选，保留汇总行及另一个 Table 的条件。查询不受当前列自身条件限制；选择上限 1,000 项，扫描预算 50,000 格，超限明确报错。查询级全选／排除条件与高级筛选不在本批完成范围内。

本批三项：勾选列值进行筛选；搜索候选值；翻页浏览完整候选列表（包含离屏记录）。交互参考 Microsoft 的 [AutoFilter 值选择与搜索说明](https://support.microsoft.com/en-us/excel/quick-start-filter-data-by-using-an-autofilter)，沿用现有紧凑筛选弹窗及原生命令，不新增数据镜像。前端仅持有当前页与条件草稿；确认时继续使用已有 `sheet.filter`／Table 筛选命令。复用 Sales Orders 的千行原生数据和 Summary 的 Table，不以视口数据拼候选。

原生阶段已实现 `workbook_filter_values.rs`：按普通区域或 Table 的原生范围读取候选，排除表头与汇总，按原生筛选文本精确去重／计数，大小写不敏感搜索后分页。当前列自身条件不限制候选，其它列仍按原生谓词判断；其它作用域只读已提交隐藏快照，手动隐藏行仍列入候选。空白和多行文本保留原值。扫描超过既有 50,000 格预算明确拒绝，不静默截断；一页最多 100 项。`wasm_workbook_filter_values.rs` 仅转换协议，新增的只读 `sheet.filterValues` 命令转发当前版本查询，版本不符在原生调用前拒绝，读取不增加历史或版本。

当前证据：新增 Rust 专项默认／lite 各 **7/7**，包括 1,200 个候选完整翻页、末行搜索、空白／布尔／错误／公式／换行文本、手动隐藏行、作用域隔离、预算及 UTF-16 长度边界。默认配置连同 Table 作用域／历史／结构共 **17/17**；lite 相邻队列仍在原会话 `35051` 执行（`/tmp/excel-filter-values-lite-verified.log`），未重启。Worker 专项 **8/8**，UI Core 构建、React 类型、lint、边界、循环依赖及文档检查通过；API 签名门禁 **10 passed / 1 ignored**，快照只新增一个 `filter_values` 方法。最终 WASM lib **180 passed / 1 ignored**，lite/full 均重建，并使用两份真实构件通过 1,200 个值的分页、搜索、隐藏快照与历史不变烟测。不把此前 872/872 E2E 当作本批证据。

页面阶段已接通：UI Core `panel-state.ts` 保存唯一条件草稿，`values.ts` command atom 读取候选页并处理勾选／搜索／翻页，React `FilterValueChoices.tsx` 直接使用公共 atom。跨页选择保留、多行文本不拆分，关闭／换列／重开后的旧响应丢弃；超过 1,000 个选择明确拒绝而不截断。新增 UI Core **14/14**、React **3/3** 通过；上述 lite 相邻原生队列已正常退出，共 **17/17**。新增持久 E2E 覆盖千行数据、Table、其它列条件、空白／多行文本、键盘、桌面／390px 布局与取消不写历史。首次相关页面回归 **13 passed / 3 failed**，三处均为分页状态定位器同时匹配前后翻页按钮，现已改为精确匹配，复跑结果见后续提交记录。

提交前复跑：相关真实 Worker E2E **22/22**（新增值列表、原普通筛选、Table 表头），完整 Vitest **5562/5562**，根构建、主线类型、展现层边界、循环依赖及文档检查通过。修正新增测试误用 Playwright 的 `exact` 参数到 Testing Library 的类型问题；修正五处行长及分页定位器，不改变产品行为。日志为 `/tmp/excel-filter-values-commit-{build,tests,e2e,cycles,docs}.log`。

按用户要求先提交并推送当前进度，不将阶段提交视为批次验收；本批最终全量 E2E 仍待执行，不复用此前 872/872。存量 Worker `runtime.ts` 原为 453 行，本批只增加查询分支，不扩大重构；其它新增文件均低于 300 行。共享 visual-runtime 目录仍不可用，使用项目持久 Playwright 溢出／焦点／控制台断言补充。未验收前不开始其它功能批。

### Excel Table 独立筛选（已验收）

最终验收：修正旧测试入口后的完整 E2E **872/872**（12.0 分钟，原会话 `51872` 退出 0，日志 `/tmp/excel-table-filter-full-e2e-final.log`）通过，生产代码及 WASM 全程冻结，没有失败、跳过或重试。最终 Vitest **5542/5542**、React 独立测试 **384/384**、专项命令 **22/22**、表头／筛选 E2E **16/16**，结合下列同生产提交的 CI 双配置 Rust、WASM、构建及单测，闭合本批三项验收。边界、循环依赖（723 模块／2066 依赖）、类型、lint／E2E lint、文档及差异检查通过。演示 `http://127.0.0.1:5183/` 返回 200；Summary 的 DemoTable／CalculatedOrders 可手测。本次只补测试与验收记录，尚未提交；下方阶段记录保留，不代表当前状态。完整 41 项计划仍未完成。

本批遵循批次 skill 的三个相关功能范围及三层回归要求。最终调用链仍为 React 事件 → UI Core 筛选 command atom → 既有 Table 命令 → Rust/WASM → 原生投影 → React。`scope.ts` 只从当前投影确定目标 Table；原生 geometry 模块只负责结构变化时搬移筛选快照，未增加业务镜像、扫描层或独立历史栈。

提交后收尾：`d7803b48` 的 [CI](https://github.com/allroad88888888/einfach-excel/actions/runs/38168332514) 三组全部成功。实际 Rust 日志确认默认全量 **3464 passed / 10 ignored**、lite 全量 **3424 passed / 10 ignored**、WASM 原生 **178 passed / 1 ignored**、WASM Chrome **7/7**、基础 atom **64/64**，benchmark 编译通过；Node 22.12.0／24 的构建与单测均成功。

首次冻结源码的完整 E2E 为 **870 passed / 1 failed**（12.5 分钟，原会话 `29393` 退出 1，日志 `/tmp/excel-table-filter-full-e2e-frozen.log`）。唯一失败是旧表头测试等待普通区域按钮 `Filter column B`，该重合位置现显示 Table 专属按钮。将测试参数化覆盖普通区域与 Table 两种作用域：前者从表外活动格的工具栏进入，后者从 Table 表头进入；保留筛掉行、跨表数组公式、隐藏表头及撤销／重做的全部断言，并补恢复后的条件值检查。专项 **16/16** 通过（`/tmp/excel-table-filter-header-regression.log`，14.7 秒），没有修改生产代码。修正后的完整 **872 项 E2E** 继续验证，完成前不验收、不进入下一批；本次测试修正与记录尚未提交。

本批三项：设置当前 Table 的列筛选、只清除当前 Table 筛选、只重新应用当前 Table 筛选。初始 WIP 已按用户要求以 `d39bda13` 提交推送；本次按用户要求继续提交并推送当前进度，不代表整批验收完成。

当前已接通原生基础与协议：Table 持有条件及上次隐藏行结果，普通区域与各 Table 可并存；复用区域谓词扫描器，可见性合并各作用域隐藏行，编辑不自动重扫。撤销／重做复用 Table 前后像；行列插删、缩表、关闭表头、删除／恢复／转区域及追加行带动下方 Table 位移同步隐藏快照，不重扫数据。WASM 保存条件与隐藏快照，UI 投影只传条件；恢复校验拒绝范围外、表头等非法隐藏坐标。UI Core 已将三种动作接入既有 `table.change`，没有新增传输层或历史栈。

原生证据：Rust 作用域 **3/3**、历史 **2/2**、结构／恢复 **5/5**；普通区域结构 **3/3**、Table 样式 **7/7**；默认配置核心 lib **1,654 passed / 3 ignored**；lite 核心 **1,631 passed / 3 ignored**、筛选／复制／统计交叉 **38/38**；WASM lib **178 passed / 1 ignored**。lite/full WASM 产物已重建。

页面续改：现有 Table 表头出现独立筛选按钮，工具栏按活动格显示当前 Table 名；同一弹窗可设置、清除或重新应用指定 Table 的条件。只清除一列时保留其它条件；普通区域保持原入口。筛选隐藏当前格后，优先留在 Table 内的可见行或表头；异步返回不抢走后来移动的选区。`scope.ts` 仅从 Rust 投影派生目标；没有新增工作簿镜像或 React 状态。

种子继续使用 Summary 的两个原生 Table：DemoTable 初始 Amount ≥ 0，CalculatedOrders 初始 Quantity ≥ 1，所有原始记录均满足，不改变初始布局。条件通过 Rust 初始化命令建立，启动历史清空。真实页面测试发现启动快照曾丢掉新增字段，已补条件校验、独立冻结快照及初始化回归，不用前端补写掩盖问题。

页面专项 **18/18 E2E** 通过（`/tmp/excel-table-filter-focused-e2e-fixed.log`，16.6 秒）：包含本批 10 项、原普通区域 8 项，以及 lite/full 保存恢复。桌面／390px 截图已检查，弹窗无横向溢出、提交与焦点可见；缺少共享视觉脚本，使用项目 Playwright 溢出／焦点／控制台断言补充检查。其后补齐整个 Table 连表头被其它筛选隐藏时的选区回退，最终命令专项 **22/22**、全量 Vitest **5542/5542**、React 独立测试 **384/384**、根构建及 lint 通过。最终源码的完整 **871 项 E2E 尚未运行**，专项结果不替代全量验收。存量 `rust-workbook/commands.ts` 超过 300 行，本次仅增加协议字段；其它新增／修改文件均在上限内。

手动复测：Summary → A80 的 DemoTable，B 列筛选将 Minimum 从 0 改为 20，应隐藏 Keyboard，汇总保留并变为 50；把 B82 改成 -5，先保持可见，重新应用后才隐藏该行；清除 DemoTable 筛选不影响 CalculatedOrders 或 A25:C29 的普通区域筛选。下方上一批的完整回归结果不覆盖本批续改。

### Excel Table 追加记录与 Tab 导航（已验收）

最终验收：源码冻结后的完整 E2E **861/861**（11.9 分钟，原会话 `73546` 正常退出 0，日志 `/tmp/excel-table-append-full-e2e-frozen.log`）；本批 12 项页面／保存恢复回归全部包含其中。完整 Vitest **5,525/5,525**、React 独立测试 **381/381**、最终专项 **68/68**、Rust 默认／lite 四组集成各 **26/26**、WASM lib **175 passed / 1 ignored**；根构建、UI Core 构建、类型、lint／E2E lint、边界、循环依赖、文档及 diff 检查通过。之前受热更新干扰的回归不计入验收，新冻结队列没有失败、跳过或重试；下方保留阶段记录，当前以本段为准。演示继续使用 Summary 原生种子，不添加前端数据副本；本批按用户要求独立提交，完整 41 项目标仍未完成。

当前收尾证据：完整 Vitest **5,525/5,525**、React 独立测试 **381/381**、最终命令／面板／键盘专项 **68/68**；Rust 默认／lite 四组集成各 **26/26**、WASM lib **175 passed / 1 ignored**。根构建、UI Core 构建、React 类型、lint／E2E lint、边界、循环依赖、文档及 diff 检查通过。构建先暴露公共阻断原因的类型重复及测试假件载荷类型问题，均已修正；自动填充旧文件只改公共类型引用，未扩大重构。首轮完整浏览器回归在一次取单元格高度前捕获大量 Vite hot-update，已明确停止该受干扰队列，不修改原回归断言。源码与构件现已冻结，完整 **861 项 E2E** 在 `/tmp/excel-table-append-full-e2e-frozen.log` 继续（会话 `73546`，启动时 Playwright PID `54051`）；等待其最终退出后才能验收。桌面／390px Table 面板截图已检查，按钮焦点可见，无横向溢出。演示 `http://127.0.0.1:5183/` 返回 200；当前续改未提交，完整 41 项计划保持未完成。

续改：三项入口均已接通。修正追加行 E2E 对 B85 的错误预期：种子原值是 `ALPHA`，追加时下移到 B86，撤销应恢复 `ALPHA` 而不是空白。新增真实页面 Tab／Shift+Tab、编辑后导航、隐藏行列、lite/full 保存恢复回归，专项 **12/12**；WASM lib **175 passed / 1 ignored**。全量 Vitest、构建、静态检查、React 独立测试、默认／lite 原生专项及完整 E2E 已启动，最终退出前仍不验收。此前 WIP 已按用户要求以 `457efc0e` 提交推送，本段续改未提交。

调用链：React 原键盘事件 → UI Core `dispatchTableTabAtom` → 需要追加时复用 `changeNativeTableAtom` → Rust Table 事务 → 返回投影 → 选区定位。面板改为共用同一提交命令；Table 目录没有第二份缓存。`native-feedback.ts` 只保存共用在途／错误反馈，编辑、撤销及内容写入在追加等待期间拒绝启动；响应晚到不会抢走用户已经移动的选区。`native-change.ts` 负责一次原生命令的确认，`tab-navigation.ts` 负责 Table 单格 Tab 导航，普通多格／多区选区保持原行为。

手动复测（Summary，可每组刷新恢复种子）：

1. Tables → DemoTable → Add data row：范围变为 A80:B85，汇总到 B85，B86 保留移下来的 `ALPHA`；Undo 整体恢复。
2. 定位 B81，Tab 到 A82；Shift+Tab 回 B81。定位 B83，Tab 新增一条记录并到 A84，汇总下移。编辑值再 Tab 时，编辑值与追加行各自占一条原生历史。
3. 定位 CalculatedOrders 的 C49，Tab 到 A50，C50 自动继承公式并显示 0；Shift+Tab 回 C49，不创建新行。隐藏行／列后，区内前后导航跳过不可见格。

本批三项：Table 面板末尾添加一行数据；Tab 在数据区跨行并在末格新增记录；Shift+Tab 反向跨行。Rust 拥有新增记录、汇总行移动、计算列与历史，UI Core 只拥有键盘命令及选区移动，React 继续直接使用公共 command atom。复用 Summary 的 DemoTable／CalculatedOrders 种子，不增加第二份表状态。

原生阶段先把表头腾位的局部插行实现在 `workbook_table_row_insert.rs` 中复用：从真实插入位置移动 Table 列带，旁列不动；下方相邻内容、公式消费者、命名区域及规则沿既有前后像回放。`workbook_table_append.rs` 负责追加一条记录，空表复用待输入位置，计算列失败时回滚并保留 redo。WASM／UI Core／React 的 Add data row 入口已接入；Tab／Shift+Tab 尚未实现。

提交检查点：按用户要求连同上一批已验收的粘贴扩表提交当前进度，不代表本批验收。追加行 Rust 专项 **5/5**、UI Core／React 专项 Vitest **32/32**、UI Core 构建及 React 类型检查通过，两种 WASM 构件已重建。追加行 E2E **3 passed / 1 failed**：汇总行追加后编辑、连续撤销恢复的用例在第 38 行断言失败，待定位；不能以其余通过项代替该回归。上述结果来自 `/tmp/excel-table-append-*.log`，全批仍为进行中。

### Excel Table 粘贴扩展（已验收）

最终验收：完整 E2E **849/849**（11.9 分钟，原进程退出 0），完整 Vitest **5,505/5,505**、React 独立测试 **377/377**、WASM lib **174 passed / 1 ignored**；默认／lite 核心 lib 分别 **1,654／1,631 passed（各 3 ignored）**，相关七组集成各 **59/59**，追加表外 spill 边界后粘贴专项双配置各 **12/12**，所有队列均正常结束。两种 WASM 重建、根构建、UI Core 构建、类型、lint／E2E lint、边界、循环依赖、文档及 diff 检查通过。新增边界验证跳过的表外 spill 子格在粘贴／撤销／重做后仍由原锚点派生，无需修改生产代码；最终生产模块 152 行、专项原生测试 256 行、页面与保存恢复 E2E 139 行。下方保留阶段证据，当前以本段为准。本批完成不代表 #32 或完整 41 项计划完成；本批改动尚未提交。

本批三项：向下粘贴多行扩表、向右粘贴多列扩表、新记录继承计算列并一次撤销。沿用 React 粘贴 command → Rust 粘贴计划 → 原 Table 事务 → 返回投影，没有新增前端 atom、Worker 命令或历史栈。`workbook_table_paste.rs` 只负责粘贴触发的表定义及继承计划；显式粘贴值／空白、已有例外优先于模板，空表首次记录也复用同一事务。

向下粘贴不自动纳入超宽列，遵循[微软的粘贴扩表说明](https://support.microsoft.com/en-us/excel/resize-a-table-by-adding-or-removing-rows-and-columns-in-excel)；向右粘贴生成唯一文字表头。纯格式、纯清空、剪切及保护表不隐式扩展；归属不明确／障碍时保留合法普通粘贴。汇总行下方输入仍不自动扩行，汇总行新增数据交互继续留在后续范围，不借此批改写其语义。

复用 Summary 的 CalculatedOrders 原生种子：在 A50 粘贴 `4\t40\n5\t50`，C50／C51 应为 160／250，Table range 为 A46:C51，B6 为 550；Undo 一次恢复原范围与合计 140。在 D46 粘贴两列表头及数据可检查扩列、列名唯一化与文字公式表头。持久 E2E 位于 `e2e/workbook/table-paste-expansion.spec.ts`，覆盖真实页面、内部复制及 lite/full 保存恢复。

首轮原生专项 **1 passed / 5 failed**，实现后 **6/6**；增补校验／订阅／历史专项后默认与 lite 各 **30/30**（含新增专项 10 项）。首轮浏览器 **4 passed / 2 failed**，两处差异仅为持久化稀疏 cells 的 HashMap 枚举顺序；按 sheet／row／col 排序后仍严格比较全部字段，交叉 E2E **17/17**。随后新增空表首次粘贴继承回归，当前默认／lite 扩大专项、WASM 重建及完整静态／Vitest／构建正在执行；最终证据补记前不算本批验收。当前未提交，完整 41 项计划范围不变。

当前收尾证据：最终默认／lite 七组专项各 **59/59**（新增粘贴专项 **11/11**），核心 lib 默认 **1,654 passed / 3 ignored**、lite **1,631 passed / 3 ignored**，两条原生队列均正常退出 0；这是核心单测与相关集成回归，不冒充全部原生集成目标。WASM lib **174 passed / 1 ignored**、两构件重建、最新交叉 E2E **17/17**、完整 Vitest **5,505/5,505**、根构建、UI Core 构建、类型、lint／E2E lint、边界、循环依赖和文档检查通过。完整 **849 项 E2E** 仍在 `/tmp/excel-table-paste-full-e2e.log` 原进程运行，生产源码及构件保持不变；等最终退出后再验收本批，不开启下一批、不自动提交。

### Excel Table 列样式与表头（已验收）

最终验收：默认→lite 原生全量队列正常退出 0，默认 **3,437 passed / 10 ignored**、lite **3,397 passed / 10 ignored**（各 253 组，含 doc-tests）。完整 E2E **843/843**、Vitest **5,505/5,505**、React 独立测试 **377/377**、WASM lib **174 passed / 1 ignored**，两种 WASM 构建、根构建、UI Core 构建、类型、lint、E2E lint、边界、循环依赖及文档检查均通过。本批三项功能及空表显隐、首次输入、历史、保存恢复交叉完成；链路仍为 React → UI Core command atom → Rust/WASM 事务 → 返回投影，没有新增前端状态层。下方保留各阶段检查记录，最终状态以本段为准。完整 41 项计划仍未完成。

本批手动复测（演示 `http://127.0.0.1:5183/`，每组可刷新回到原始种子）：

1. **隔列底色**：切到 Summary，定位 `A47`，打开 Tables → CalculatedOrders。种子已勾选 Banded columns：A／C 列数据格为浅绿，B 列为白色。取消开关后底色消失；关闭弹窗，Undo 恢复底色，单元格值不变。
2. **末列强调**：同一表取消 Last column emphasis，C47:C49 不再加粗，Undo 恢复。在 `D47` 输入 `7`，表自动扩列后 D 列成为加粗末列，C 列不再强调但计算结果不变；Undo／Redo 各对应整次输入。
3. **表头显隐**：同一表取消 Header row，表范围从 `A46:C49` 变为 `A47:C49`，第 46 行表头清空，数据和列名保留；重新显示或 Undo 可恢复。空表边界用 DemoTable：先 Hide totals row，再把 Table range 缩到 `A80:B80`。此时反复切换 Header row 仍保留 `A80:B80`，不移动第 81 行数据；隐藏后可在 B80 输入 `7`，Undo 回到空表输入位置。

以上入口由持久 E2E 覆盖；全批已通过上述完整回归。

Rust 默认配置全量已完成：**3,437 passed / 10 ignored**（253 组结果，含 doc-tests），原 `&&` 队列已自动进入 `--no-default-features` 编译，证明默认阶段退出 0；没有重启正式回归。本批新增空表显隐 **6/6**、批量写入／范围／结构及 Table 列样式均在该完整回归中通过。完整 E2E **843/843**、Vitest **5,505/5,505**、WASM lib **174 passed / 1 ignored** 及构建／静态结果保持有效，生产源码和两种 WASM 构件未再变化。只剩 lite 全量尚未结束，继续原日志 `/tmp/excel-empty-visibility-all-native.log`；当前批次仍待最终验收、不自动提交，完整 41 项计划不变。

完整浏览器回归已正常退出 0：**843/843**（12.7 分钟，`/tmp/excel-empty-visibility-full-e2e.log`），覆盖本批隔列底色、末列强调、表头／空表显隐及现有功能交叉，没有重试或删减用例。UI Core 包构建与 React 包独立测试 **377/377**（84 文件）也通过。Rust 默认核心 **1,654 passed / 3 ignored** 已完成，默认集成回归仍在原默认→lite 全量队列执行，尚不计全量或双配置通过；日志 `/tmp/excel-empty-visibility-all-native.log`。本轮只核对回归及更新记录，生产源码和 WASM 构件未再变动。整批仍待 Rust 全量最终结果，不开启新批次、不自动提交；完整 41 项目标未完成。

原生全量耗时核对：原 Cargo 进程持续推进，已进入数据验证集成测试，尚无失败。对刚启动的测试程序采样显示停留在 macOS `_dyld_start`，尚未进入测试逻辑；已加载程序再次执行 `--list` 可立即结束。尝试仅列用例的并发预热后，系统加载吞吐没有明显改善，已停止该辅助进程；预热不执行断言、不计入通过数，正式默认→lite 回归始终未停止或重启。没有修改系统安全设置、源码或测试范围，继续以原队列最终退出状态验收，不把耗时当作失败或卡死。

显隐最终专项：新增“仅表头空表”页面用例已复验，空表显隐／首次编辑／保存恢复专项 **8/8**（11.2 秒），保留相邻数据、精确历史和 lite/full 首末行边界断言；全量 Vitest **5,505/5,505**（340 文件）、根构建、类型、lint、E2E lint、边界、循环依赖和文档检查通过。前一默认→lite 五组队列已退出 0（默认 46 项，lite 增补模板用例后 47 项），WASM lib 最终 **174 passed / 1 ignored**。完整 **843 项 E2E** 与 Rust 默认→lite 全量现已启动，分别写入 `/tmp/excel-empty-visibility-full-e2e.log`、`/tmp/excel-empty-visibility-all-native.log`，仍在运行；不以专项代替整批验收。生产改动及 WASM 构件已冻结，无新状态层，所改源码最大 193 行；演示 `http://127.0.0.1:5183/` 返回 200。本轮未提交，不开启下一批，完整 41 项计划保持未完成。

最后一行显隐续改：上一轮结构队列已正常退出 0，默认／lite 各 **96/96**，并按用户要求以 `d3f935ed` 提交推送。当前沿原 Table 事务开放唯一表头／汇总行的隐藏：原地清空并保留空表输入位置，再显示时复用该行，不吸收或移动邻行；普通空数据记录仍走原几何规则。首次原生专项 **2 passed / 3 failed**，修复后 **5/5**，再补计算列模板跨显隐后首次输入回归，lite 新专项 **6/6**。WASM lib **174 passed / 1 ignored**、两构件重建及首轮 E2E **23/23** 通过；新增“仅表头空表”真实页面用例和测试变量命名修正已进入完整 E2E，尚不计最终通过。全量静态／Vitest／构建仍在执行，日志前缀 `/tmp/excel-empty-visibility-`。没有新生产模块、前端 atom 或 Worker 命令；复用 Summary 的 DemoTable 验证显隐和首次编辑，种子不变。当前续改未提交，整批与完整 41 项目标仍未验收。

结构阶段当前结果：默认配置十一组 **96/96**（含新增结构专项 **8/8**），WASM lib **173 passed / 1 ignored**、lite/full 重建、交叉 E2E **23/23**；新 E2E 长行等价换行后专项复验 **2/2**，所有断言保留。全量 Vitest **5,505/5,505**、根构建、类型、lint、E2E lint、边界、循环依赖及文档检查通过，服务 `http://127.0.0.1:5183/` 返回 200。lite 原生已进入同一默认→lite 队列，仍在运行；尚不能记双配置最终完成，没有因等待重启。生产链继续复用原 Rust 结构事务，没有新增状态层或生产模块。下一步开放最后一行表头／汇总显隐并补真实页面回归，随后做整批验收；本轮未提交，完整 41 项计划保持未完成。

空表结构续改：上轮范围默认→lite 原队列已退出 0，双配置各 **80/80**，未重启。本轮新结构专项先 **2 passed / 4 failed**，修复后首轮 **6/6**；表整体位移／增删列保留空表，表内插行创建记录并为原待输入位置继承计算列，删除输入行清掉标记，删除真实汇总行关闭汇总而不把上一行重新归类。汇总行前插入时，原输入位置位于移动带上方，结构快照只额外捕获实际继承格；数组依赖按实际写入范围重投，仍是一条结构历史。随后补无表头及跨表数组订阅两项，新专项共 8 项进入扩大回归。WASM lib **173 passed / 1 ignored**、两构件重建、结构／空表／计算列／汇总 E2E **23/23**（19.2 秒）通过；默认／lite 十一组回归及全量静态检查仍在运行，日志前缀 `/tmp/excel-insert-structure-`。新增原生测试 212 行、E2E 69 行；未新增生产模块，结构历史 286 行，种子及前端状态未变。最后一行表头／汇总显隐及整批完整验收仍待完成，本轮未提交，完整 41 项范围不变。

范围阶段当前结果：默认原生九组 **80/80**（含新增范围专项 **10/10**），WASM lib **173 passed / 1 ignored**，lite/full 重建及范围／自动扩展／计算列 E2E **26/26**（23.6 秒）通过。全量 Vitest **5,505/5,505**、根构建、类型、lint、E2E lint、边界、循环依赖和文档检查通过；E2E 的一处 101 字符断言行做了等价换行，没有改变断言或产品源码。lite 原生仍在同一默认→lite 队列运行，未重启，不提前记双配置完成。新增原生测试 205 行、浏览器测试 66 行；生产链仍是 UI Core command → 原 Rust Table 范围／输入事务 → 投影，无新增状态层，demo 种子未变，服务 `http://127.0.0.1:5183/` 返回 200。下一步处理结构插删中的待输入行及其计算列，再解除最后一行显隐的临时限制；当前批次及完整 41 项计划仍未验收。本轮未提交。

空表范围续改：上一轮两条原队列均已退出 0，默认／lite 集成各 **92/92**、核心 lib **1,654／1,631 passed（各 3 ignored）**、架构各 **10 passed / 1 ignored**，强化批量专项各 **9/9**；这属于范围续改前的证据。本轮新增 `table_insert_row_geometry.rs`，先 **1 passed / 5 failed**：宽度不变的空数据保留待输入行，显式加行或纳入相邻内容则转为数据记录，缩至仅表头清掉待输入标记；以上状态、计算列继承和格值进入原 Table 前后像。相邻公式与旧计算列现在统一整行安装后校验，不另起嵌套计算列事务；该新增顺序测试先 **7 passed / 1 failed**，修复后 **8/8**。再补相邻汇总输入及受阻数组扩入测试，发现原范围预检漏掉 blocked spill，已补同一数组限制；最终九组双配置回归、WASM/E2E 和全量静态验证正在执行（日志前缀 `/tmp/excel-insert-geometry-`），不提前计通过。仅新增原生测试和 lite/full 边界 E2E，实现仍复用原范围／输入事务，无新前端状态；修改源文件最大 283 行。行列结构变化的空表标记、最后一行显隐及整批验收仍待完成，本轮未提交，完整 41 项范围不变。

批量写入验证更新：新浏览器用例前两轮均 **36 passed / 2 failed**，分别是外部 TSV 被错误用于仅格式粘贴、普通公式粘贴被误当作执行数据验证；两者是用例前置条件不符既有契约。改为内部格式快照及“值类粘贴＋运算”后，保留精确数据／表定义／历史回滚断言，第三轮 **38/38**（31.7 秒）通过。原生同名公式测试同步强化为校验实际的新记录结果，并检查失败保留 redo；默认专项 **9/9**。WASM lib **173 passed / 1 ignored**、lite/full 重建、全量 Vitest **5,505/5,505**、根构建及文档／边界／循环依赖／lint／E2E lint／类型检查通过。默认核心 lib **1,654 passed / 3 ignored**、架构 **10 passed / 1 ignored**、十一组集成回归 **92/92**；lite 仍在原队列运行，尚不写双配置完成。当前实现及 WASM 已冻结；服务 `http://127.0.0.1:5183/` 返回 200。本轮没有改视觉或 demo 种子，不把直接 WASM 边界测试冒充新增 UI 验收，真实 Worker 的粘贴／填充／分列由既有持久 E2E 交叉覆盖。未提交，后续空表几何及整批验收仍保留。

空表批量写入续改：上轮按用户要求以 `08209675` 提交推送 WIP；当时新增专项 **0 passed / 5 failed**，不能作为可交付版本。本轮把空表标记接入现有格子历史的 `begin_ranges`／`finish`，仅保存实际激活的 Table 定义、计入历史预算；撤销／重做先检查该表身份，不覆盖其它表的外部改动。原五项已通过；补测直接公式校验回滚、无调用方历史的数组粘贴，先 **5 passed / 2 failed**，修复后空表四组专项 **21/21**。另新增分列与订阅回归，默认／lite 扩大原生、WASM 构建／E2E 和全量静态队列正在执行（日志前缀 `/tmp/excel-insert-bulk-`），未提前计为通过。按单文件职责规则将格子事务移到 `workbook_history_cells.rs`（131 行），历史栈文件减至 202 行；没有新增前端状态、Worker 接口或第二套事务。空表范围／结构变化、最后一行显隐及整批验收仍未完成，本轮未提交，完整 41 项目标不变。

首次单格输入阶段最终结果：默认／lite 原生各 **52/52**、WASM lib **173 passed / 1 ignored**、两构件重建、计算列／输入扩展／空表 E2E **23/23**、全量 Vitest **5,505/5,505**、根构建及文档／边界／循环依赖／lint／E2E lint／类型检查通过。所有原队列已退出 0，日志前缀 `/tmp/excel-insert-input-`；没有以观察超时重启。服务 `http://127.0.0.1:5183/` 返回 200。复用原输入 command → Rust Table 事务 → 返回投影，没有新增前端 atom 或 Worker 接口。下一步从现有批量历史的 `begin_ranges`／`finish` 路径处理粘贴等首次内容写入，保留清空／格式不创建记录、失败不改状态、撤销回到待输入行的语义；空表范围／结构变化及最后一行显隐也仍未完成。本轮未提交，当前三项批次和完整 41 项计划继续未验收。

空表首次单格输入续改：复用 `TableDefinitionChange` 和既有扩展输入事务，把 `insert_row` 关闭、当前格输入、计算列模板及同一行继承作为一条历史。关闭自动扩展时只写当前格，但仍创建真实记录；空字符串清空不创建记录，返回空文本的公式是实际记录。显式输入公式等其它列继承后再校验；校验失败／数组公式（含被挡住的数组）回滚整次输入、保留 redo，不向订阅者发布中间状态。新增原生专项先 **1 passed / 6 failed**，实现后扩为 **9/9**，覆盖可选表头／汇总、首次公式形成计算列、下一行继承、保护策略及往返历史。无新生产模块，输入实现 243 行、历史入口 114 行；新增原生测试 187 行／E2E 61 行。WASM lib **173 passed / 1 ignored**、两构件重建、计算列／普通自动扩展／空表首次输入 E2E **23/23** 通过；默认／lite 扩大原生和全量静态队列仍在执行，日志前缀 `/tmp/excel-insert-input-`。批量内容写入、空表的范围／结构变化及最后一行显隐仍待接入，本轮未提交，整批未验收。

上轮空表定义阶段的 lite 队列已正常退出 0：lib **1,631 passed / 3 ignored**、架构门禁及四组专项 **28 passed / 1 ignored**，与默认队列对应；未重启进程。该结果属于首次输入续改之前的源码，不用于替代本轮新增事务回归。

空表输入行当前验证：默认原生 lib **1,654 passed / 3 ignored**、架构门禁及四组专项 **28 passed / 1 ignored**；WASM lib **173 passed / 1 ignored**、两构件重建、表头／空表／保存恢复／汇总／范围 E2E **39/39**（`/tmp/excel-insert-row-e2e.log`）、全量 Vitest **5,505/5,505**、根构建及 lint／E2E lint／类型／文档／边界／循环依赖检查均通过。lite 原生仍在同一默认→lite 队列中运行，原进程已确认存活，结果未结束，不提前写通过。新增 `table_insert_row.rs` 62 行，WASM 恢复测试 198 行，E2E 141 行；本轮所改源文件最大 285 行。尚未开放最后一行显隐；下一步须让单格／粘贴等首次内容写入同步改变该原生标记，并把数据及表状态纳入同一历史，处理计算列继承和失败回滚，之后才能解除临时拒绝。未提交，整批及完整 41 项计划保持未验收。

空表输入行续改第一步：在原生 Table 定义增加 `insert_row`，沿原公式投影传递；它表示“零条数据、一个待输入位置”，不同于内容为空的一条数据记录。注册表要求该状态的几何恰为表头数＋汇总数＋一行，整批恢复先验证再发布；`#Data`／当前行引用不读取占位行，状态变化使同表／跨表消费者失效。WASM v1 新增可选 `insertRow`，false 不序列化，旧数据保持原语义。新增原生读取／原子拒绝专项 **2/2**、WASM lib **173 passed / 1 ignored**，包括 JSON 往返和旧数据缺字段测试；两构件、浏览器和扩大原生／静态回归仍在执行，日志前缀 `/tmp/excel-insert-row-`。此阶段没有开放表头／汇总的最后一行切换，首次单格输入、粘贴等内容写入及其原子撤销仍须接入，不能把可保存的空表元数据当作可编辑功能已完成。本轮未提交，当前批次及完整计划继续未验收。

空数据表阶段最终结果：默认／lite 原生专项及回归各 **47/47**、WASM lib **171 passed / 1 ignored**、两构件重建、表头／汇总／缩放范围 E2E **29/29**、全量 Vitest **5,505/5,505**、根构建及文档／边界／循环依赖／lint／E2E lint／类型检查通过。真实页面先因汇总目的行已有内容、随后因异步复选框被同步 `uncheck` 检查而失败；分别补真实清空前置操作、改为点击后等待原生回显，保留原数据及历史断言，生产逻辑未为测试放宽。最终浏览器日志 `/tmp/excel-empty-headers-e2e-verified.log`；原生及全量检查见同前缀日志。所有队列已退出，源文件最大 132 行，新增原生测试 88 行／E2E 105 行。仍用原 command atom → Rust 事务 → 投影链路，无新状态层；种子不变，可在 Summary 的 DemoTable 先清空 A81:B81，再缩到 A80:B81 测试表头显隐。演示 `http://127.0.0.1:5183/` 返回 200，本轮未提交。完整空表输入行及最后整批完整 E2E 尚待完成，不将这一步安全修复算作整批验收。

剩余空表语义依据：[Open XML Table 官方说明](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.table?view=openxml-3.0.1)将 `insertRow` 定义为仅空表显示的输入行；`insertRowShift` 说明下面有内容时须插入空格并下移，而非把已有值吞入表内。这证明“空表输入位置”不能等同于普通空数据记录；后续须在原生 Table 定义、写入、引用和保存恢复中一起处理，不能只放宽表头判断或在 React 伪造一行。目前尚未实现该模型，以下安全拒绝是中间状态，不算空表功能交付。

最新续改（空数据表）：上轮合并／数组修复已按用户要求提交推送为 `8e1b99f8`；原 lite 十三组回归最终 **61/61**，没有重启测试。新增 `table_headers_empty.rs` 三项先全部失败，分别证明零数据的表头＋汇总表被拒绝隐藏表头、首行汇总被误当作数据、关闭唯一汇总行发生减法下溢。当前沿原事务放开第一种显隐，以右开边界修复数据区判断，并对删除最后可见行在写入前拒绝；三项复验 **3/3**，不改相邻值、不增加前端状态。新增真实页面和 lite/full JSON 恢复 E2E，扩大原生／浏览器／构建检查正在进行，日志前缀 `/tmp/excel-empty-headers-`。无数据且没有任何可见行的 Table 表示仍未实现，不能把临时拒绝记为功能完成；当前批次和完整 41 项计划继续未验收，本轮未提交。

提交检查点：按用户要求保存并推送当前进度，不作为整批验收。隔列底色与末列强调已接入 React；表头显隐已初步接入 Rust 历史、WASM 命令与 UI Core，React 入口尚未接入。表头原生专项 6/6 与 UI Core 专项 34/34 通过，UI Core 构建通过；相关原生默认配置回归已通过，lite 队列尚未结束。最新 WASM 表头专项为 **1 passed / 1 failed**：JSON 恢复后，隐藏表头的数组引用溢出格应为 0，实际为 Null（`table_headers_wire_history_and_persistence`）。保留失败回归，不跳过或放宽断言；已占用表头目标行、首行及无数据行的处理仍待完善。此前列样式 E2E 24/24 属于表头续改之前的构件，不能代替当前整批验收。

上述检查点已提交推送为 `f03eaa97`，提交门禁 Vitest **3,028/3,028** 通过。续改已修复保存恢复顺序：Table 定义在公式安装前恢复，使现有批量安装直接生成正确数组投影，不新增第二次刷新。原失败断言保留并通过，另补跨表普通 Table 数组的非锚点首次读取、源值更新和普通公式保持惰性回归。WASM lib **170 passed / 1 ignored**（`/tmp/excel-table-headers-restore-wasm.log`）。

React 已在原 Table 样式面板接入 Header row 开关，直接调用现有 command atom，使用原生回包更新范围／状态；种子 `CalculatedOrders` 可验证隐藏、改列名、恢复及原计算列不移动。UI Core／React 专项 **48/48** 与类型检查通过。浏览器第一轮 **15 passed / 2 failed**（`/tmp/excel-table-headers-first-e2e.log`）：两种构件保存恢复通过，但键盘切换后禁用控件丢失焦点。现由既有 Table 弹窗记住实际焦点控件，回包后仅在焦点落到 body／dialog 时恢复，不抢走用户已经移动的焦点；保留原断言并补连续空格切换。

新增原生筛选交叉回归另复现数组漏投影：隐藏表头清除筛选后，不含 Table 引用的 `IF(SUBTOTAL(...),SEQUENCE(...),...)` 已变值却未改变溢出范围（`/tmp/excel-table-headers-filter-array.log`）。现沿现有筛选 epoch 的反向依赖收集受影响数组，在原事务结束后统一重投；不扫描整表。默认／lite 表头专项各 **6/6** 与 WASM lib **170 passed / 1 ignored** 复验通过，最终 UI 专项 **48/48**、相关 lint、类型、文档、边界与循环依赖检查通过。两种构件重建和浏览器复验仍在原顺序进程中，尚不记通过；本次续改未提交，表头自动腾位等边界及完整批次门禁仍待完成。

复验两种构件重建成功。浏览器第二轮 **26 passed / 1 failed**，原因是新测试把数组放在演示已有的 F47（“Choose status”）上，实际触发合法 spill 阻挡；改用真实新工作表承载数组，并增加跨表／撤销后溢出格清空断言，没有清除 demo 数据或放宽预期。最终五文件专项 **27/27**（23.8 秒）通过（`/tmp/excel-table-headers-final-e2e.log`）。桌面／窄屏截图检查还修正了说明段落误入双列表单的问题；连续空格切换、焦点保留、Escape 返回入口、无横向溢出均通过。全量 Vitest **5,500/5,500**（339 文件）和根构建通过（`/tmp/excel-table-headers-all-vitest.log`、`/tmp/excel-table-headers-build.log`）；全量 lint 仍在原队列中。演示服务 `http://127.0.0.1:5183/` 返回 200。当前没有新增命令／适配层，新增或修改文件均低于 300 行，续改未提交。

剩余交付边界明确保留：上方占用时应在 Table 列范围内自动腾位，不能改为插整行影响旁边内容；首行无空间与空数据表也需完整原生历史、引用及保存恢复语义。目前这些情形仍会拒绝，因此表头功能与整批未完成，不能用上述正常路径专项替代剩余实现及最后全量 E2E 验收。

本轮验证队列已正常退出 0，全量 lint 通过（`/tmp/excel-table-headers-all-lint.log`）；没有遗留运行中的本地测试，也没有自动提交。

最新阶段检查点（按用户要求提交）：已补首行及上方占用时的局部腾位，只下移 Table 列带内的稀疏单元格和 cellStyle，行高、列宽及旁边数据不移动；复用原引用改写和历史，UI Core 传入实际画布行数防止越界。默认／lite 原生专项各 **28/28**、UI Core 专项 **34/34**、UI Core 构建和 React 类型检查通过。涉及其他 Table、命名区域、筛选、校验／条件格式以及合并／溢出区域的腾位仍在写入前拒绝，空数据表处理也未完成；因此仍是阶段性提交。前述 27/27 E2E 使用局部腾位续改前的构件，不能算作新腾位路径的浏览器验证；最新 WASM lib 回归另行确认。

该阶段已提交推送为 `896bfee8`（提交门禁 Vitest **3,026/3,026**；WASM lib **171 passed / 1 ignored**）。本次续改已解除命名区域的临时拒绝：复用 `NamedRangeShift`，只保留实际变化的坐标，与 Table／单元格在同一事务内回放；名称 epoch 与数组在原发布链路中更新，不增第二次刷新。覆盖完整列带内的移动、跨插入位置的扩长、宽区域／整列／其它表保持原语义、越界原子拒绝，以及不相关名称修改保留／受影响名称修改拒绝撤销。默认原生专项 **34/34**、WASM lib **171 passed / 1 ignored**，两种构件重建通过。

新增真实页面腾位 E2E 及 lite/full 命名数组保存恢复回归。浏览器首轮 **16 passed / 1 failed**：编辑 A4 后虚拟窗口从第 4 行开始，测试直接读取已卸载的 F2；补用名称框定位 F2，保留值应为 8 的断言。最终四文件专项 **17/17**（13.9 秒，`/tmp/excel-header-insert-names-final-e2e.log`）通过，覆盖首行／原表头占用、旁列不动、公式保持动态、名称管理器坐标、撤销重做及两种构件 JSON 恢复。剩余交叉 Table、筛选、校验／条件格式、合并／溢出和空数据表仍未完成；本轮不标记整批验收，不自动提交。全量检查及 lite 原生专项仍沿原队列执行，结果在结束后补记。

上述队列已全部退出 0：默认／lite 原生专项各 **34/34**、全量 Vitest **5,500/5,500**（339 文件）、根构建、全量 lint、E2E lint、文档／边界／循环依赖检查通过。根构建仍有既有 JS chunk 超 500 kB 提示，不是失败；记录见 `/tmp/excel-header-insert-names-{default,lite,vitest,root-build}.log`。服务 `http://127.0.0.1:5183/` 返回 200；本轮新增及修改源文件／测试均低于 300 行，无新增运行时层。没有遗留测试进程，本次续改未提交。

下方 Table 续改：取消同列带内其它 Table 的临时拒绝，按真实稀疏格移动同步保存其范围、计算列模板和汇总定义。复用 Table 原子历史，注册表预检按所有表的最终坐标检查冲突，避免把上表的新范围误判为撞到下表旧位置；校验独立到 `workbook_table_registry_change.rs`，主事务文件降至 268 行。只切中另一张表部分列时仍在写入前拒绝，防止破坏矩形 Table；旁边表及其外部改名不被撤销覆盖。新增回归覆盖相邻多表、汇总公式、模板修改、跨表数组、外部删表拒绝和纯元数据越界。

首轮测试夹具误用了保留函数名 `Lower`，另有 WASM 测试调用漏传 `Some`；均修正为真实有效接口／名称 `LowerOrders`，不改引擎约束。最新默认原生专项及回归合计 **33/33**（`/tmp/excel-header-insert-tables-focused.log`、`/tmp/excel-header-insert-tables-regression.log`），WASM lib **171 passed / 1 ignored**，lite/full 重建通过。新增真实页面相邻表腾位与两构件 JSON 恢复用例已在 Table 全组中通过；完整队列、lite 原生及全量 Vitest／根构建仍沿原进程执行。当前仍未验收整批：筛选、数据验证／条件格式、合并／溢出及空数据表边界待补；没有自动提交。

本轮队列最终均退出 0：Table 浏览器全组 **77/77**（1.3 分钟，`/tmp/excel-header-insert-tables-e2e.log`）、默认／lite 原生各 **33/33**、全量 Vitest **5,500/5,500**（339 文件）、根构建、lint／E2E lint、文档／边界／循环依赖检查通过。未引入新 Worker 命令或前端状态；新增注册表校验文件 45 行，只负责原历史的身份／最终范围检查。演示 `http://127.0.0.1:5183/` 当前 HTTP 200，本轮改动未提交，没有遗留验证进程；继续处理上述未完成边界，不把 Table 全组专项当成全部 41 项验收。

筛选续改：在现有 `sheet_filter_shift.rs` 增加局部插行计算，复用 Table 历史已有的筛选前后像。完整落在腾位列带内的显式筛选范围及已隐藏行随动；跨插入点的范围扩长，新行可见。部分列相交／旁边的筛选维持原矩形与快照，范围规则与 [ClosedXML 的 ShiftRows](https://github.com/ClosedXML/ClosedXML/blob/develop/ClosedXML/Excel/Ranges/XLRangeBase.cs#L1305-L1352)一致；旧整表筛选仅在全列带真正插整行时搬隐藏快照。沿项目既有语义不重新扫描条件，手动隐藏行不动，越界及外部筛选改动在任何写入前拒绝；未增加事务字段、命令或前端状态。

新增 `table_header_insert_filter.rs` 四项原生回归及整表快照位移单测，覆盖快照不是实时筛选、`SUBTOTAL(9/109)` 区分手动隐藏、跨表数组非锚点首次读取、往返历史、越界保留 redo 和外部修改拒绝。首轮专项 **4/4**、WASM lib **171 passed / 1 ignored**；补充极端隐藏行索引的溢出拒绝后，最新 WASM lib 同样通过，两构件重建结束，浏览器新增筛选用例和 lite/full 保存恢复均已通过。Table 全组／排序、默认／lite 原生及全量检查仍沿原队列执行，结束后补记最终结果。数据验证／条件格式、合并／溢出及空数据表仍未交付，整批不记验收，本轮不自动提交。

筛选续改最终验证：所有原进程正常退出 0，默认／lite 各 **21 项集成回归 + 1 项位移单测**通过；最终默认配置单测及筛选专项再次通过，涵盖补充的溢出防护。WASM lib **171 passed / 1 ignored**、两构件重建、Table 全组／排序 E2E **89/89**（1.6 分钟）、全量 Vitest **5,500/5,500**（339 文件）、根构建、lint／E2E lint、类型、文档／边界／循环依赖均通过。日志前缀 `/tmp/excel-header-insert-filter-`；构建仅保留既有 chunk 大小提示。服务 `http://127.0.0.1:5183/` 返回 200，修改未提交，新增／修改源文件及测试均低于 300 行；继续补齐上述剩余边界，不开始下一批。

上述命名区域、其它 Table 和筛选续改已按用户要求提交推送为 `82a7238c`。提交门禁文档／边界／lint／类型检查通过；本次 changed-test 筛选未命中 Vitest 文件，不将其计为重新执行全量测试。

数据验证续改：解除局部腾位对验证规则的临时拒绝。新增 `workbook_table_validation_shift.rs`，只记录变化矩形，沿 Table 原事务保存／回放；列带内部分下移，左右部分保持原位，跨插入行的部分扩长，整列规则保持固定。共享原不可变规则，不逐格扫描，也不对原有值重新进行输入验证；受影响规则被外部修改或恢复范围出现新规则时原子拒绝，无关规则修改保留。新增四项原生回归 **4/4**，覆盖矩形拆分、精确往返、规则共享、其它表不动、范围越界及区域容量限制。

WASM 首轮 **170 passed / 1 failed / 1 ignored**，原因是测试把 Inventory（A:C）的 C 列误当旁列；将验证夹具扩到 D 列，保留旁列不动的断言。复验 **171 passed / 1 ignored**，lite/full 已重建。真实页面新增下拉规则移动／输入拦截／撤销用例，两种构件保存恢复新增拆分规则断言；默认／lite 原生、浏览器及全量检查仍沿原队列执行，结束后补记。当前剩余条件格式、合并／溢出及空数据表边界未完成，整批继续未验收，续改不自动提交。

数据验证续改最终验证：原队列均退出 0，默认／lite 原生各 **37/37**、WASM lib **171 passed / 1 ignored**、数据验证／表头 E2E **49/49**、Table 全组 E2E **79/79**、全量 Vitest **5,500/5,500**（339 文件）通过。根构建、lint／E2E lint、类型、文档／边界／循环依赖检查通过；根构建仅保留既有 chunk 大小提示。日志前缀 `/tmp/excel-header-insert-validation-`。调用链和现有种子均未改动，新增源文件 92 行、测试 126 行，主事务 278 行；演示 `http://127.0.0.1:5183/` 返回 200，无遗留验证进程，续改未提交。下一步继续条件格式区域／公式的局部位移；需保持色阶、排名等规则的统计范围，不能简单拆成独立规则导致计算语义改变。合并／溢出、空数据表及最后整批全量 E2E 仍待完成。

条件格式续改第一步：新增 `workbook_conditional_format_row_band.rs`，沿 `FormulaRuleChange` 原前后像同时记录范围位移和公式改写，没有增加 Table 事务字段。完整位于腾位列带内的有限范围整体下移／跨插入行扩长；整列作用范围固定；本表旁列与其它表的公式消费者只改引用，不移动其作用范围。保留规则 ID、优先级、启停及旧不透明 payload，色阶／排名／数据条仍复用同一条规则的统计 atom。新增原生专项首轮 **5/5**、WASM lib **171 passed / 1 ignored**，两种构件重建通过；随后补充了整列规则不改 revision 时的稀疏成员依赖回归。默认／lite、页面与保存恢复以及全量检查仍沿原队列执行，结束后补记。

这一步不代表条件格式交叉已完成：有限作用范围仅部分列落入腾位带时仍在写入前拒绝。现有 `ConditionalFormatRuleEntry`、WASM scope、UI Core 作用范围与统计读取都仅表达单矩形；下一步必须支持同一条规则的多个区域，保留统一统计域及公式原点，不能拆成独立色阶／排名规则来假装支持。合并／溢出和空数据表也仍未交付，整批继续未验收、未提交。

条件格式多区域续改：原生规则增加可选附加矩形，WASM、UI Core 快照／命令和 React 范围编辑沿同一规则传递，旧单矩形数据保持兼容。局部腾位与数据验证共用矩形位移函数；多个区域仍共用一个统计 atom，保留规则 ID／优先级，以第一区域左上角为公式原点，不把空洞算入色阶、排名或数据条。增加区域不重叠、画布边界及最多 4,096 区域校验，以及连续腾位、撤销／重做、原子拒绝和 lite/full 保存恢复回归。

多区域阶段检查：默认原生 lib **1,654 passed / 3 ignored**、九组集成 **46/46**，UI Core＋React 专项 **38/38**，WASM lib **171 passed / 1 ignored**、两构件重建，Table＋条件格式 E2E **120/120** 通过。1280px／390px 截图已人工检查，范围文本及操作按钮无裁切。提交前发现并修正超长行。最终全量 Vitest **5,505/5,505**（340 文件）、根构建通过；提交门禁文档／边界／lint／类型和受影响测试 **3,012/3,012** 通过。按用户要求提交推送为 `1613217e`。续轮核对 lite 原进程已退出，日志为 lib **1,631 passed / 3 ignored**、九组集成 **46/46**；没有因观察超时重启。日志前缀 `/tmp/excel-cf-multi-`。合并／溢出、空数据表和最终整批验收仍未完成。

合并格续改：完整位于 Table 移动列带内的合并框随内容下移，跨列带／越界／侵入 Table 的合并在写入前拒绝；上方被空合并或 spill 占用时不覆盖它，而是尝试表内腾位。复用 `HistorySnapshot.merges` 和既有批量恢复，改为借用快照避免额外复制；没有增加状态层或命令。原生新增覆盖位移、公式／格式、旁列不动、精确历史及历史外修改。首轮一项源码断言遗漏原渲染器的括号，按实际规范化源码修正；补测另抓到空合并移走后数组展开导致撤销误拒绝，现比较原始源码／合并几何，恢复后重投派生数组。页面首轮 **2 passed / 1 failed** 是断言了已滚出窗口的 A1，补定位后原三项 **3/3**，没有放宽几何断言。最终新增数组交叉、默认／lite、WASM 重建及 Table／合并全组仍在原队列执行，结束后补记；这不是完整批次验收，续改未提交。

合并格最终验证：所有原队列退出 0；默认／lite 七组原生各 **35/35**（含新增五项），WASM lib **171 passed / 1 ignored**、lite/full 重建、Table／合并 E2E **110/110**、全量 Vitest **5,505/5,505**（340 文件）、根构建通过。文档、边界、循环依赖、lint／新增 E2E lint、类型检查均通过；构建仅保留既有 chunk 大小提示。日志前缀 `/tmp/excel-header-merges-final-`。没有新增生产文件；主事务 282 行、插入实现 106 行、新增原生测试 116 行、E2E 127 行，演示 `http://127.0.0.1:5183/` 返回 200，既有种子未改。本次只补当前批次的合并交叉，不宣称移动已有 spill／空数据表或完整 41 项计划完成；没有自动提交，下一步继续这两个剩余边界及最终整批验收。

数组续改：腾位预检从“任意 spill 相交即拒绝”改为按已安装矩形检查，完整落在列带内的数组允许整体下移，切开／侵入 Table／移出画布仍在写入前拒绝。局部结构历史始终保存合并几何（包括空列表），复用批量源码恢复与数组重投；这样当前为标量、移动后因 `ROW()` 展开的公式也能正确撤销，不保存子格计算结果。新增 `table_header_insert_spills.rs` 专项先复现完整数组被拒绝和标量展开后无法撤销；空值夹具从不产生数组的 IF 写法改为明确的一行空字符串数组，并断言真实 shape，保留“空子格仍占空间”要求。

进一步回归复现批量恢复遗漏底层 `set_array` 原始数组值的投影，现沿原恢复入口收集这些锚点，在最终几何上先安装原始数组，再重投公式消费者；无新状态或适配层。新增六项原生专项 **6/6**，覆盖完整数组／旁列数组／跨表消费者、标量展开、越界原子拒绝、空数组占用表头、阻挡物一起移动、原始数组值往返。真实页面已通过，lite/full 保存恢复首轮因把空范围结果预期为数值 0 而失败；改为显示值并增加未腾位的独立工作簿对照，不改引擎既有空值语义。最终默认／lite 扩大原生、两构件及 Table／合并 E2E、全量检查仍沿原队列执行，结束后补记。当前批次仍未验收，空数据表及最终整批全量 E2E 待补；续改未提交。

数组续改阶段结果：最终默认十三组原生 **61/61**、WASM lib **171 passed / 1 ignored**、lite/full 重建、Table／合并 E2E **113/113**、全量 Vitest **5,505/5,505**（340 文件）、根构建通过；边界、循环依赖、lint／新增 E2E lint、类型、文档检查通过。最新日志前缀 `/tmp/excel-header-spills-final-`。同一原生顺序进程已进入 lite 十三组回归，尚未结束，不将默认配置结果冒充 lite 通过，不重启该进程。新增测试为原生 137 行／E2E 121 行，生产插入实现 118 行，无新增生产模块；调用链、原生种子不变，服务 `http://127.0.0.1:5183/` 返回 200。未提交；下一步核对 lite 结果并处理空数据表，整批及完整计划继续未验收。

条件格式单矩形续改最终验证：全部原进程退出 0。默认原生回归 **44/44** 后补跑完整新增专项 **6/6**（含整列 atom 回归），lite 同组 **45/45**；WASM lib **171 passed / 1 ignored**、lite/full 重建、Table＋条件格式 E2E **116/116**、精确样式保存恢复复验 **8/8**、全量 Vitest **5,500/5,500**（339 文件）通过。根构建、lint／E2E lint、类型、文档／边界／循环依赖检查通过，仅保留原有 chunk 大小提示。日志前缀 `/tmp/excel-header-insert-cf-`，演示 `http://127.0.0.1:5183/` 返回 200。新增源文件 46 行、专项 191 行；没有新增运行时状态层、没有遗留验证进程，续改未提交。上述结果只证明当前单矩形路径，不覆盖仍被拒绝的部分列相交，也不关闭当前批次或完整 41 项计划。

本批三项：隔列底色、末列强调、表头显示／隐藏。样式选项参考 [Excel Table 格式说明](https://support.microsoft.com/en-us/excel/format-an-excel-table)；表头开关参考[官方表头说明](https://support.microsoft.com/en-us/excel/turn-excel-table-headers-on-or-off)，必须处理表头原值、引用与筛选，不能用 CSS 隐藏代替原生语义。沿现有 Table 命令、Rust 历史和返回投影实现，不新增适配层。

起步已扩展原生 `TableStyle` 的 `bandedColumns`／`lastColumn` 两个开关，旧配置缺字段默认为关闭。条纹按 Table 起始列计算，与隔行底色独立；首末列强调随实际表范围变化，手动格式与条件格式仍覆盖 Table 默认样式，不向真实格样式逐格写入。新增 `table_style_columns.rs` 专测列条纹、末列随扩表变化、历史、手动覆盖和旧配置兼容；WASM 既有样式保存恢复用例补充两个新字段。专项正在运行，UI 与表头事务尚未实现，不能宣称本批已可交付。

上一批 `ae582ddf` 的 CI 已全部成功，包括 Rust 后续 WASM 与浏览器步骤；本地重复 lite 任务因已有同提交全量 CI 证据、需要释放下一批构建锁而明确结束（退出 143），不是超时重启，也不记录为本地全量通过。

列样式默认配置专项 **10/10** 通过（既有 7 项与新增 3 项，`/tmp/excel-table-column-style-default.log`，原命令退出 0）。lite 与 WASM 样式专项已按顺序启动，尚待结果。新增测试 90 行，样式规则 74 行，沿既有结构实现；文档与 diff 检查通过，修改未提交。

列样式续接 UI：在原 `TableAppearance` 增加两个复选框，仍使用 `useAtomValue/useSetAtom`，复用 `runNativeTablePanelAtom`／`table.change`，没有新增草稿或命令层。UI Core 类型允许旧配置省略新字段，但拒绝非布尔值；组件只显示 Rust 回包，不乐观更新。Summary 的 `CalculatedOrders` 原生种子改为隔列绿色底色、末列加粗，计算公式不变。UI Core／React 专项 **48/48** 通过，默认／lite 原生专项各 **10/10**，WASM 样式专项 **2/2**，两种浏览器构件重建完成。类型、UI Core 构建、展现层边界通过。

浏览器首轮 **23 passed / 1 failed**：`uncheck()` 在异步 Rust 回包之前立即检查受控复选框，测试动作提前报错。改为实际点击后等待未选中断言，原生样式及历史断言全部保留；同组复验 **24/24**（20.2 秒）通过（`/tmp/excel-table-column-style-final-e2e.log`），含新列样式、既有样式与计算列回归及 lite/full 新旧配置持久化。已检查 1280／390 像素截图，控件无横向溢出，键盘空格切换及 Escape 焦点恢复通过；沿用现有语义颜色与布局，没有重设计。表头事务仍未实现、完整批次门禁尚未运行，本批继续未验收、未提交。

### Excel Table 计算列（已验收）

最终验收对应 `ae582ddf`：空列输入公式自动填列、修改统一计算列公式整列更新、向下扩展继承公式三项完成。UI Core 验证单次输入／单次原生投影，React 验证多格显示及拒绝保留草稿，真实 Worker E2E 验证三项入口、原生种子、例外、清空及历史；lite/full 二进制覆盖保存恢复、保护策略和结构变化。完整 Vitest **5,492/5,492**、E2E **789/789**、根构建、类型、lint、展现层边界、循环依赖及文档检查通过，WASM lib **167 passed / 1 ignored**。当前提交 [CI Rust 任务](https://github.com/allroad88888888/einfach-excel/actions/runs/38142669309/job/114479550437) 的 core、excel-core 默认与 lite 三项完整 `cargo test --locked` 步骤均已结束且为 `success`；Node 22.12／24 任务也已成功。CI 后续 benchmark／WASM 步骤与本地 lite 原进程仍在运行，不宣称整条 CI 或本地队列已完成。本地默认全量 **3,341 passed / 10 ignored**。演示 `http://127.0.0.1:5183/` 当前 HTTP 200；Summary `A46:C49` 可测试计算列，初值 `C47:C49 = 10,40,90`。该验收不关闭 #32 或完整 41 项计划；下方为阶段历史记录，曾经的“未提交／未验收”不代表最终状态。

本批只做三项：空数据列输入公式后自动填满该列、修改计算列公式后整列更新、Table 向下扩展时继承计算列公式。行为依据 [Excel 网页版计算列说明](https://support.microsoft.com/en-us/excel/use-calculated-columns-in-a-table-in-excel-for-the-web)：列里已有其他普通数据时不自动覆盖。例外值、相对／绝对与结构化引用、撤销重做、数据验证、保护、结构变化和保存恢复都属于本批交叉验证，不另起 TS 公式实现。

起步阶段落地 Rust 定义与保存恢复契约：`TableColumnFormula` 保存标准公式文本及行原点，实际格值继续由现有 atom 求值；Table 注册表持有按列对齐的可选定义，WASM 沿已有 Table JSON 携带。旧文件缺少字段仍表示普通列；无效公式、越界原点和错位列映射拒绝，不先修改注册表。首轮测试暴露测试预期遗漏原生 renderer 的规范化括号，保留同一公式算法并修正精确预期。最终定义专项默认／lite 各 **4/4**，WASM lib **160 passed / 1 ignored** 通过，原进程均退出 0；日志为 `/tmp/excel-table-calculated-definition-fixed.log`、`/tmp/excel-table-calculated-definition-lite.log`、`/tmp/excel-table-calculated-wire-fixed.log`。该阶段新增三个源码／测试文件均不超过 60 行，文档及 diff 检查通过。

后续已接入现有 Rust 输入历史事务：空列公式填充、无例外计算列的整列更新、向下输入扩表时的新行继承。复用 Table 历史，失败回滚公式、输入及表范围；保留手工例外和已有数据。整列先移除旧依赖，再安装全部公式，最后校验最终值，避免旧依赖造成误报循环或中间值误触数据验证。没有新增 Worker 命令或前端公式镜像。

阶段验证：加入最终值校验后的专项默认／lite 各 **31/31** 通过（`/tmp/excel-calculated-values-final.log`、`/tmp/excel-calculated-values-lite.log`）。随后补充清除旧依赖及依赖方向反转用例，默认／lite 各 **32/32** 已通过（`/tmp/excel-calculated-transaction-final.log`、`/tmp/excel-calculated-transaction-lite.log`）；其中 14 项输入、11 项扩表、7 项样式。WASM lib **160 passed / 1 ignored** 通过（`/tmp/excel-calculated-transaction-wasm.log`）。

按用户要求提交推送上述阶段为 `45e37732`，不作为整批验收。续做引用随动：计算列模板纳入既有 `FormulaSourceChange`，Table 自身模板并入原有定义前后像，其他 Table 模板保留实际源码差异。表／列／名称改名、缩掉被引用列及转普通区域均同步改写模板，沿用同一次撤销；即使所有格都变成手工例外，也不丢失模板随动。上下文归属与公式行原点分开传入原改写器，避免缩表后把转换出的 A1 行号写错。没有新增 Worker 命令、JS 公式逻辑或运行时层。

引用专项首轮 **48/48** 通过（`/tmp/excel-calculated-references-default.log`）；随后补充行原点、缩表上下文及只剩表头时的模板改名，最新默认／lite 各 **51/51** 通过，顺序进程退出 0（`/tmp/excel-calculated-references-empty-default.log`、`/tmp/excel-calculated-references-empty-lite.log`）。其中 8 项模板专项、14 项输入专项，另有名称／Table 改名、列改名、范围调整和转换历史回归。WASM 新增真实输入绑定→改名→JSON 保存恢复→新行继承→整列更新用例，最新 lib **161 passed / 1 ignored** 通过（`/tmp/excel-calculated-references-persistence-wasm.log`）。文档、展现层边界、diff 检查通过，新增／大改文件均低于 300 行。这不是浏览器 WASM 构件/E2E 证据；引用续改尚未提交。

工作表拓扑续改已接入：模板继续用同一源码差异记录，改名/删除/归档恢复都随现有操作原子提交；普通删除使静态工作表引用成为 `#REF!`，撤销新增则保留悬空源码。按工作表稳定身份校验，删除前面的表导致索引移动不影响恢复；撤销改名不误改原先悬空的新表名引用，模板被外部改动时在写入前拒绝。没有新增运行时或单元格扫描；所有本轮新增／修改源码均低于 300 行。

拓扑首轮默认 **39/39** 通过；补充归档恢复拒绝原子性后，最新默认／lite 各 **40/40** 通过，顺序进程退出 0（`/tmp/excel-calculated-topology-final-default.log`、`/tmp/excel-calculated-topology-final-lite.log`），包含 9 项计算列拓扑专项及既有引用、转换、工作表历史/归档回归。最新 WASM lib **162 passed / 1 ignored** 通过（`/tmp/excel-calculated-topology-wasm.log`），新增真实工作表绑定→删除→保存恢复后新行保持错误→原会话撤销后恢复继承用例。文档、边界、diff 检查通过。续改未提交，仍不是本批浏览器交互验收。

行列结构续改已接入：Table 定义位移集中在 `workbook_table_shift.rs`，本表模板按实际列坐标保留/删除，局部与限定引用复用原有结构 AST 改写。原点行删除时从存活行保留标准公式，数据区全删也不丢定义；画布边缘及原点在缩表范围外的情况已有专项。更换原点用原复制算法做往返检查，避免把中间越界永久固化成 `#REF!`。跨表只保留实际改变的模板源码差异，仍进现有结构历史；只有模板变化时跳过空单元格恢复，不拆装无关数组。

结构首轮 **38/38**、跨表模板 **4/4**、补边界后的默认 **52/52** 通过；加入原点往返保护后的最新默认／lite 各 **53/53** 通过，顺序进程退出 0（`/tmp/excel-calculated-structural-origin-default.log`、`/tmp/excel-calculated-structural-origin-lite.log`）。其中 11 项本表模板、4 项跨表模板及既有结构历史/预检/Table 位移回归。最新 WASM lib **163 passed / 1 ignored** 通过（`/tmp/excel-calculated-structural-wasm.log`），新增真实插列→删除原点行→保存恢复→新行继承/撤销用例。文档、边界、diff 检查通过。新增源码 99 行、两个结构测试文件均低于 300 行；既有结构历史文件由 304 行增至 313 行，仅补必要字段、预检和回放，不扩大重构。尚未提交，不能据此记为本批浏览器验收。

右侧公式扩列已复用计算列预检与填充事务：表头、范围和整列公式共用一条历史，失败整体回滚并保留 redo；已有数据、文本格式、保护及汇总行保持原有边界。向下扩表时，显式输入公式的数据验证延后到本行计算列全部继承之后，避免用中间空值误判；合并历史仍检查 32 MiB 预算。

该续改默认／lite 配置相关测试各 **41/41**、最新测试设置断言专项 **9/9** 通过；WASM lib **164 passed / 1 ignored** 通过（`/tmp/excel-calculated-expand-final-default.log`、`/tmp/excel-calculated-expand-final-lite.log`、`/tmp/excel-calculated-expand-setup-default.log`、`/tmp/excel-calculated-expand-final-wasm.log`）。上述引用、结构及扩列阶段已按用户要求提交推送为 `7b6f57a1`，工作区当时干净，不作为整批验收。

临时 spill 风险已复现：显式输入 `IF(B4=0,SEQUENCE(2),B4+1)` 被未继承的 B4 空值误导，最终应为 11 却提前拒绝。计算列及新行继承现复用现有惰性批量安装，等全部源码落地后检查最终循环、数组与数据验证；真正的数组及新增循环仍整体拒绝。回归又发现历史逐格恢复会让重做产生 `#SPILL!`，因此同一快照公式改为统一装载后投影，保留错误／循环源码及跨表数组随动，没有增加公式引擎或前端状态层。

该轮默认／lite 相关测试各 **63/63** 通过，顺序进程退出 0，包含 15 项计算列输入、5 项新行校验及既有扩列、扩表、剪贴板和工作簿历史回归（`/tmp/excel-table-final-spill-history-default.log`、`/tmp/excel-table-final-spill-history-lite.log`）。WASM lib **165 passed / 1 ignored** 通过（`/tmp/excel-table-final-spill-wasm.log`），包含真实绑定输入、重做及 JSON 恢复后新增行的条件公式用例；这不是浏览器构件验证。文档、展现层边界与 diff 检查通过，该轮修改的源码／测试文件均低于 300 行，未新增层或文件。修改未提交。

手动扩表继承已接入既有 Resize 命令：只填新数据区的空格，保留已有值／公式；汇总行搬走后原位置按数据行填充。复用批量公式安装，最后统一验证；失败恢复公式、汇总和表范围，保留 redo 且不发布中间通知。成功后把重叠的旧汇总快照及新数据区内的引用改写并入同一份局部历史，避免两份历史争写同一格；超预算在几何修改前拒绝。新增 `workbook_table_resize_inheritance.rs` 83 行，专门负责手动扩表继承事务，没有增加 Worker 命令或前端数据层。

手动继承的默认／lite 配置相关测试各 **46/46** 通过，顺序进程退出 0：9 项新增专项及既有范围历史、计算列输入／右侧扩列／引用随动回归（`/tmp/excel-table-manual-inheritance-final-default.log`、`/tmp/excel-table-manual-inheritance-final-lite.log`）。WASM lib **166 passed / 1 ignored** 通过（`/tmp/excel-table-manual-inheritance-wasm.log`），新增 JSON 恢复后的真实 resize 绑定→新行公式→单步撤销／重做用例。修改未提交，仍不是浏览器交互验收。

结构插行继承已接入：只为实际插入 Table 数据区的新行生成标准公式；表头之前及表尾之后不擅自扩表。多个 Table 先共同装载再校验，沿既有结构快照回滚；直接 Rust 结构入口与带历史入口语义一致。预算在位移前预检，条件格式保留失败回滚所需的 revision。按快照职责拆出 `workbook_structural_snapshot.rs`（55 行），结构历史文件从既有 313 行降到 278 行；新行公式计划为独立 47 行文件。

首轮测试发现撤销遗漏未改源码的跨表 Table 数组消费者，现由既有 Store 依赖重投，并延后直接订阅到最终值。接入过程中又发现范围依赖函数逐格枚举整个结构带；已停止确认为该问题运行的旧进程，改为筛选现有 atom，未因观察超时重跑。新增稀疏根查询与逐格查询的等价测试，含空 facade、几种范围依赖层及整表不分配 atom；默认／lite 各 **7/7** 通过（`/tmp/excel-sparse-range-roots-default.log`、`/tmp/excel-sparse-range-roots-lite.log`）。

该阶段默认／lite 配置结构相关回归各 **62/62** 通过，其中 9 项插行继承专项覆盖多行、汇总、相对／绝对引用、多个 Table、拒绝原子性、订阅次数及预算（`/tmp/excel-table-insert-sparse-fixed-default.log`、`/tmp/excel-table-insert-sparse-fixed-lite.log`）。该阶段 WASM lib **167 passed / 1 ignored** 通过（`/tmp/excel-table-insert-sparse-fixed-wasm.log`），含真实结构绑定、撤销重做、JSON 恢复后继续新增记录。文档、展现层边界与 diff 检查通过，新增／大改源码与测试均低于 300 行。

提交检查点：按用户要求保存当前改动，不宣告整批验收。随后新增的“已有计算列公式下移后转入数组分支”回归仍失败：最新默认插行专项 **9 passed / 1 failed**（`/tmp/excel-table-shift-array-default.log`），后续组及 lite 未执行。当前新增 spill 索引检查尚未解决该问题，不能沿用前述通过结果证明最终源码通过；既有 369 行 `sheet_spill_claims.rs` 仅扩大读取方法的模块可见性，没有顺带拆分。

上述检查点已提交并推送为 `1b658c97`。后续修复了插行数组分支漏检：原来返回标量的公式没有 spill 记录，仅检查索引无法发现它位移后的数组结果。现在在新公式共同落地后，筛选受影响 Table 内已有的稀疏公式候选，复用原生数组投影再验证；不遍历空格、不建立新公式引擎。默认／lite 专项各 **34/34** 通过（`/tmp/excel-table-shift-array-final-default.log`、`/tmp/excel-table-shift-array-final-lite.log`），包含原先失败的活动／阻挡数组两种分支。WASM lib **167 passed / 1 ignored** 复验通过（`/tmp/excel-table-shift-array-final-wasm.log`）。

新增 UI Core 输入传输测试与 React 多格显示测试，使用固定原生响应，不在假件中计算公式。覆盖建列、整列更新、新行继承的一次输入／一次返回投影，以及拒绝后保留草稿、旧值和 revision。相关 Vitest **49/49** 通过（`/tmp/excel-calculated-column-ui-final.log`）；类型、相关 lint、UI Core 构建、文档及展现层边界检查通过。按单一职责规范分别放置传输、DOM、浏览器测试，新增／改动文件均低于 300 行，没有修改生产 TS 调用链。

lite/full 构件已从当前源码重建，顺序构建退出 0（`/tmp/excel-calculated-columns-wasm-build.log`）。新增持久计算列 E2E 与既有输入扩表交叉专项 **8/8**（10.5 秒）通过（`/tmp/excel-calculated-columns-e2e.log`），真实 Vite Worker 验证中间行输入填满上下、整列更新、向下继承及整条撤销重做；不是模拟后端。Rust 默认→lite 完整回归已启动（`/tmp/excel-calculated-columns-all-default.log`、`/tmp/excel-calculated-columns-all-lite.log`），尚未记为完成，不重复启动。

演示种子现为 Summary `A46:C49` 的 `CalculatedOrders`，`C47:C49` 为 10、40、90，`B6` 合计 140。启动声明只给列公式，建表后调用已有 Rust 单格输入建立标准公式并填列，随后统一清空启动历史；不在 React 计算逐行公式。定义快照校验并冻结声明，原生拒绝会沿既有启动错误路径返回。初始化协议复用同一 Table 类型，未新增 RPC；既有 `commands.ts` 331 行仅小改，未顺带拆分。

种子、例外保留、结构插行及输入扩表专项 **11/11** 通过。首次跨范围／汇总交叉为 **18/23**：新示例原放在 A88，确实占用了旧示例扩表目的地，5 项失败；已移动种子到独立区域，保留原有行为与断言，最新同组 **23/23**（23.0 秒）通过（`/tmp/excel-calculated-cross-final-e2e.log`）。其中 lite/full 真实构件均验证 JSON 恢复后继承、手动 resize、结构插行、保护策略禁止批量副作用，以及已移动公式进入活动／阻挡数组分支时持久状态和历史完全不变。这是二进制边界验证，不代表页面已有保存／保护入口。

全量 Vitest **5,491/5,491**（339 文件）通过（`/tmp/excel-calculated-all-vitest.log`）；种子移位后又启动最终复验（`/tmp/excel-calculated-final-all-vitest.log`）。根构建通过（`/tmp/excel-calculated-build.log`），JS 593.92 kB（gzip 168.80 kB），WASM lite 3049.59 kB；类型与相关 lint 通过。完整 E2E 已启动（`/tmp/excel-calculated-all-e2e.log`），与前述完整 Rust 默认→lite 回归一起等待最终结果；保持生产源码及 WASM 冻结，不并行重建。仍待全量回归与最终门禁收尾，本轮续改未提交，不把专项通过当成整批完成。

最终种子位置下的全量 Vitest 复验 **5,491/5,491**（339 文件，64.08 秒）通过，进程退出 0。完整 lint、展现层边界、循环依赖（718 模块、2022 依赖）、文档与差异检查通过。完整浏览器回归确认为 **784 项**，仍与 Rust 双配置回归沿用原进程继续，尚不能记为通过。

完整浏览器回归现已 **784/784**（11.4 分钟）通过，原进程退出 0（`/tmp/excel-calculated-all-e2e.log`）。运行期间生产源码与 WASM 未再变更，既有功能与新增计算列／种子／双构件持久化用例全部通过；没有跳过或放宽失败断言。当前仅剩完整 Rust 默认／lite 回归的最终结果待验收：默认配置仍在原进程运行，未据阶段通过数宣称整个命令完成。当前续改未提交，不能提前进入下一批或关闭完整 41 项计划。

收尾复查又补出清空场景：真实浏览器与原生回归均复现整列清空后再输入只修改当前格（`/tmp/excel-calculated-cleared-repro.log`、`/tmp/excel-calculated-cleared-native-repro.log`）。旧标准公式把全空列误判为局部缺项，现只放宽 `occupied == 0`，部分清空仍保留例外。随后原生回归还复现单格回退分支绕过 Table 数组限制（`/tmp/excel-calculated-fallback-array-repro.log`）；现复用既有表归属查询及单格历史事务检查实际／阻挡 spill，失败沿原事务回滚，没有新增命令或包装层。新增 `table_calculated_clear.rs` 独立覆盖整列清空、逐格清空、局部空洞、保护策略、活动／阻挡数组及历史恢复，86 行；浏览器补 3 项清空交叉用例。

因此上一段 784 项通过属于清空修复前的源码，不再作为最终版本验收。原完整 Rust 队列在确认缺陷后已明确终止（退出 143），不是因观察超时重启；修复后的双配置专项正在运行（`/tmp/excel-calculated-cleared-final-default.log`、`/tmp/excel-calculated-cleared-final-lite.log`）。WASM lib **167 passed / 1 ignored** 复验与 lite/full 重建通过（`/tmp/excel-calculated-cleared-wasm.log`、`/tmp/excel-calculated-cleared-wasm-build.log`）；真实浏览器清空／计算列交叉仍在复验，最终全量需重新取得证据。继续保持本批未验收、未提交。

提交前补充：清空修复的原生专项已通过，但新增订阅断言又复现拒绝数组输入会发出 6 次临时通知。现复用既有通知暂停与 Store batch，将求值、检查及回滚放在同一批次，恢复订阅前完成回滚；本表和跨表订阅均断言零通知。`table_calculated_clear.rs` 最终为 97 行。最新默认／lite 专项各 **39/39** 通过，顺序命令退出 0（`/tmp/excel-calculated-clear-observers-default.log`、`/tmp/excel-calculated-clear-observers-lite.log`）；WASM lib **167 passed / 1 ignored** 与 lite/full 构件重建通过。界面补充明确的 Table 数组输入错误提示，相关反馈及 React 测试 **10/10** 通过。此次按用户要求提交检查点，最终版本的完整 Rust、Vitest 和 E2E 尚未重新验收，不沿用修复前全量结果宣告完成。

提交前真实浏览器专项 **20/20** 通过（`/tmp/excel-calculated-precommit-final-e2e.log`），包含清空、计算列、双构件持久化及输入扩表。前次并行启动误共享 Playwright 端口和产物目录，出现端口占用及 trace 文件丢失；已将四个测试文件放在同一命令串行复测，没有改动产品或放宽断言。

上述检查点已按用户要求提交推送为 `9e9e5a03`，提交门禁 **2,153/2,153** 通过。继续收尾时，当前提交的根构建、类型与循环依赖检查通过，全量 Vitest **5,492/5,492**（339 文件，30.27 秒）通过（`/tmp/excel-calculated-9e9e-build.log`、`/tmp/excel-calculated-9e9e-vitest.log`、`/tmp/excel-calculated-9e9e-cycles.log`）。完整 **787 项** E2E 已在同一验证队列开始（`/tmp/excel-calculated-9e9e-e2e.log`）；同提交 [CI](https://github.com/allroad88888888/einfach-excel/actions/runs/38138425481) 的 Rust 双配置全量仍在运行，尚未记录通过。保持生产源码和 WASM 冻结，不开启下一批；此续补记录未提交。

完整回归实际结果为 **785 passed / 2 failed**（10.9 分钟），不是全绿：lite/full 的命名区域保存恢复测试在修改源值后，标量 SUM 已更新但跨表溢出格仍为旧值。进度检查只读日志尾部曾漏掉中段失败，最终以整条命令退出 1 及完整报告为准。原生新增 `single_cell_history_input_reprojects_named_arrays_and_their_consumers` 同样复现 20 未更新为 40。原因是上次 Table 拒绝事务把普通输入也包进 Store batch，原数组投影在批次传播前运行；现恢复普通输入原路径，Table 单格事务在 batch 结束后复用现有受影响数组重投，再恢复订阅。原生回归覆盖普通／Table 源格及撤销重做，浏览器原持久化断言全部保留并增加 Table 情形，尚待修复后复验。首次编译暴露已有数组候选方法的模块可见性不足，仅扩为 crate 内可用，没有新增包装层。

`9e9e5a03` 的 CI、docs、Publish 已全部成功（Rust 完整日志 `/tmp/excel-calculated-9e9e-ci-rust.log`），但原 CI 没有覆盖此次浏览器发现的缺陷，不能替代新增回归。当前修复未提交；完整 E2E 与原生全量需要在最终源码上重新验收，不开启下一批。

后续原生回归进一步发现外层历史恢复 batch 使撤销投影过早，原值 20 未恢复、仍显示 40（`/tmp/excel-input-named-array-final-default.log`）。修复沿用原多快照恢复入口：恢复前只收集受影响数组，最外层批次结束后重投，再恢复直接订阅；不逐格重算全表、不增加命令或状态层。浏览器持久化用例追加普通／Table 两种源格的输入撤销重做断言。最终交叉 E2E **24/24**（23.1 秒）通过（`/tmp/excel-input-named-array-history-e2e.log`），默认原生专项 **32/32** 通过、lite 专项仍在原顺序进程中；WASM lib **167 passed / 1 ignored** 与两种构件重建通过。最终根构建通过，其余完整回归仍待收尾。修复新增／改动源码与测试均低于 300 行，没有新增文件或抽象层。

上次已提交源码的 CI 日志计数为默认 **3,340 passed / 10 ignored**、lite **3,300 passed / 10 ignored**、核心 **64/64**、WASM Chrome **7/7**；这些只证明 `9e9e5a03`，不代替当前未提交修复的全量验证。

当前修复的默认／lite 原生专项均 **32/32**，顺序命令退出 0；全量 Vitest 再次 **5,492/5,492**（339 文件，37.16 秒）通过（`/tmp/excel-input-named-array-history-vitest.log`）。最终 **789 项**完整 E2E 已启动（`/tmp/excel-input-named-array-final-all-e2e.log`），当前源码的 Rust 默认→lite 全量也已启动（`/tmp/excel-input-named-array-final-all-default.log`、`/tmp/excel-input-named-array-final-all-lite.log`）。这是修复后的新验收队列，前次已完成且失败的浏览器进程不再使用；验证期间冻结源码和 WASM，仍不宣告本批完成、不进入下一批、不自动提交。

修复后的完整 E2E 最终 **789/789**（11.4 分钟）通过，原命令退出 0（`/tmp/excel-input-named-array-final-all-e2e.log`）。包含上次失败的命名区域持久化场景及新增 Table 源格、输入撤销重做，共四种 lite/full 组合；其余计算列、格式、剪贴板与历史回归也全部通过，没有跳过或放宽断言。期间生产源码及 WASM 未修改。当前仅剩修复后 Rust 默认→lite 全量的完整结果待验收，默认仍在原进程继续执行集成测试，未记录整条命令通过；本批未完成、修复未提交。演示服务 `http://127.0.0.1:5183/` 已确认 HTTP 200。

当前数组刷新修复已按用户要求提交推送为 `ae582ddf`；提交门禁的文档、展现层边界、lint 与类型检查通过，相关 Vitest 筛选未匹配测试，不作为新增测试通过证据，仍以上述全量 5,492 项和 E2E 789 项为准。修复后 Rust 默认配置全量现已结束，累计 **3,341 passed / 10 ignored**（235 个结果组，含 doc-tests）；原顺序命令已进入 lite 编译，证明默认命令退出 0。日志为 `/tmp/excel-input-named-array-final-all-default.log`；lite 最终结果及当前提交的 [CI](https://github.com/allroad88888888/einfach-excel/actions/runs/38142669309) 仍待核对，本批暂不标记验收完成。

### Excel Table 样式（已验收）

最终验收覆盖本批三项：预设、隔行底色、首列强调。完整 E2E **776/776**、Vitest **5,481/5,481** 通过；同一提交 `9129aee7` 的 [CI Rust 任务](https://github.com/allroad88888888/einfach-excel/actions/runs/38131379102/job/114446243802) 中 `einfach-core`、`excel-core` 默认配置与 lite 配置三项完整 `cargo test --locked` 步骤均已完成且为 `success`，作为本批 Rust 双配置验收证据。根构建、类型、lint、边界、循环依赖、文档、WASM lib 与双构件验证见下。本机较慢的原 Rust 顺序任务继续运行，不能声称本地已结束；CI 后续 benchmark 编译及 WASM 步骤仍在执行，也不声称整个 CI 已全绿。此验收不关闭整个 #32 或完整计划。下文保留阶段记录。

CI 最终已全绿：Node 22.12／24、Rust 三个任务均成功。Rust 日志核对默认配置 **3,254 passed / 10 ignored**、lite **3,214 passed / 10 ignored**；einfach-core **64/64**，benchmark 编译通过，WASM 原生 **158 passed / 1 ignored**，Chrome WASM 测试 **7/7**。完整日志留在 `/tmp/excel-table-style-ci-rust.log`；此最终结果覆盖下面“CI 仍在运行”的阶段记录。

`26561017` 保存了样式基础代码；本轮继续且只做三项：选择预设、隔行底色、首列强调。现已接入 Tables 面板、原生历史和持久化，Summary 的 DemoTable 使用蓝色预设。样式仅保存预设与开关，可见窗口里叠加；显式 cell/row/column 属性优先，条件格式最后覆盖。转普通区域才把外观写入普通 cellStyle，沿用 32 MiB 撤销预算，超限在写入前拒绝。复制及格式刷共用原生剪贴板冻结样式，不把条件格式固化。

发现并修复两个集成问题：恢复原三参 `set_cell_input` 签名，新增受保护输入入口，共用同一 Rust 历史；API 快照只增补新入口和漏记的 `change_table`。稀疏格式随已有 `bulk_import_cells` 直接在 Rust 装载，不将缺省颜色写成清空，不经过交互命令的邻格边框同步，也不新增历史；删除 Worker 的额外格式写入。原生样式专项、WASM、Vitest 与真实浏览器回归正在进行；首轮浏览器失败及修复记录保留在 `/tmp/excel-table-style-e2e.log`。下方 766 项 E2E 与 5,476 项 Vitest 是上一批验收记录，不能代替本批验收。本轮未提交，不关闭 #32 或完整计划。

阶段验证：原生样式专项 **7/7**，包含公式求值计数不增加的断言（`/tmp/excel-table-style-focus-final.log`）；WASM lib **158 passed / 1 ignored**、lite/full 构建通过。Table 交叉 E2E **45/45**，包含真实 lite/full JSON 保存恢复与桌面／390px 控件测试。最新完整 Vitest **337 文件 / 5,481 项**、React 独立测试 **83 文件 / 371 项**、根构建、React 独立构建、UI Core 构建、类型、lint、循环依赖和文档门禁通过。共享视觉脚本本机缺失，使用持久 Playwright 截图及溢出／焦点／对比度检查；已查看 390px 面板和桌面表格截图。新增文件均低于 300 行，现有 `rust-workbook/commands.ts` 超限只做必要类型增补，不扩大重构。

完整首轮 E2E 已结束：**772 passed / 2 failed**，退出 1（`/tmp/excel-table-style-full-e2e.log`）。边框失败稳定复现：交互 patch 的四边替换会清掉已导入邻格的共边；改为上述原生直接导入，新增 lite/full 原生格式导入 E2E。横向公式拖动失败的 trace 明确记录操作中的 Vite HMR、重连和选区重置，源码修改干扰了测试；单独重跑通过，后续冻结源码再跑，不能靠删除断言或放宽超时通过。两项复现日志为 `/tmp/excel-table-style-repro.log`，原失败 trace 保留在默认 `test-results`，复跑使用独立输出目录。

本次按用户要求提交保存上述实现与修复，覆盖前文“本轮未提交”的阶段状态，仍未验收。修复后的专项 E2E **35/35**、两项失败场景各十轮复测合计 **20/20** 通过；最新完整 Vitest **5,481/5,481**、WASM lib **158 passed / 1 ignored**、双构件、根构建、lint、展现层边界、循环依赖及文档检查通过。

上述代码已提交推送为 `9129aee7`，提交门禁 **255 文件 / 3,043 项**通过。续跑核对了桌面及 390px 的面板／表格截图，控件无横向溢出，样式与键盘操作留证一致；演示服务 `http://127.0.0.1:5183/` 返回 200。[该提交 CI](https://github.com/allroad88888888/einfach-excel/actions/runs/38131379102) 的 Node 22.12／24 两个构建与测试任务均已成功，Rust 任务仍在运行，不能记为完整 CI 全绿。上一提交 CI 的失败点确认为原三参 WASM 接口签名变化，与本轮已修复问题一致。

完整 E2E 最终 **776/776 passed**（11.1 分钟，`/tmp/excel-table-style-final-e2e.log`），原顺序任务退出 0；包含前述两个失败场景及新增 lite/full 导入格式用例，未删断言、未放宽超时。

本地 Rust 全量 default/lite 顺序回归（`/tmp/excel-table-style-all-core.log`、`/tmp/excel-table-style-all-lite.log`）尚在运行，不重启；本批已由上方同一提交的云端完整双配置结果验收，并非用库内或中途通过替代全量结果。后续改动不得把这份旧构建的运行结果记为新批次证据。

### Excel Table 范围与输入扩展（已验收）

最终验收：完整 E2E **766/766 passed**，原顺序进程退出 0（`/tmp/excel-table-auto-final-e2e.log`，10.9 分钟）；完整 Vitest **337 文件 / 5,476 项**、根构建、类型、lint、循环依赖、架构及文档门禁通过。UI Core 独立构建、React 独立类型检查／构建、React Vitest **83 文件 / 370 项**也通过。原生 default **1,676 passed / 3 ignored**、lite **1,653 passed / 3 ignored**，补充边界专项双配置各 **11/11**；WASM lib **155 passed / 1 ignored**、lite/full 构建通过。验收仍只覆盖下方声明的三项及交互边界，不能据此关闭整个 #32 或完整 41 项计划。自动扩展和新测试尚未提交，下文保留阶段记录。

本批三项：手动调整 Table 范围、紧邻数据区下方输入自动加行、紧邻右侧输入自动加列。复用 Summary 的 DemoTable；自动加行先隐藏汇总行。Table 样式、计算列填充、粘贴扩展、Tab 插入数据行不混入本批，仍保留在 #32 后续范围中。

手动调整已随 `be851c29` 提交推送：相交范围与原表头行检查、列身份保留、移除列引用变为显式 `#REF!`、汇总内容搬移及原生单步历史。新增真实 E2E **6/6** 通过（`/tmp/excel-table-resize-e2e-fixed.log`），覆盖跨表数组、undo/redo、无效范围与占用保护、1280px/390px 键盘入口及截图。初轮测试误选了已有 SKU 数据的第 86 行，Rust 正确拒绝覆盖；成功路径改用确认空白的第 88 行，同时保留第 86 行拒绝用例，没有删除保护。

自动输入链仍是 `编辑 command atom → 既有 set_cell_input → Rust 输入历史 → 原投影`。新增原生 `workbook_table_input.rs` 只负责输入扩展：复用范围预检，表定义先进入同一 batch，再执行既有输入解析/校验，局部输入与新表头一起进入 `TableDefinitionChange`，失败回滚且保留 redo。没有新增 Worker 消息、前端 Table 镜像或第二次刷新。首轮原生专项 **16/16**、WASM lib **155 passed / 1 ignored**、lite/full WASM 构建通过；补充拒绝通知、汇总边界与真实编辑器 E2E 后继续验证，不能以首轮结果宣称本批完成。

边界明确：空输入不扩展；右下角斜邻不扩展；已有另一张 Table 或两张 Table 同时邻接时不猜归属。当前有汇总行时仅支持右侧自动扩列，汇总行下方作为普通输入，不自动移动汇总行；此边界有专项测试，完整 Excel 汇总行新增数据交互（例如 Tab）尚未验收。基本的下方/右侧扩展与手动范围约束参考 [Microsoft 文档](https://support.microsoft.com/en-gb/excel/resize-a-table-by-adding-or-removing-rows-and-columns-in-excel?nochrome=true)，不把该文未明确的汇总行细节当成已验证一致性。

阶段结果：Table 交叉 E2E **30/30**（`/tmp/excel-table-auto-e2e.log`）、完整 Vitest **337 文件 / 5,474 项**、根构建及门禁通过。随后审查补上保护表策略：UI Core 随原输入请求传 `expandTables: false`，Rust 保持普通输入但不写相邻表头或改变范围；这不是第二条 Worker 命令。保护专项 **28/28** 通过。相邻合并格或另一张 Table 阻止扩展时，同样退回合法的普通输入，不让自动行为阻止编辑。

当前状态：范围手动调整已提交；自动扩展与新增 E2E 尚未提交。最新源码的原生 default/lite、WASM lib、lite/full 构建、根构建、完整 Vitest、lint、循环依赖、文档及完整 E2E 正在顺序验证，日志前缀 `/tmp/excel-table-auto-final-`。未完成前不验收、不进入下一批。桌面／窄屏截图已人工检查；共享视觉检查脚本本机缺失，改用持久 E2E 验证对比度、无横向溢出、焦点和页面错误。

最新门禁进度：WASM lib **155 passed / 1 ignored**、lite/full WASM 构建、根构建、完整 Vitest **337 文件 / 5,476 项**、lint、循环依赖、架构及文档检查通过。完整 **766 项 E2E** 已启动（`/tmp/excel-table-auto-final-e2e.log`），原生 lite 回归仍在执行；进程未结束，不能记为本批验收。

原生最终回归已结束：default **1,676 passed / 3 ignored**、lite **1,653 passed / 3 ignored**，均退出 0。随后只补测试，生产源码与 WASM 未变：两张 Table 同时邻接以及 Excel 最后一行／列边界，扩展专项双配置各 **11/11**（`/tmp/excel-table-auto-boundary-fixed-default.log`、`/tmp/excel-table-auto-boundary-fixed-lite.log`）。首轮新增用例误用函数保留名 `Left`，改为 `LeftTable` 后通过，保留同一条歧义断言。最新 1280px／390px 键盘、对比度、溢出和页面错误检查 **2/2**（`/tmp/excel-table-resize-visual-final.log`），对应截图已人工检查。交互式浏览器补验尝试未成功：浏览器连接器不可用，Chrome 原生入口返回 `cgWindowNotFound`；不把此次尝试记为手动交互通过，真实浏览器自动化证据来自上述 Playwright 用例。

### Excel Table 列名与定位（已验收）

最终验收：完整 E2E **755/755 passed**，顺序任务退出 0（`/tmp/excel-outline-final-full-e2e.log`，10.8 分钟）；完整 Vitest **337 文件／5,471 项**、根构建、类型、lint、循环依赖、架构及文档门禁通过。大纲／Table 专项 **18/18**，原失败用例连续 **20/20** 通过。三个用户功能沿用 Summary 的原生 DemoTable，不增加 React 假数据；原生默认／lite 与 WASM 证据见下文。Table 接线已提交推送为 `ff4efaaf`，后续大纲补修已随 `be851c29` 提交推送。此次只完成本批三项，不代表整个 #32 或 41 项计划完成。下文保留过程记录。

本批只做三个用户功能：Tables 面板修改列名、直接编辑表头时同步列名与结构化引用、名称管理器查看并定位 Table。不包含 Table 样式、范围调整或自动扩展。前两项必须复用同一个 Rust 原子操作：表头文字、目录列名、引用公式与历史一起提交；第三项读取原生投影目录，不维护第二份 Table 注册表。

起始核对：旧 `Workbook::rename_table_column` 只修改注册项与普通公式，不更新表头、不记录用户历史，也不覆盖条件规则／保存的闭包。本批先补原生前后像与消费者改写，再接已有 Worker／command atom／React；不新增 backend、刷新层或 TS 工作簿镜像。

原生阶段已提交推送为 `c0831896`：`WorkbookHistory::rename_table_column` 复用 `TableDefinitionChange`，表头仅保留单格前后像，真实引用公式、条件规则及保存的闭包共同回放；低层旧接口改用相同实现，删除重复的跨表公式收集／写入路径。新增 `WorkbookHistory::set_cell_input` 区分普通格与 Table 表头：普通输入沿用原有解析，表头只作为列名文字进入同一改名操作，首尾空白规范化，空名／重名拒绝且不消耗 redo。该提交时尚未接入 WASM／React。

跨 Table 条件规则与延迟调用的裸引用复用原有调用位置判断，范围判断从转换实现移到共享 `table_ref_scope.rs`，没有第二份依赖图。特殊列名曾复现“改名成功但公式变为错误”；现已在唯一 parser／renderer 内补单引号转义，按 [Microsoft 结构化引用规则](https://support.microsoft.com/en-us/excel/using-structured-references-with-excel-tables)处理 `[] # @ '`。旧的非转义撇号形式仍可读取，输出统一转义。测试闭包使用引擎已支持的直接 LAMBDA 调用，不把尚未支持的单元格存储闭包调用混为列改名回归。

原生证据：专项 **33/33** 通过；全量 lib 加 14 套 Table 集成默认 **1,782 passed／3 ignored**、lite **1,759 passed／3 ignored**，顺序任务退出 0（`/tmp/excel-table-columns-default.log`、`/tmp/excel-table-columns-lite.log`）。覆盖一条撤销、原公式精确恢复、跨表数组、每次一次订阅通知、合并／spill 拒绝、失败保留 redo、嵌套闭包及转义往返。

接线进展：`change_table` 增加 `rename-column`，WASM `set_cell_input` 直接调用原生单格历史，删除 Worker 外层的单格 `withHistory`；格式／清除等其它命令不改。`TableColumns` 直接读写现有面板 atom，`NamedTableList` 从当前投影列出所有 Table，用既有切表／选区／滚动命令定位，不请求刷新目录、不新增历史。沿用 Summary 的真实 DemoTable（A80:B84），无需再造示例数据。

当前 WASM lib **153 passed／1 ignored**、lite／full WASM 构建通过。第一轮 Table E2E **21/21** 通过，桌面／390px 截图无横向溢出。单测发现跨表定位后开关按钮暂时禁用导致焦点丢失，已改为定位成功后回到表格，并补 DOM 与真实浏览器断言。初次 lint 的五处换行问题已修正；源码改变后主动终止刚开始的全量 E2E（不是验收结果），补充直接表头拒绝／redo 和跨表数组用例。最终专项、根构建、全量 Vitest 与完整 E2E 继续验证，本批仍未验收；本次接线未提交。

补充交叉 E2E 曾得到 **7 passed／2 failed**：直接编辑表头重名只显示通用失败提示；原生 modal 关闭前页面仍 inert，阻止焦点落到画布。已在既有错误映射里说明重名／空列名，并在关闭弹窗后的下一帧处理 DOM 聚焦，不加业务状态或重试层。修正后的本批 E2E **9/9**（含失败保留 redo、跨表数组、两种编辑器、桌面／窄屏）通过，错误提示与焦点单测 **12/12** 通过；日志 `/tmp/excel-table-columns-fixed-e2e.log`、`/tmp/excel-table-columns-feedback-unit.log`。此前完整 Vitest **337 文件／5,464 项**通过，新增两条提示断言后重新执行最终门禁链：根构建、完整 Vitest、lint、循环依赖、文档、完整 **753 项 E2E**，日志统一为 `/tmp/excel-table-columns-final-*.log`。完整 E2E 未结束前不提前验收，不进入下一批。

最终门禁中的构建、Vitest **337 文件／5,466 项**、lint、循环依赖、文档均通过。完整 E2E 暴露四个旧日期用例占用 Summary!A80:B80：这些位置现在是列名，不应把数字／公式形状的输入求值为普通格。日期用例改在真实空白工作表上执行，所有原数值、格式与撤销断言保留，并新增表头 `60`／`=1+1` 保持文字且引用仍计算的用例。初次交叉复测 **23 passed／1 failed**，唯一剩余失败是新表更长导致 A80 滚出虚拟窗口；已显式定位回断言行。旧全量进程主动结束，生产代码与 WASM 不变。修正后的日期／列名交叉 **24/24** 通过（`/tmp/excel-table-columns-date-fixed.log`），文档门禁通过；同一顺序任务已进入完整 **754 项 E2E**（`/tmp/excel-table-columns-accepted-full.log`），尚未验收或提交。

提交前最终结果：完整 E2E **753 passed／1 failed**（754 项，10.9 分钟）。唯一失败为 `e2e/workbook/outline.spec.ts:93`，冻结窗格并完成行／列分组后，折叠行收到 `Wait for the worksheet to finish loading.`；原因尚未确认，未修复。以上 Table 接线按用户要求提交保存，本批仍未验收，不把该结果记为全绿。

Table 接线已提交推送为 `ff4efaaf`。大纲失败已用单测稳定复现：列分组增加 gutter，视口重读期间，下一次折叠被 command atom 的 `ready` 检查提前拒绝。修正只允许同表保留投影的 `loading` 状态沿用原生版本发出命令；没有旧帧、跨表、读取失败仍拒绝，Worker 的过期版本检查不变。真实 Worker 顺序用例确认读取先落地、折叠结果随后发布，恰好两条历史且没有额外刷新。大纲／Table 专项 E2E **18/18**、完整 Vitest **337 文件／5,471 项**通过；根构建通过。完整 E2E 仍需重跑，本批未验收，补修未提交。

### Excel Table 汇总行（已验收）

最终验收：修正后的完整 E2E **744/744 passed**，原进程退出 0（`/tmp/excel-table-totals-fixed-full-e2e.log`）；完整 Vitest **336 文件／5,454 项**、根构建、类型、lint、循环依赖、架构及文档门禁通过。当前 Rust lib 默认 **1,652 passed／3 ignored**、lite **1,629 passed／3 ignored**，Table 集成双配置各 **55 项**，WASM lib **151 passed／1 ignored**。新增跨表数组用例在旧构件失败、新构件通过；填充柄 17 项在专项与完整回归均通过。当前功能为显示汇总行、修改列汇总函数、隐藏汇总行，不代表整个 #32 完成。补修尚未提交；下面保留阶段证据。

本批只做三个动作：显示汇总行、设置某列的汇总函数、隐藏汇总行。复用 `table.change` 与同一次返回投影；Rust 写入真实 SUBTOTAL 公式，表范围、公式与撤销历史一次提交。先补现有低层汇总操作的原子历史与完整拒绝检查，再接 Worker／UI Core／React。不得把已有低层接口或核心单测视为 React 功能完成。

实现已提交推送为 `a42ee510`：`WorkbookHistory` 的汇总行开关与列函数操作复用 `TableDefinitionChange`，只捕获被覆盖的一行或一个单元格，不复制数据区。低层旧接口共用预检／提交，占用、合并、spill、其他 Table 与网格边界在写入前拒绝，失败／无操作不消耗 redo。React 的 `TableTotals` 复用同一个 `table.change`；汇总函数由 Rust 从真实公式 AST 派生，不另存函数配置。Summary 的 DemoTable 为 A80:B84，B84 原生 SUM=60，初始化不占历史。

提交时证据：lite／full WASM 已重建；UI Core／React 专项 **33/33**、浏览器 Table 专项 **15/15**（含汇总行 8 项）、完整 Vitest **336 文件／5,454 项**、WASM lib **151 passed／1 ignored** 通过。根构建、类型、lint、循环依赖、架构及文档门禁通过。原生 lib 默认 **1,652 passed／3 ignored**、lite **1,629 passed／3 ignored**，Table 相关集成默认／lite 各 **55 项**通过；这些是下述补修前的证据。首轮完整 E2E 最终 **742 passed／1 failed**（`/tmp/excel-table-totals-full-e2e.log`），不提前验收。

提交后交叉补查复现：仅修改汇总函数时，跨表 `Table[#All]` 数组仍返回旧小计，导致下游 `SUM(A1#)` 同样过期。新增断言先失败（60 未更新为 20），定位为历史恢复的数组重投发生在外层 Store batch 结束之前。补修只沿被写入单元格的现有 atom 反向依赖，等最外层失效传播结束后更新受影响数组；不发布无关 Table 几何 epoch，不加缓存或刷新命令。修正后的原生历史 **6/6** 已通过，包含跨表数组及下游在修改／撤销／重做后的结果。持久 E2E 已增加同一真实交叉场景；修正后的双配置回归、WASM 重建及 **744 项完整 E2E** 尚待完成，本批仍未验收。

补修验证进展：新增真实浏览器用例在旧 WASM 上同样失败，准确复现“预期 20、实际 60”（`/tmp/excel-table-totals-array-before-e2e.log`）。修正后的历史／投影专项默认及 lite 各 **7/7**、WASM lib **151 passed／1 ignored** 通过。扩大回归任务退出 0：lib 默认 **1,652 passed／3 ignored**、lite **1,629 passed／3 ignored**，Table 集成双配置各 **55 项**通过。lite／full WASM 已重新构建；Table 与填充柄专项 **33/33**，其中新增交叉数组 E2E 已由失败变为通过（`/tmp/excel-table-totals-fixed-targeted-e2e.log`）。根构建通过，剩余门禁正在顺序执行；下一轮 **744 项完整 E2E** 使用固定源码／构件复核，日志 `/tmp/excel-table-totals-fixed-full-e2e.log`。补修尚未提交。

首轮唯一失败为右边缘填充柄自动滚动。保留的 trace 显示鼠标按下后页面重新导航（约 86,768ms），选区从 B3 变回 A1，随后 Vite 重连；不是已有证据能证明的滚动算法错误。未放宽断言、未增加重试、未改动拖拽代码，整个填充柄 **17/17** 已在新构件下通过，仍须用无源码／构件变动的完整回归确认。

### Excel Table 基础操作（已验收）

最终验收：修正后的完整 E2E **735/735 通过**，任务退出 0（`/tmp/excel-table-accepted-e2e.log`）；Vitest **336 文件／5,445 项**、根构建、类型检查、lint、架构边界、循环依赖及文档检查通过。Rust core 全量 lib 默认 **1,652 passed／3 ignored**、lite **1,629 passed／3 ignored**，WASM lib **149 passed／1 ignored**；Table 相关集成回归双配置各 **17 套／188 passed**。创建、改名、转普通区域这三项已完成，不代表整个 #32 完成。下文保留阶段记录。

当前提交状态：三个操作已通过现有 Worker 命令和 UI Core command atom 接入 React `Tables` 面板；Table 目录随同一份 projection 返回，不维护第二份目录。Summary 原始数据含 `DemoTable`（A80:B83），B5 的结构化引用初始为 60，初始化不占撤销历史。工作表改名、删除和恢复时的已保存 LAMBDA 引用与精确撤销也已补齐。

本次提交前已重建 lite／full WASM：根构建、类型检查、lint、循环依赖与文档检查通过；Vitest **336 文件／5,445 项通过**；Rust core 全量 lib 默认 **1,652 passed／3 ignored**、lite **1,629 passed／3 ignored**，WASM lib **149 passed／1 ignored**。Table 专项 E2E **5/5**，含桌面／窄屏弹窗与键盘焦点。全量 **733 项 E2E 仍在运行**（`/tmp/excel-table-final-e2e.log`），不提前宣布整批验收；以下记录保留各阶段当时的状态。

本批只做三个用户功能：创建表格、重命名表格、转换为普通区域。上一批名称框已提交推送为 `23256ded`；本批 React 接线与原生拓扑修复已提交推送为 `8f9e2984`。完整 #32 范围继续保留。

提交后补查：全量 E2E 首轮发现日期输入用例把 Summary!A80 当成空白，但新增 Table 在此处已有 `Product` 表头；撤销实际正确恢复了原值。该用例改用真实新建的空白工作表，保留原有空值／格式恢复断言。新增两条 Table 交叉 E2E 覆盖跨表消费者改名、转换、撤销／重做后的持续更新，以及空白／重复／公式表头规范化的精确撤销；后者同样在新表上验证，避开 Summary 的既有隐藏 G 列。日期 11 项加新增 2 项合计 **13/13 通过**（`/tmp/excel-table-integrity-e2e3.log`），类型检查通过；首轮全量仍在运行，不能将定向复测写成全量通过。桌面 1280px／窄屏 390px 的已填充弹窗均无横向溢出，正文 13px、对比度 14.08、最小控件高度 34px，浏览器无 pageerror。

首轮全量已结束：**732 passed／1 failed**，唯一失败即上述已修正的日期用例（`/tmp/excel-table-final-e2e.log`）。修正后的 **735 项完整 E2E** 已启动，日志 `/tmp/excel-table-accepted-e2e.log`，结果待收齐。原生 Table、结构化引用、转换上下文、工作表拓扑与小计集成回归默认／lite 双配置均为 **17 套／188 passed／0 failed／0 ignored**，顺序任务退出 0（`/tmp/excel-table-final-integration-default.log`、`/tmp/excel-table-final-integration-lite.log`）。尚未开启下一批功能。

先补 Rust 原子操作，再接 UI Core command atom 与 React 入口。创建操作复用既有 Table 名称／交叠校验，规范化后的列名写回表头，与单个表定义一起进入原生历史；快照只覆盖表头，不复制数据区或整个 Table 注册表。非法范围、合并／spill 交叠及历史外修改在写入前拒绝。重命名与转换必须处理公式消费者，不能把删除注册项包装成“转换为区域”。

当前已新增创建操作及原生历史接入。交叉测试复现了创建后数组锚点更新、spill 子格未更新的问题；现复用 Store 反向依赖与原有数组投影顺序修复，创建／撤销／重做覆盖同表、跨表及间接 `#` 消费者。裸表名也已接入唯一范围解析器，不另写表格取值路径，LET／LAMBDA 局部名继续优先。`OFFSET` 原先只接受单格引用，本次复用同一解析器接受 Table／命名范围／普通区域，并按源区域继承默认尺寸；对应旧“不支持区域”的断言替换为同表／跨表准确数值及尺寸断言。规则依据 [Microsoft 结构化引用](https://support.microsoft.com/en-us/excel/using-structured-references-with-excel-tables)与 [OFFSET](https://support.microsoft.com/en-us/excel/functions/offset-function)文档。

创建专项 7/7 通过；创建阶段默认配置扩大回归为 23 套／251 passed／1 ignored，日志 `/tmp/excel-table-create-default-final.log`。同一顺序任务的 lite 配置已完成 24 套／257 passed／1 ignored，日志 `/tmp/excel-table-create-lite-final.log`；它与后续重命名代码有时间重叠，不能作为当前源码最终双配置验收。展现层边界、活文档链接与 `git diff --check` 当时通过。

重命名现已新增原生历史，旧 `Workbook::rename_table` 也转用同一原子实现：表定义、单元格公式、条件公式与保存的 LAMBDA 一次提交，撤销恢复精确源码；自由裸名称与结构化引用共用既有 AST 改写，保留 LET／LAMBDA 参数、捕获与文本字面量。命名区域原有的规则／闭包模块改为真正共享的 `workbook_formula_rule_change.rs`、`workbook_formula_lambda_change.rs`，公式源码差异抽到 `workbook_formula_source_change.rs`，原命名区域事务文件降至 253 行，没有复制第二套消费者改写。

重命名交叉测试发现条件格式的复制平移器拒绝 `TableRef`，导致已有规则静默不显示；现让结构化引用原样通过，ThisRow 仍由目标格求值。修复后新增 5 项历史、3 项消费者测试通过，旧名称回归 15/15 通过；另补新名称消费者被激活、跨表 spill 与一次通知测试。重命名阶段扩大回归日志为 `/tmp/excel-table-rename-regression-default.log`、`/tmp/excel-table-rename-regression-lite.log`，双配置各 12 套／119 passed／1 ignored。新增源／测试文件均不超过 300 行；既有 `workbook_history.rs` 为 309 行，本次只新增历史分支，未扩围拆分。

转换为普通区域已开始原生实现，与重命名共用 `TableDefinitionChange`，以 AST 改写公式消费者并保存精确撤销差异；引用几何计算复用 `ResolvedTable::reference_range`。同时补充结构化引用区域限定符与列名组合的解析、渲染。WASM 仅同步了新增原生错误枚举及注释，尚未接入交互命令、重建构件或连接 Worker／React。整批尚未验收，本次按 WIP 保存，不代表功能完成。

补充证据：含旧 Table 结构随动的重命名专项默认配置 6 套／36 项全部通过（`/tmp/excel-table-rename-final.log`），随后 `cargo check` WASM crate 退出 0（`/tmp/excel-table-rename-wasm-check.log`）。这些均为转换改动之前的阶段证据，不是当前源码、浏览器 WASM 构件或整批验收。

本批原生基础已按 WIP 提交推送为 `81b01edb`，不是整批验收。提交时转换测试 `conversion_preserves_data_formats_and_total_formulas_with_exact_undo` 在跨表直接区域引用的 spill 子格断言失败（实际 Null，预期 30；`/tmp/excel-table-convert-parser.log`）。

后续修复：普通 `Range`／`SheetRange` 在值上下文改用已有 `runtime_ref_to_value`，与 Table 共用区域取值、数组尺寸上限和 spill 投影；不额外保存结果。两道候选判断同步覆盖普通区域及 IF／LET 等参数返回路径，同时保留 SUM 等标量聚合的惰性载入。源码候选判断也与解析器统一网格边界，避免把默认 `Table1` 误判成地址；引号内表名不会伪装成函数而漏掉数组。新增 `range_value_spill.rs` 验证直接输入、批量载入、跨表更新、间接 `#` 消费者、单格收敛、阻挡恢复及数组内存上限，并补默认表名批量载入回归。原失败的转换历史测试已通过，精确撤销与连续重做断言保留。

普通区域修复阶段的扩大集成回归双配置均为 **12 套／80 passed、0 failed**，日志为 `/tmp/excel-table-range-regression-default.log`、`/tmp/excel-table-range-regression-lite.log`。随后将 XLOOKUP 的备用区域结果纳入参数返回路径：双配置全量 lib 分别 **1651／1628 passed，各 3 ignored**，区域专项均 **4/4**，日志 `/tmp/excel-table-range-complete-default.log`、`/tmp/excel-table-range-complete-lite.log`，顺序任务已退出 0。这些是以下上下文转换改动之前的阶段证据。未重建 WASM 构件，未执行本批浏览器验收。

上下文转换已移除临时拒绝分支：保存／返回／捕获的 LAMBDA 用普通 `IF`、`INDEX`、`ROW` 引用保留调用行；裸引用通过当前行列／工作表判断，在原区域内使用普通地址，区域外仍解析其它 Table。跨边界条件格式仍是一条规则，不拆成逐格规则，也不保留已删除 Table 的隐藏注册项。区域边界用整个范围的起点与长度计算，使删除首尾行时正常收缩。参考 [INDEX 的引用形式](https://support.microsoft.com/en-us/excel/functions/index-function)，这是一份可持久化的普通公式，不是新的求值指令。

新增 `table_convert_context.rs` 覆盖不同调用行／工作表、返回和捕获闭包、缺列与越界错误、连续转换两个表、结构插删后的普通地址及跨表 spill、精确撤销与历史外闭包编辑拒绝。`IF` 的值／引用路径共用条件选择；调用次数测试先复现标量分支把条件执行两次，再由聚合／二元运算直接继续所选分支修复（`/tmp/excel-table-if-once-before.log`、`/tmp/excel-table-if-once-after.log`）。结构插行也先复现失效，再复用现有地址位移与 `FormulaLambdaChange` 保存真正变化的闭包；直接操作把实际差异交回历史，不重新扫描一遍。已删除不再需要的 `remap_named_ranges` 转发及改写阶段的无效 `Result` 包装；写入前的历史冲突校验保留。

本阶段全量 lib 默认／lite 已分别 **1652／1629 passed，各 3 ignored**（`/tmp/excel-table-context-lib-default.log`、`/tmp/excel-table-context-lib-lite.log`）；它们启动于最后的无效错误包装清理之前。扩大集成回归双配置均为 **15 套／104 passed、0 failed**（`/tmp/excel-table-context-regression-default.log`、`/tmp/excel-table-context-regression-lite.log`）。清理后的重点回归双配置均为 **5 套／22 passed**，会话 `79663` 已退出 0（`/tmp/excel-table-context-cleanup-default.log`、`/tmp/excel-table-context-cleanup-lite.log`）。会话 `92631` 已完成双配置 lib 及 WASM crate 检查并退出 0，检查日志 `/tmp/excel-table-context-wasm-check.log`。最新 `cargo check`、文档、展现层边界及差异检查通过。新增／修改普通文件均 ≤300 行；`workbook_structural_history.rs` 为 304 行，属于同一结构事务的预检／回放算法，按核心算法 ≤500 行保留。

上述区域与上下文修复已提交推送为 `04fd298a`，整批仍未验收。

工作表拓扑阶段：改名／删除现在复用 `FormulaLambdaChange` 改写保存及捕获的闭包，历史保存实际应用的差异，撤销恢复原闭包身份，不重新求值或捕获。改名保留原先悬空的新表名引用；撤销新增表保留原始悬空闭包；历史外修改在任何写入前拒绝，失败不消耗归档。新增 `table_convert_topology.rs` 先复现 3 项失败（`/tmp/excel-table-topology-before.log`），再覆盖改名、移动、归档恢复、连续撤销／重做及冲突解除后的重试。测试另暴露 `ROW(#REF!)` 被误改为类型错误，以及归档表重新挂接后继续读到脱离工作簿时的名称错误；现分别保留原错误、使现有公式及 facade 缓存失效。普通改名／移动不会触发归档挂接处理。

拓扑阶段双配置全量 lib 分别 **1652／1629 passed，各 3 ignored**，会话 `29512` 已完成双配置及 WASM crate 检查并退出 0（`/tmp/excel-table-topology-lib-default.log`、`/tmp/excel-table-topology-lib-lite.log`、`/tmp/excel-table-topology-wasm-check.log`）。这些是最终惰性修复前的阶段证据：扩大集成回归随后暴露恢复归档会迫使无关公式求值（`/tmp/excel-table-topology-final-default.log`、`/tmp/excel-table-topology-regression-lite.log`）。现去掉挂接时的 epoch 推进，仅将已有 facade 标记为过期，读到才求值；其它工作表仍由拓扑 epoch 发布。最新双配置均为 **3 套／23 passed、0 failed**，覆盖全部新增拓扑测试及工作表归档／历史，会话 `49732` 已退出 0（`/tmp/excel-table-topology-lazy-facade-default.log`、`/tmp/excel-table-topology-lazy-facade-lite.log`）。文档、展现层边界与差异检查通过；本阶段修改文件均 ≤300 行。

WASM 已开始接交互入口：`change_table` 解码创建／改名／转换三种载荷，直接进入同一原生历史栈；旧注册表原语与目录读取接口保留。`wasm_workbook_table_commands.rs` 只负责载荷分发，`wasm_tests/table_commands.rs` 验证单条历史、精确撤销、跨表误操作与非法载荷；原生边界专项 **3/3**，会话 `95280` 已退出 0（`/tmp/excel-table-wire-native.log`）。尚未连接 Worker／UI Core／React，也未重建浏览器 WASM 构件。当前改动未提交，整批最终验证及完整 41 项计划继续待办。

### 名称框与命名定位（本批已验收）

最终验收：名称框跨表定位、名称框给选区命名、Go To 名称定位三项完成。当前源码完整 E2E **728/728**（10.5 分钟），全量 Vitest **332 文件／5423 项**，根构建、lint、类型检查、文档／展现层边界／循环依赖检查全部通过。最终日志为 `/tmp/excel-name-box-final-e2e.log`、`/tmp/excel-name-box-final-vitest.log`，截图与 trace 在独立 `/tmp/excel-name-box-final-e2e-artifacts`。最终桌面／窄屏截图已检查，焦点与无横向溢出断言通过。名称框或 Go To 输入 `SampleAmounts` 可跨表定位；名称框将 E2:E4 命名为 `QuickUnits` 后，`=SUM(QuickUnits)` 为 6，支持管理器回读与原生 Undo／Redo。

本次提交同时包含上一批的大纲加载态禁用修复。Rust 源码与构件本批未变；名称公式、局部作用域及完整 41 项计划仍未完成。以下保留过程记录，其中“正在执行／尚未验收”不代表最新状态。已有 `named-ranges.test.ts` 是存量超长测试，本批仅迁移旧名称框相关断言，未扩大重构。

上一批管理器的新建／修改／删除已经完整验收，本批仅接三个入口：名称框按已有名称定位（含跨表）、名称框给当前选区命名、Go To 按名称定位。读取现有 Rust 返回的目录；定位只修改 UI 选区／视图，快捷创建共用 `namedRange.change`，不复制旧名称缓存或恢复旧 port。保留之前未提交的大纲加载态修复与验收说明，不自动 commit。

已接通 Go To：目录 atom 从面板移至 30 行 `native-catalog.ts`，只读同一返回投影，按当前 sheet index 解析目标，不产生新缓存。按 Rust 已接受的名称查找（含中文、点号、超网格地址形状），失效／超画布目标拒绝且不改选区；跨表定位仍复用已有切表、选区、滚动命令，最近记录固定为当时坐标。真实浏览器旧定位＋新增名称定位 16/16 通过，包含 seed、改名后新范围、删除、`#REF!`、1280px／390px 焦点和截图检查。UI Core 构建、React 构建／类型检查、lint、边界及循环依赖检查通过。

`native-name-entry.test.ts` 首轮三个入口均失败；接通 Go To 后曾剩名称框两项失败，提交钩子据此拦截，未跳过测试。现已实现名称框的原生定位与创建，两项原测试原样通过。名称框按地址转换／UI 状态／提交命令拆分，移除旧 registry、port 运行路径及重复的 TS 名称语法校验；管理器与名称框共用一个原生写入 command 和一份忙碌状态。异步创建保留可纠正的错误草稿，不覆盖新会话或抢回移开的焦点。

专项验证：UI Core 名称／定位 184 项通过，React 既有 9 项与新增 4 项通过，真实 Worker/WASM E2E 7/7 通过（含桌面／窄屏截图、原生公式引用、管理器回读、Undo／Redo）。新 E2E 首轮错误预期 E2:E4 合计为 15，核对原始 seed 实为 1、2、3，补逐格断言并改为 6 后通过，未修改产品迎合测试。旧 static-port 名称框测试替换为原生命令、防重复提交、迟到回复、错误重试测试；旧 Go To 纯解析作用域测试继续保留。全量 Vitest、根构建及 728 项 E2E 已启动，尚未整批验收；未修改 Rust，不以此前 721 项全量证据替代本批。

最终回归补充：首轮完整 E2E 发现连续编辑后名称框定位被新增的编辑态限制拦截，已移除该多余导航限制（创建名称仍检查编辑冲突），并补充编辑源不受定位影响的单测。重新聚焦时用 DOM 同步提交保证先更新受控值再全选，避免旧草稿插入点导致文本拼接；补有确定性焦点测试。日期交叉用例独立复现后连续三轮 33/33 通过，日志 `/tmp/excel-name-box-date-v3.log`。首轮全量已主动终止，结果不计验收；首轮还受源码热更新及并行测试共用产物目录影响，最终回归改用独立 `/tmp/excel-name-box-final-e2e-artifacts`，期间不再改产品源码。最终 728 项 E2E、Vitest、根构建／lint／cycles 正在执行，尚未提交或推送。

最终静态与单测验收：当前源码全量 Vitest 332 文件／5423 项通过，日志 `/tmp/excel-name-box-final-vitest.log`；根构建、lint、类型检查、文档、展现层边界、循环依赖（708 模块／1990 依赖）均已退出 0。最终浏览器回归仍沿 `/tmp/excel-name-box-final-e2e.log` 对应原进程运行，未以已通过的专项替代 728 项完整结果，尚未提交／推送。

### 命名区域管理（新建／修改／删除已验收）

三个用户功能：新建命名区域、修改命名区域、删除命名区域。Rust 保存动态范围定义而非值快照，名称命令共用原生历史；范围随工作表和行列结构变化，v1 可恢复动态语义。链路为 React → UI Core command → 现有 Rust Worker → 一次返回投影，没有新增名称 backend 或前端工作簿镜像。名称框、命名公式、局部作用域及页面刷新持久化不因本批验收从完整范围移除。

最终验收：默认／lite 完整 Rust 回归依次退出 0，分别 3164／3124 passed、各 10 ignored；WASM 原生 146 passed／1 ignored，最新两个构件的名称消费者及保存恢复专项通过。完整 E2E 721/721（10.6 分钟）、Vitest 330 文件／5401 项、根构建、lint、类型检查、文档／展现层／循环依赖检查全部通过。首轮唯一失败的大纲加载态已修复，补有确定性 React 测试及五轮 35/35 E2E，最终全量包含该失败用例。Summary 的 `SampleAmounts = C65:C67`、B4 初始 `12` 可直接测试；服务 `http://127.0.0.1:5183` 再次确认 HTTP 200。管理器主体已提交 `a7438a3d`，大纲补充修复、对应测试与说明文档尚未提交。下文保留历史过程，其中“尚未验收／待接入”不代表当前状态。

原生动态引用阶段：同一名称表中的定义区分值与范围，范围保存稳定 sheet key，求值经现有 runtime reference 与 Store 依赖读取。已验证 SUM／SUMIF／INDEX／ROWS、LET 遮蔽、创建后源格更新、替换范围、删除、改表名／移动表、删除后重建同名表不误绑定、循环引用及数组溢出缩放。十万行稀疏范围的 SUM 与中间空格新增数值均通过，物化 cell atom 少于 20。新增原生专项首轮 7/7 通过，原 LAMBDA 16/16、OFFSET 14/14 通过；补充迟建名称与删除来源表的数组清理用例后，正在跑完整原生回归，结果待补。行列结构随动、名称重命名、原生历史、v1 持久化、Worker／UI Core／React 和真实构件 E2E 尚未接入，当前浏览器演示没有名称管理入口。

前一批补充修复已按用户要求提交并推送 `81b7b982`；本批命名区域改动尚未提交。

补充测试查出删除来源表后旧数组仍保留：已在原有拓扑同步尾部沿名称的 Store 反向依赖重投影，9/9 动态范围测试通过。首轮完整原生运行在架构门禁停止（默认核心单测 1647 passed／3 ignored 后，架构 8 passed／2 failed／1 ignored）：一处确实新增了多余的 `get_named` 求值入口，已删除，范围只走既有公式引用路径，不放宽单一求值入口白名单；另一处仅更新拓扑同步的稳定表身份参数断言。修复后架构专项 10 passed／1 ignored；最后一轮名称关联回归尚在运行。lite 核心单测 1624 passed／3 ignored、WASM 原生 139 passed／1 ignored 是追加修复前的阶段证据，不冒充最终完整回归。文档、展现层边界、循环依赖（697 模块／1948 依赖）检查通过。新增生产文件 66 行、范围专项 195 行；既有循环检测算法 421 行只补范围分支，没有另建响应图。

名称语法尚须在管理命令交付前补齐：当前范围注册仍复用旧 ASCII 名称校验；点号、中文等字母、首位反斜杠及 R1C1 冲突不能遗漏。[Microsoft 名称规则](https://support.microsoft.com/en-us/excel/names-in-formulas)同时说明名称长度、不区分大小写及引用冲突；后续实现应以这些规则核对解析器与校验一致性，不以当前测试样例代替完整语法。

修正后的名称关联回归已退出 0：动态范围 9、架构 10、LAMBDA 16、OFFSET 14，合计 49 passed／1 ignored。已重新启动完整原生默认／lite 顺序回归，结果待补；未提交，不记为整批验收完成。

结构阶段：新增 `workbook_named_range_structure.rs` 复用既有 `shift_structural_range`，没有再写坐标位移算法。定义以 `None` 范围保留已完全删除的 `#REF!` 状态；整行／整列保持完整轴。结构历史只保留实际变化名称的前后坐标，回放前验证外部改动，插入越界在写入前拒绝。9 项结构专项通过，覆盖四种插删、重复 undo/redo、拒绝不消费 redo、无关名称不回滚、跨表数组、工作表删除恢复及每次仅一次最终通知。此前相关动态范围／结构历史／事务专项合计 32 项通过。

语法阶段：新增 `named_range_names.rs`，补齐中文／重音字母、下划线、首位反斜杠、普通点号分隔名称，255 按字符而非 UTF-8 字节计数；范围注册／查找／删除与 LET/LAMBDA 遮蔽统一大小写。首轮发现局部 LET 声明被静态循环检测当成全局范围，已按顺序绑定处理，真正引用自身的绑定值仍拒绝；名称／LET／LAMBDA 关联 37 项通过。源码位移扫描器同步保护 Unicode 名称中的地址片段；测试区分原源码的字节保留与 hydrated AST renderer 的既有括号写法，不修改产品渲染来迁就断言。扩充后的语法 6 项、结构 9 项已通过，其余当前专项及核心单测正在原进程运行。

语法仍有明确边界待处理，不能按“已完整支持名称规则”验收：旧解析器拒绝尾点／连续点，并把 `Sales1` 等超网格地址形状识别为引用；`scale_suite.rs` 还固定了超网格地址读取空值的既有行为，需要统一解析／位移语义后再扩展，不能只放宽注册校验造成不可引用名称。名称重命名、CRUD 的原子历史、v1 保存恢复、Worker／UI Core／React 与真实 WASM E2E仍未接入。上一轮完整默认／lite 顺序进程仍在执行；其默认构建早于本轮结构和语法修改，不作为当前源码最终全量证据。

本轮按单一职责 skill 分为范围结构（128 行）、名称语法测试（130 行）、结构测试（209 行）；现有循环检测核心算法 471 行，维持单一 AST 循环检测职责，未拆出第二套依赖图。静态文档与展现层边界检查通过。新改动尚未提交。

当前源码验证进程均已退出 0：默认核心单测 1647 passed／3 ignored（39.84 秒）；名称／结构／架构／停泊公式关联专项合计 52 passed／1 ignored。另已启动当前 lite 核心单测加三个名称专项、WASM 原生测试，结果待补。上一轮完整默认／lite 仍保留原进程；并非当前源码整批最终全量验收。

当前 WASM 原生回归已退出 0：139 passed／1 ignored。未新增 WASM 名称管理接口，也未重建浏览器构件；这个结果仅证明当前 Rust 改动未破坏已有 WASM 原生测试。

本次提交状态（覆盖上述阶段性的“尚未提交／待接入”描述）：按用户要求保存命名区域内核的进行中实现。已新增 Rust 名称 CRUD 原子历史与按 LET／LAMBDA 作用域改写的公式重命名，`cargo check` 通过；最新 `named_range_history` 5/5 通过，`named_range_rename` 4/5 通过。失败项 `renaming_and_retargeting_updates_spills_and_their_dependents_together` 在 `src/cell.rs:91` 触发整数乘法溢出，尚未定位修复，不能宣称测试全绿。上述核心／WASM 回归早于这部分 CRUD 改动，不代表本次提交的全量验证。Worker／WASM 名称管理接口、持久化与 React UI 仍未接入，本批未完成验收。

该 WIP 已按用户要求提交并推送 `24e62fdc`。随后续做修复，尚未再次提交：长名称试读为列号时改用检查算术；名称事务改为 Store 批次传播后再更新 spill，监听者只收到最终结果。跨表数组投影沿现有 Store 边以后序执行，不新增依赖索引／结果缓存；新增反向表序与三层数组链的重复 undo/redo、跨表单次通知测试。当前名称／结构／架构／数组相关专项合计 55 passed／1 ignored，核心单测 1648 passed／3 ignored；这些结果早于下面的恢复清理修复，不当作最终源码全量验收。

保存恢复阶段：新增 `workbook_named_range_snapshot.rs` 保存范围元数据，已失效范围保留 `#REF!`；通过现有 v1 `namedRanges` 字段恢复到新工作簿的稳定表身份。常量／LAMBDA 不属于此范围快照，通用命名公式持久化仍在后续完整范围内。载荷全部成功后才替换工作簿，错误定义／重复名／表名称冲突均保留原数据和历史。测试发现批量恢复清理错误回收了新数组的依赖根，已保留仍需 spill 维护的公式根，并补“不读 anchor，直接修改跨表源值”的普通 SORT 回归。修复后 WASM 原生单测 144 passed／1 ignored，含 5 项名称保存恢复测试。

WASM 边界统一在 `wasm_workbook_named_ranges.rs`：列表读取复用范围快照，新建／修改／删除只转换载荷并调用原生历史。新增 2 项载荷及历史命令测试，正在验证当前源码的核心／WASM 回归和真实 lite 构件。新写与大改文件均不超过 300 行；文档、展现层边界、循环依赖检查通过。尚无名称管理 UI／seed／产品 E2E，本批仍未验收。

本轮最新证据：当前默认核心单测 1648 passed／3 ignored、lite 核心单测 1625 passed／3 ignored；当前 WASM 原生回归 146 passed／1 ignored。架构门禁首轮仅因新增的两个 WASM API 未登记而失败，已用既有生成器更新签名快照（只新增列表／变更两条，未改旧签名或放宽检查）；复跑架构 10 passed／1 ignored、跨表批量数组 6/6、范围快照 2/2，当前名称 CRUD／改名／结构历史 19/19。真实 lite WASM 已重建，Node 直接加载该构件验证中文改名、CRUD、undo/redo、重复名拒绝、JSON 保存恢复后跨表溢出继续更新，全部通过；这是绑定 smoke，不冒充浏览器 E2E。根项目 `pnpm build` 通过。lite 数组链与范围快照专项合计 4/4 通过，进程已退出 0。早前完整默认／lite 顺序进程仍保留，不冒充当前源码最终全量验收。以上续做尚未提交。

本次续做提交范围：Worker 新增 `namedRange.change`，只转换 sheet ID／坐标并调用 Rust；名称目录随同一次可见区投影返回。UI Core 新增管理草稿与 command atom，不建立第二份名称事实或历史。提交前根项目 `pnpm build` 通过，UI Core 全量 Vitest 199 文件／2992 项通过（含新增 Worker 6 项）；文档、展现层边界和循环依赖检查通过。管理草稿专用测试、React 界面、seed 与真实浏览器 E2E 尚未完成，本次仅保存进行中版本，不代表命名区域整批验收。

上述续做已提交并推送 `b43596ac`。后续当前工作区未提交：React 新增工具栏 Name manager 弹窗，直接读名称投影并派发已有 command atom，可新建、跨表修改、改名、删除、修复 `#REF!`。目录不发额外读取请求；弹窗仅有 UI Core 草稿，连接身份判断留在 UI Core，React 不读 connection。Summary 原始数据新增 `SampleAmounts = Summary!C65:C67`，B4 的 `=SUM(SampleAmounts)` 显示 12，启动后 Undo 仍为空。新增草稿 15 项、seed 2 项、React 6 项测试；完整 Vitest 330 文件／5400 项通过，根构建、lint、展现层及循环依赖检查通过。

真实 Worker／WASM 浏览器专项 8/8 通过：CRUD／中文改名／undo-redo、跨表重算／重复名、来源区域删除后的修复与撤销、seed、1280px／390px 焦点与溢出，以及 lite／full 的 JSON 保存恢复（恢复后修改来源仍更新聚合与 spill，坏载荷不破坏原数据或历史）。已检查两种宽度截图；环境没有 skill 附带的视觉脚本，使用仓库 Playwright 截图、尺寸断言与 pageerror 检查替代。演示服务 `http://127.0.0.1:5183` 返回 200。完整 717 项 E2E 正在原进程执行，日志 `/tmp/excel-name-ui-all-e2e.log`；不是最终全绿证据。

名称语法继续修复：尾点／连续点按名称字符解析；超网格的裸 `Sales1`／`XFE1`／`A1048577` 按名称处理，显式 `$` 引用不受影响。未解析源码的结构位移扫描同步调整，避免插行改坏名称。旧 `scale_suite` 中越界裸引用读空值的断言按新语义改为未定义名称错误，并保留显式引用的原行为断言；不是跳过网格边界测试。当前解析测试 87/87 通过；默认核心／lite、名称历史／改名、位移与网格边界回归仍在原进程执行（`/tmp/excel-name-grammar-*.log`）。本段 Rust 修改晚于上述 WASM 构建，因此上述浏览器证据不覆盖新语法，待现有 E2E 结束后再重建构件复验。改名对条件格式公式及已存 LAMBDA 等其它名称消费者的覆盖仍须核对，不能宣称整批已完成。

本轮消费者交叉修复：新增 `workbook_named_range_rules.rs` 只保存实际改写的条件规则，原子预检修订号／规则身份，undo 不抹掉同表其它规则；`workbook_named_range_lambdas.rs` 复用已有作用域改名算法处理保存的闭包。5 项消费者测试通过，含精确恢复原文、外部变更拒绝、参数／捕获遮蔽和嵌套闭包。测试进一步复现调用方 LET 泄漏：改名后原本应为 30 却返回 99；现有局部查找、捕获快照、省略参数查找均在 LAMBDA 活动帧边界停止，不新增作用域系统。函数调用同样优先查询局部绑定。名称事务核心 312 行，按不可拆散的“全部预检后原子写入”核心算法保留，两个消费者模块为 81／100 行；调度文件仅保留 4 行增加、1 行替换，已撤掉无关格式化差异。

证据更新：第一轮完整浏览器回归 717/717 已退出 0（10.8 分钟），但它使用消费者修复前的构件，仅为阶段证据。最终 lite／full WASM 已重建；新增语法／条件格式／闭包 E2E 后，当前构件专项 12/12 通过，包含 `Sales1`／尾点／连续点／超网格名称随插行保持、条件格式改名及精确撤销、两个构件的闭包与持久化。根构建通过，WASM 原生 146 passed／1 ignored，文档／展现层／循环依赖检查通过。最终 721 项完整 E2E 已启动（`/tmp/excel-name-final-all-e2e.log`），最新默认／lite 核心与完整原生回归仍在跑。两个早于闭包修复的旧长回归已明确终止，保留日志但不计为验收；替换原因是源码已变更，不是观察超时。最终完整原生日志为 `/tmp/excel-name-final-native-default.log` 与 `/tmp/excel-name-final-native-lite.log`。仍未提交，不进入下一批。

提交后核对：上述管理器实现已提交并推送 `a7438a3d`，提交钩子的 lint、主线类型检查、文档／边界检查与受影响 Vitest 209 文件／2049 项通过。最终源码的默认核心单测 1651 passed／3 ignored、lite 核心单测 1628 passed／3 ignored 已退出 0；完整原生默认／lite 和 721 项 E2E 仍沿原进程运行，不用核心单测替代整批回归。演示服务再次确认 HTTP 200。

本批覆盖的是管理器的新建、修改、删除，不是 #27 全部能力。只读核对发现 [`name-box/index.ts`](../spreadsheet-ui-core/src/name-box/index.ts) 的显示与定位仍读取旧 `nameRegistryCacheAtom`，React 名称框未提供旧创建 port，因此新名称尚不能从左上角名称框定位／创建。后续必须改用 Rust 返回的目录与既有原生命令，不能同步第二份名称缓存来掩盖断链。名称框接入、命名公式、局部作用域与页面保存入口继续保留在完整范围，本次不叠加新的用户功能。

全量交叉回归发现并修复一个现有 UI 问题：721 项 E2E 首轮退出 1，720 通过；大纲分组新增边缘控件后触发视口加载，但工具栏菜单仍可选，下一次折叠被命令拒绝为“等待加载”。新增确定性 React 测试在修复前失败；菜单现与边缘按钮一样读取现有 `projectionSnapshotAtom`，非 ready 时禁用，没有增加队列、重试或新状态。大纲 Vitest 11/11、真实 E2E 连续五轮 35/35 通过，1280px／390px 截图与键盘／溢出断言已检查。首轮日志 `/tmp/excel-name-final-all-e2e.log` 和 trace 保留；最终 721 项复跑使用 `/tmp/excel-outline-final-all-e2e.log`。Rust 未改，完整原生回归仍沿原进程执行。此修复和验收记录尚未提交。

加载态修复后的全量 Vitest 330 文件／5401 项通过，根项目 `pnpm build` 已退出 0。展现层边界、循环依赖和文档检查通过；完整浏览器及原生回归仍待最终退出状态，不以 35 项重复专项代替 721 项全量。

最终浏览器复跑已退出 0：721/721（10.6 分钟），日志 `/tmp/excel-outline-final-all-e2e.log`，包含首轮失败的大纲交叉用例和当前名称管理／消费者／保存恢复全部专项。修复后的全量 Vitest 5401/5401、根构建、lint、主线类型检查、文档／展现层／循环依赖检查均通过。三个手工测试步骤已补入[当前能力与操作说明](docs/current-capabilities.md#命名区域管理当前批次)。完整 Rust 默认／lite 仍沿同一个顺序进程执行，不能以默认／lite 核心单测替代完整原生集成回归；仍未整批验收，不进入下一批。当前未提交内容仅为大纲加载态修复、对应回归测试与两份说明文档。

原生默认版完整回归已成功结束：206 组测试结果（含核心、集成与 doc-tests）合计 3164 passed／0 failed／10 ignored，日志 `/tmp/excel-name-final-native-default.log`。顺序命令的 `&&` 后半段已启动同一源码的 `--no-default-features` 完整回归，日志 `/tmp/excel-name-final-native-lite.log`；不重启、不以此前 lite 核心 1628 项替代本轮完整结果。仅 lite 完整回归结果尚待收尾，未进入下一批，当前补充修复仍未提交。

### 分组与大纲基础（本批已验收）

最终验收：第二轮完整 E2E 709/709（10.3 分钟）通过，原进程退出 0，包含所有首轮失败用例及新增恢复用例。结合根构建、全量 Vitest 326 文件／5371 项、Rust 默认／lite 合计 6190 passed／20 ignored、WASM 原生 139 passed／1 ignored、真实 lite/full 保存恢复及静态门禁，行分组、列分组、折叠／展开三项本批验收完成。链路为 React 事件 → UI Core command → Rust → 返回投影；分组事实和历史只在 Rust，几何为投影派生，React 只画边缘控件。Summary 8–12 行含 9–11 行子组，E:G 列分组保留手动隐藏 G 列，B12 的 SUBTOTAL 可验证折叠重算。演示服务 `http://127.0.0.1:5183` 已返回 HTTP 200。基础功能已提交 `d64226c6`，本轮补充测试、24px 视图恢复修复及文档仍未提交；整体 41 项范围未完成。下方保留历史过程记录，其中“待验收”不代表最新状态。

三个用户功能：行分组（含取消）、列分组（含取消）、折叠／展开。分组元数据由 Rust 保存；折叠造成的不可见与用户手动隐藏分开，展开不能擅自取消手动隐藏。复用当前 React → UI Core command → Rust → 返回投影链路，不恢复旧 TS outline 数据源。本批功能已接入，全量验收尚待完成，不计入完成项。

原生阶段：新增 `outline.rs`（区间规则）、`sheet_outline.rs`（工作表分组入口／结构位移）、`workbook_history_outline.rs`（分组历史）。原生模型支持最多八层嵌套、父子组独立折叠及按层级显示；取消已折叠分组保留隐藏状态。部分交叉、越界、过深及失效分组索引在写入前拒绝。组只存区间与折叠标志，不创建逐格 atom。行列插删、工作表移动／删除撤销、SUBTOTAL 隐藏依赖、自动尺寸与快捷公式目标检查已接入。

WASM 仅新增 `change_outline` 一个修改入口；分组及其派生隐藏索引随原有 `sheet_visibility` 返回，历史留在 Rust。v1 快照新增可选 `outlines`，旧文档保持无分组；签名快照已同步。新增真实 lite/full 构件保存恢复 E2E，明确不以此代替后续 React／Worker 操作验收。浏览器首轮发现测试调用了 Rust 方法名而非已有 JS 导出名，纠正后第二轮查出原有保存逻辑遗漏手动隐藏列；已新增可选 `hiddenColumns` 元数据并补原生原子拒绝回归，不放宽原断言。

阶段证据：Rust 默认专项 60 passed／1 ignored（含大纲、手动隐藏、结构、自动尺寸、快捷公式及架构检查），WASM 原生 139 passed／1 ignored；此前根构建、Vitest 323 文件／5349 项通过。整理后的双配置专项、最终 lite/full 构件及真实浏览器保存恢复正在重跑，最终结果待补；尚无 React 分组入口、原生种子和完整 E2E 验收。本批未提交，也未开始下一批。

最终原生阶段证据：同一顺序进程退出 0，默认／lite 专项各 60 passed／1 ignored，WASM 原生 139 passed／1 ignored；最终 lite/full 构件重建成功，浏览器保存恢复 2/2 通过（1.7 秒），手动隐藏列断言保持原样。最新根构建、lint、展现层边界、文档和差异检查通过，演示 5183 返回 HTTP 200。默认→lite 原生完整回归已启动，仍待结果；接下来继续本批的 UI Core command、几何投影、React 分组控件、种子和完整 E2E，不把原生阶段视为三个用户功能已交付。

提交前进度（2026-10-11）：UI Core 已接入 `outline.change` command、Rust 确认后的分组投影及隐藏几何；React 已接入行列分组菜单、边缘折叠按钮、层级按钮，Summary 演示已加入嵌套分组与 SUBTOTAL 原生种子。复用既有 Worker 和投影链，不新增 backend／bridge 或 React atom。

当前验证：UI Core／React 专项 Vitest 4 文件／28 项通过；真实构件持久化、分组交互、手动隐藏及冻结交叉专项 E2E 20/20 通过（16.3 秒），包含桌面及窄屏键盘操作。Rust 默认／lite 完整回归合计 6190 passed、20 ignored、0 failed。首轮浏览器测试修正了视口前提及不存在的列范围；同时修复窄屏边缘折叠按钮被裁切的问题，未放宽功能断言。主线类型检查通过；提交前补正 5 处格式检查问题。UI 接入后的根构建、全量 Vitest 和全量 E2E 尚待验证，当前仅按用户要求提交阶段成果，不开始下一批。

上一批数据验证已按用户要求提交并推送：`a1e5b501`。上述原生阶段及下面两批记录中“尚未提交”等描述是当时的历史过程。

阶段提交：`d64226c6` 已按用户要求推送 `origin/main`，提交门禁 242 文件／2909 项通过。续跑验收中，根构建、全量 Vitest 326 文件／5368 项及循环依赖检查（697 模块、1948 依赖）已通过；完整 706 项 E2E 已启动并保持原进程运行，尚无整批最终结论。

补充验收：新增 `outline-recovery.spec.ts` 验证整行轴／整列轴全部折叠后的键盘展开、撤销／重做，以及取消折叠组保留隐藏并可撤销；首轮两处失败来自范围末端活动格与 A1 预期不一致，明确选中 A1 后 3/3 通过，不修改产品行为。又补两个 UI Core 迟到响应用例，保证新选区不会被旧命令拉回、清空工作簿后不会复活旧分组；专项 8/8 通过。分组、恢复及 lite/full 持久化专项合跑 12/12（14.4 秒）通过，新增按钮边界断言；1280px／390px 截图已目视复核，折叠按钮完整可见，窄屏无页面溢出。共享 visual-runtime 缺失，使用持久 E2E 的截图／焦点／溢出／页面错误检查。新增测试 56 行，扩展命令测试 209 行，按单一职责规则未增加生产模块；此前仅小改的既有 runtime／commands 超限文件不扩大重构。

补充测试后的全量 Vitest 326 文件／5370 项通过（50.08 秒），lint、文档与差异检查通过，演示 `http://127.0.0.1:5183` 返回 HTTP 200。完整 706 项 E2E 原进程仍在执行，新增 3 项恢复测试另行专项通过，不能把运行中的全量记为通过。本轮新增验证与记录未提交，不开始下一批。

完整浏览器回归中发现两类旧测试前提失效：大纲栏压缩窄屏可见宽度，分列的 D 列输出已离屏，三条用例改为先用名称框定位再核对相同结果；新原生示例在 B9 有数据，八条“空区域合并”边框用例触发正常的内容丢失确认，测试准备阶段明确清空自己的目标区域，不绕过确认机制。邻近合并边框用例同步补齐空区域前提。分列专项 19/19（23.6 秒）、边框专项 29/29（28.7 秒）通过，保留原来的数据、格式和历史断言；生产源码与 WASM 未改。原 706 项运行尚未结束，结束后需用当前测试重新跑完整回归，不能以修正后的专项替代全量验收。

首轮完整结果：原进程退出 1，693 passed／13 failed（11.6 分钟）。除上述 11 条测试前提问题外，两条原有每表视图记忆用例查出实际回归：切回带大纲栏的 Summary，先用上一表较大的可见面积裁剪保存位置，再因新面积变小被误判为贴底，导致纵向偏移 24px。已在既有三个模块修复：`activate-workbook-sheet.ts` 先恢复 UI 坐标，`use-workbook-grid-viewport-measurement.ts` 切表后同步测量真实面积，`setViewportSizeAtom` 首次测量只裁剪、不做缩放贴边；不缓存每表 DOM 尺寸，不增加状态层或生产文件。普通窗口缩放仍保留原来的贴边行为。

原来的两条浏览器精确坐标断言保持不变；视图记忆／分组／全隐藏恢复专项 18/18（16.5 秒）、相关单测 4 文件／27 项通过，并补一个双轴恢复单测。画布缩小的单测模拟宿主测量后仍须精确裁剪到 0。改动生产文件分别 42／72／41 行，视图记忆测试 291 行，均未超限。修正后根构建、全量 Vitest、静态检查及完整 709 项 E2E 已重新启动；原生源码／WASM 未变，沿用本批已完成的原生双配置证明。最终全量结果仍待补，不记为整批完成，不提交新改动。

修正后静态门禁原顺序进程退出 0：根构建、全量 Vitest 326 文件／5371 项（46.48 秒）、lint、循环依赖（697 模块／1948 依赖）、文档和差异检查通过。桌面／窄屏视图记忆两条原始 E2E 又独立通过（4.5 秒），恢复截图已目视复核，保持精确位置、焦点与无页面溢出断言。第二轮完整 709 项 E2E 仍在原进程执行；源码不再变动，最终验收待该结果。

### 数据验证比较条件（本批已验收）

最终验收：完整 E2E 697/697（10.1 分钟）通过，原进程退出 0。结合最终 Vitest 5349/5349、Rust 默认 3102／lite 3062（各 10 ignored，0 failed）、WASM 原生 135 passed／1 ignored、实际 lite/full 保存恢复、构建与静态检查，等于／不等于、大小比较、区间外限制三项验收完成。沿用原面板、command 和原生判断，没有新增生产模块。与上一批日期／时间／长度验证的改动均尚未提交；整体 41 项范围仍未完成。下方为过程记录。

三个用户功能：等于／不等于、大小比较（大于／大于等于／小于／小于等于）、区间外限制。复用已有配置面板和 `validation.change`，比较判断只在 Rust 实现；整数、小数、日期、时间、长度规则共用条件语义，列表规则不提供无意义的数值条件。旧规则及旧快照默认仍为闭区间，默认条件不新增序列化字段；单值条件隐藏第二边界，由 command 使用同一个可见值填充两端，不让隐藏草稿参与配置。区间外比较排除两个端点，不绕过整数／日期／钟点类型域；文本长度对未忽略空白按长度 0 应用条件。

链路仍为 React 表单 → 既有 UI Core command atom → Rust 比较及原生输入／粘贴验证 → 一次投影；没有新后端、值镜像或生产模块。`data_validation.rs` 集中规则判断；既有 wire 保留可选条件；面板仅新增条件下拉和单值／双边界展示。新增 `data_validation_comparison.rs` 与 `data-validation-comparison.spec.ts` 分别验证原生关系语义与真实 UI 交互。Summary H53 是等于 5、H54 是大于等于 10、H55 是区间外 2–4。

当前证据：原生数据验证／输入／粘贴／历史／结构专项 38/38、UI Core／React 专项 39/39、WASM 原生完整 135 passed／1 ignored 通过；实际 lite/full WASM 已重建。新增八种条件、三种非数字类型、示例、整批粘贴拒绝、窄屏表单及保存恢复 E2E 已编写，真实浏览器专项和完整门禁正在运行，尚未验收。本批与上一批改动仍未提交，不冒用前批完整验收结果。

浏览器专项首轮 25 passed／14 failed，失败全部来自新测试的 `Condition` 模糊定位同时匹配 Conditional formatting 按钮与比较下拉；改为精确匹配后，专项 39/39（36 秒）全部通过，未改比较逻辑或放宽断言。1280px／390px 截图已目视复核，输入、说明和按钮无裁切；共享 visual-runtime 缺失，使用持久 E2E 截图／溢出／焦点／页面错误检查。原生主规则 200 行、wire 190 行，面板与新增测试均小于 300 行，没有为了枚举条件增加生产模块。

首轮根构建、全量 Vitest 323 文件／5349 项、循环依赖检查通过；lint 发现两处超长行，已整理事件和提示文字。整理后的根构建／单测／静态门禁正在重新运行，完整 697 项 E2E 已启动；Rust 默认→lite→WASM 全量保持原进程执行。产品源码与 WASM 不再修改，最终结果仍待补，不开始下一批。

整理后最终源码：lint、主线类型检查、根构建、展现层边界、文档及差异检查通过，全量 Vitest 再次 323 文件／5349 项通过，顺序命令退出 0。Rust 默认已完整通过（195 个汇总、3102 passed／10 ignored、0 failed，Doc-tests 结束），原命令已进入 lite；完整 E2E 与 lite／WASM 后续结果仍待补。演示服务 `http://127.0.0.1:5183` 返回 HTTP 200，本批仍未提交。

原生最终结果：原默认→lite→WASM 顺序命令退出 0，默认 3102 passed／10 ignored、lite 3062 passed／10 ignored、WASM 135 passed／1 ignored，均 0 failed，均已完成 Doc-tests。当前只剩同一轮完整 E2E 待结束，源码保持不变；尚未标记整批验收。

### 日期、时间与文本长度验证（本批已验收）

最终验收：原 Rust 默认→lite→WASM 顺序命令已退出 0；默认 3097 passed／10 ignored、lite 3057 passed／10 ignored，均包含 Doc-tests；WASM 原生 134 passed／1 ignored，均 0 failed。结合完整 E2E 682/682、Vitest 5335/5335、实际 lite/full 构件保存恢复、根构建与静态门禁，本批三个功能验收完成。没有新增生产模块，所有值判断仍在 Rust，React 只渲染表单并发出 command。本批代码与验收记录尚未提交，整体 41 项计划仍未完成。下方为各阶段过程记录。

本批三个功能：日期闭区间、一天内钟点闭区间、文本长度闭区间。复用已有规则存储／历史／输入／粘贴路径，仍为 React 表单 → UI Core command atom → Rust 规则 → 一次投影；不新增后端或 TS 数值校验镜像。日期／时间边界以文本传输，由原生日期、钟点解析器解释；字符计数与引擎 LEN 一致，包含空格，按 Unicode 标量而非 UTF-8 字节计数。未勾选忽略空白时，长度规则检查实际长度 0。日期比较原生完整序号，不擅自截去时间分量；钟点边界不允许累计时长 24:00。公式边界、跨午夜范围等未纳入本批。

文件职责：`data_validation.rs` 定义原生规则语义；`wasm_data_validation_wire.rs` 描述传输／保存形状；既有 `native-panel.ts` 保留表单草稿，`DataValidationTools.tsx` 渲染输入；新增 `data_validation_limits.rs` 验证三种规则的原生边界。没有增加新的生产模块或组件层。示例在 Summary H49:H51，日期值由 DATE 原生公式产生。依据[微软规则类型文档](https://learn.microsoft.com/en-us/office/dev/add-ins/excel/excel-add-ins-data-validation)接入，不把文本长度规则误做成“只能输入字符串”。

阶段验证：原生新规则 6/6，连同既有输入／粘贴／规则交叉共 23/23 通过；新编译 WASM 原生完整测试 134 passed／1 ignored。最初 cargo 使用 `data_validation` 过滤词命中 0 项，不能记为通过；随后直接运行该新编译测试程序的全部用例，退出 0，已覆盖六种规则保存恢复及新增非法 wire 测试。实际 lite/full WASM 均已重建，真实浏览器专项 24/24（含自动列宽及两种产物保存恢复）通过。UI Core／React 专项 25/25、全量 Vitest 323 文件／5335 项、根构建、lint、类型、展现层边界、文档和差异检查通过。1280px／390px 截图已目视检查，表单／按钮无裁切；共享 visual-runtime 缺失，仍使用持久 E2E 的截图、溢出、焦点和页面错误检查。新增／主要修改文件均小于 300 行。

最终浏览器回归：完整 E2E 682/682（9.8 分钟）通过，原进程退出 0；日期／时间／长度新增用例与原有编辑、自动列宽、剪贴板、格式、选区、工作表历史均通过。循环依赖检查也通过（689 模块、1919 依赖）。本批 Rust 默认→lite→WASM 全量仍沿同一进程执行，产品源码与 WASM 保持不变，尚未标记整批验收。本批改动未提交。上一批本地 lite 旧进程只对应 `35c1a9b5`，不得将其结果冒用于本批；本批 Rust 验收使用新的日志与构建目录。

Rust 默认配置已完整通过：194 个测试汇总、3097 passed／10 ignored、0 failed，包含 Doc-tests；原顺序命令已进入 lite 全量，后面仍会运行 WASM 全量。当前只等待该原进程完成，不改源码、不重启回归。上一批旧 lite 任务也已退出 0，但不计入本批证据。

### 数据验证基础（本批已验收）

最终验收：[`35c1a9b5` CI](https://github.com/allroad88888888/einfach-excel/actions/runs/38103424399) 已 completed／success，Node 22.12.0、24 均构建／测试通过。已下载 Rust 实际日志核对：基础 core 64 passed、Excel 默认 3091 passed／10 ignored、lite 3051 passed／10 ignored、WASM 原生 133 passed／1 ignored、Chrome WASM 7/7，均 0 failed，基准程序编译通过。结合本地完整 E2E 675/675、Vitest 5328/5328、实际 lite/full 保存恢复及静态检查，整数／小数／列表三项验收完成。远端与本地源版本相同，因此采用远端已完成的双配置结果；本地旧 lite 进程继续运行，其结果不用于下一批新源码验收。下方均为历史阶段记录，整体 41 项计划仍未完成。

最新验收证据：`35c1a9b5` 已提交并推送，修正版完整 E2E 675/675（9.7 分钟）通过，原运行进程退出 0；提交门禁的受影响 Vitest 186 文件／2017 项也通过，工作区在推送后干净。Rust 默认配置已完整通过：193 个测试汇总、3091 passed／10 ignored、0 failed，包含 Doc-tests；原顺序命令已进入 lite 全量回归。[本提交 CI](https://github.com/allroad88888888/einfach-excel/actions/runs/38103424399) 已启动，尚未有最终结论。因此当前仍不标记整批验收，不开始下一批。下方“浏览器运行中”等为阶段记录；本段验收记录尚未提交。

本批三个功能：整数范围、小数范围、单元格下拉列表。已实现 Rust 规则模型、稀疏区域覆盖／清除、原生配置历史及行列结构随动；规则属于 Sheet，移动工作表与删除撤销复用现有 Sheet 归档。区域片段共享不可变规则，不创建逐格 atom 或扫描空白格。直接输入拒绝、WASM 规则读写及 v1 保存恢复、值类型粘贴校验、UI Core 命令、React 配置面板与单元格下拉选择均已接入。新的命令／DOM 专项与真实 Worker E2E 已补，完整回归仍在运行，不以旧 TS 校验类型／测试作为 Rust 产品能力。

续跑接入：Summary 的 `H45` 是 1–10 整数、`H46` 是 0–1 小数、`H47` 是列表（Ready／On hold／001／=1+2）。工具栏 Data validation 可配置或清除所选范围；列表选择复用普通编辑提交，前导零和等号文本不会变成数值或公式。规则仅在活动格或原生 revision 改变时重读，滚动只更新 DOM 位置。React 不读取连接资源，连接身份／迟到响应／投影版本检查留在 UI Core；没有新增写入通道或工作簿镜像。

补查修正：真实 E2E 先发现启动定义快照漏复制验证规则，已补快照及原生初始化回归；断开旧 Worker 后的错误也不再留在新面板；输入拒绝现在给出可读规则提示。原生全量回归发现两个新增 WASM API 未更新签名快照，已用仓库生成器补齐，仅新增 getDataValidation／setDataValidation，没有修改已有签名。`eae670bd` 已按用户要求提交推送；本次续跑提交包含上述修正，整批验收仍以完整回归为准。

当前证据：最终源码的专项 E2E 11/11（编辑、下拉、历史、整批粘贴拒绝、结构随动、桌面／390px 布局、lite/full 实际 WASM 保存恢复）通过；两个实际 WASM 已重建，WASM 原生 133 passed／1 ignored；根构建、展现层边界、lint、循环依赖及文档检查通过。补充缓存回归后的最终全量 Vitest 为 323 文件／5328 项，主线类型检查也通过，顺序命令退出 0。完整 E2E 与 Rust 默认→lite 全量沿当前进程继续等待；被热更新打断或主动停止的早期浏览器运行不计为通过。尚未标记整批验收，也没有开启下一批。

缓存补查：新增三个用例证明同坐标换连接／换原生版本会丢弃旧规则、同版本视口读取不会要求重读规则、旧请求失败不会擦掉新选区的规则，相关 atom 专项共 13/13 通过。产品源码未改动，未重启正在进行的浏览器或 Rust 回归。本轮 1280px／390px 截图已目视复核：下拉箭头、表单及操作按钮无裁切；共享 visual-runtime 不可用，复用持久 E2E 的截图、溢出、焦点与页面错误断言。

完整浏览器首轮结果为 673 passed／2 failed，失败均来自既有自动列宽测试：新加在 F45 的 `Whole number 1–10` 标签把 F 列适应宽度撑到 127px，影响原先“小于 120px”的示例约束。等该轮完整结束后，仅将标签缩短为 `Integer 1–10`，没有改列宽算法、规则或测试断言。原失败用例、数据验证、实际 lite/full 保存恢复合计 17/17 复跑通过，修正版根构建通过；完整 E2E 已重新启动，Rust 默认→lite 仍沿原进程运行。本记录不把专项通过当作完整验收。

远端补查：[`eae670bd` 的 CI](https://github.com/allroad88888888/einfach-excel/actions/runs/38101838727) 的两个 Node 作业成功，Rust 作业因上述签名快照遗漏失败；日志已核实同一个错误。本地修正后的 `wasm_public_api_signatures_unchanged` 已通过，本次提交包含快照修正；远端是否通过仍须以新提交的 CI 结果为准。

阶段验证：新增 14 项规则／区域／历史测试，加上既有结构及历史交叉 22 项，默认与 lite 均 36/36 通过；包含 400 次确定性随机矩形操作与逐格参考对照、4096 区域容量拒绝原子性、整列规则零新增 cell atom。补充插删后的精确坐标断言后，区域测试在两种配置再次各 7/7 通过。文档链接、展现层边界及差异检查通过；这些仅证明原生配置阶段，不能替代之后的真实 Worker E2E 与完整门禁。仍保持 React 表单 → UI Core command atom → Rust 规则与用户操作校验 → 返回结果，不增加 backend 或工作簿镜像。

输入阶段：普通值及自动数字格式在写入前检查；受限公式检查已安装公式的同一次原生计算结果，失败恢复原格并延后已注册订阅的通知，不为预检重复计算 RAND／自定义函数。原始写入、导入及依赖重算不受此交互限制。专项先复现了外层历史重复回滚通知、导入错误公式恢复失败，已修正为无变化不再回滚、错误历史源码保留；正常公式仍走原来的恢复路径，溢出回归一并覆盖。

WASM 阶段：新增 `getDataValidation`／`setDataValidation`，规则修改进入既有历史。`dataValidations` 是 v1 快照的可选工作表元数据，缺省为空；非法坐标、重叠、重复表、错误规则在替换旧工作簿前拒绝。全量 WASM 原生 133 passed／1 ignored；实际 lite/full 已重建，两个产物均通过规则读写、输入拒绝、撤销重做、保存恢复以及计数型自定义公式只执行一次的检查。该阶段原生规则／输入／历史交叉回归为默认 59/59、lite 59/59，顺序命令退出 0；全量 Vitest 319 文件／5301 项通过，根构建、展现层边界及文档检查通过。

本次阶段性提交：值类型粘贴检查最终目标值，受限公式在同一批次写入后校验，失败在发布订阅通知前回滚；普通粘贴保持绕过交互校验。新增 6 项粘贴测试，连同规则／输入／历史及既有粘贴交叉回归共 43 项通过；重新运行全量 Vitest 319 文件／5301 项、根构建、文档、展现层边界与循环依赖检查通过。粘贴改动后的 WASM 产物重建与浏览器验收仍待完成，本次不标记整批完成。

[微软数据验证说明](https://learn.microsoft.com/en-us/office/dev/add-ins/excel/excel-add-ins-data-validation)区分直接输入、仅粘贴值和普通粘贴；不能把验证规则误当成阻断所有原生写入的数据库约束。实现前核对 `workbook_input.rs` 的用户输入入口、`clipboard_paste.rs` 的粘贴策略及既有历史事务，明确拒绝时的原子性，同时保证公式重算、初始化导入与撤销恢复不被错误阻断。高级公式／日期等验证类型仍保留在完整范围内，不归入本批三个功能。

### 两色色阶、三色色阶与数据条（本批已验收）

最终验收：原默认→lite 顺序命令退出 0；默认 3064 passed／10 ignored，lite 3024 passed／10 ignored，均 0 failed，均包含极小数中位数回归并已完成 Doc-tests。结合最终完整 E2E 664/664、全量 Vitest 5301/5301、WASM 原生 130 passed／1 ignored、实际 lite/full 构件检查与构建／静态门禁，本批三个功能验收完成。下方“待补”“运行中”等均为过程记录；极小数修正、补充测试与本记录尚未提交，整个 41 项计划仍未完成。

最终链路：React 表单 → 既有 UI Core command atom → Rust 规则／范围统计 → 一次显示投影 → React 绘制。范围统计复用原生派生 atom，给排名、色阶和数据条提供同一条依赖失效与释放路径；独立数据条显示值用于避免污染基础样式，React 组件只应用返回的坐标。没有新增 backend、传输层或 JavaScript 工作簿镜像。

提交状态：已按用户要求提交并推送为 `24510603`，提交门禁 238 文件／2878 项通过。续跑全量 Vitest 319 文件／5301 项通过；该提交的 CI 已全部成功，不能替代下方未提交修正的完整验收。

远端验收：[`24510603` 的 CI](https://github.com/allroad88888888/einfach-excel/actions/runs/38097406802) 已 completed／success，Node 22.12.0 和 24 的构建／测试作业均通过。下载 Rust 作业实际日志核对：基础 core 64 passed；Excel 默认 3063 passed／10 ignored，lite 3023 passed／10 ignored；WASM 原生 127 passed／1 ignored，Chrome WASM 7/7，均 0 failed，基准程序编译门禁也通过。此证据只对应已提交版本，不包含下面的极小数修正与三个新增持久化／wire 测试；修正版继续等待本地同一条完整回归命令，不重启、不冒用远端结果。

验收补查：1280px／390px 的规则表单及数据条截图已目视复核；当前机器无共享 visual-runtime 脚本，沿用持久 E2E 的截图、溢出、焦点和页面错误断言。实际 lite/full WASM 均验证了 SEQUENCE 溢出成员参与统计、保存恢复前后投影一致、基础样式没有混入数据条。

补查发现极小数中位数缺陷：对 `[0, 5e-324, 5e-324, 1e-323]`，原先把两个中间值分别减半会提前归零，导致中间色从红色偏成浅红。新增原生回归先在旧实现复现失败，再改为优先相加后减半、仅在和溢出时分别减半；正负极小数及巨大有限值均检查精确中间色。此前完整浏览器回归主动停止（118 passed、1 interrupted、545 未运行，退出 130），不记为通过。正在重建实际 WASM、运行修正后的 Rust 默认／lite 全量及最终浏览器回归；未开始下一批。

新增 [WASM 显示边界测试](../rust/wasm/src/wasm_tests/conditional_visuals.rs) 固定三类规则的完整持久化恢复、溢出成员统计及扁平 wire 结构。首次测试错误假设持久化 `formats` 数组会省略空表快照；修正为精确比较基础格式快照前后不变，而非断言整个数组为空，没有修改持久化实现。

修正后阶段验收：色阶／数据条／排名专项 19/19、WASM 原生 130 passed／1 ignored，均退出 0。实际 lite/full WASM 已重建，两种产物的正负极小数与大数中位数检查均通过。最终根构建、lint、类型、展现层边界、循环依赖、文档链接及差异检查通过；新增／主要修改文件均不超过 300 行。最终完整 E2E 为 664 项，已重新启动；Rust 默认→lite 顺序回归沿用同一任务继续执行。源码及 WASM 保持冻结，待两类完整结果完成再验收；这次极小数修正与补充测试尚未提交。演示服务 `http://127.0.0.1:5183` 返回 HTTP 200。

完整浏览器复核为 663 passed／1 failed（9.4 分钟）：唯一失败是旧整列统计测试仍假定 Summary D 列只有五个数值。D75:D79 新样例增加五个数、合计 25，因此正确结果是数值计数 10、和 61、平均 6.1、非空计数 18、最小值 -10、最大值 20。测试改为先逐格核对五个新样例，再验证全部六项精确统计；保留滚动后统计不变、屏幕外公式可见及跨表引用统计检查，并补充 D93 仍为 20 的断言，没有改变统计实现。统计／条件显示交叉专项后顺序重跑完整 664 项回归；Rust 全量继续沿用原进程，生产源码与 WASM 未再改变。

交叉专项 17/17（16.3 秒）通过，顺序命令已进入第三轮完整 664 项回归；文档链接与差异检查通过，最终结果待补。没有新增产品功能或自动提交这些修正。

最终浏览器验收：第三轮完整 E2E 664/664（9.3 分钟）通过，顺序命令退出 0。原整列统计用例通过全部精确断言，条件格式、冻结、合并、行列结构及剪贴板交叉全部通过。Rust 默认→lite 完整回归仍在原任务中继续运行，尚不能记为整批验收完成；生产源码和 WASM 保持不变，不开始下一批、不自动提交。

最终 WASM 重建后的全量 Vitest 再次通过：319 文件／5301 项（31.84 秒），后续文档及差异检查也通过，顺序命令退出 0。`24510603` 对应的 docs、Publish 和 CI 均已 completed／success；这次未提交修正的完整 Rust 验收仍待本地默认→lite 原任务结束。

Rust 默认配置已完整通过：188 个测试汇总／3064 passed／10 ignored、0 failed，包含极小数中位数回归，Doc-tests 已结束。原顺序命令的 `&&` 已进入 `--no-default-features`，证明默认配置命令退出 0；lite 全量仍在同一任务中编译／运行，尚不能计为通过。当前只剩 lite 的完整结果待验收，期间不改生产源码或 WASM。

本批实现这三个功能，示例位于 Summary C75:E79。范围极值、中位数、颜色插值及正负数据条几何由 Rust 计算，React 仅绘制返回的显示投影；不写入基础 cellStyle，不随普通格式复制。三色色阶默认以中位数为中点，数据条以零为轴；高级自定义阈值与渐变数据条不在本批范围。

已有 Rust 新增色阶／数据条专项 11/11、架构门禁 10 passed／1 ignored，UI Core／React 专项 42/42；实际 lite/full WASM 已重建且显示投影烟测通过。提交前根构建及循环依赖检查通过。浏览器专项初轮 33/34：合并用例错用了下拉占位文字作为控件名称；修正后专项 34/34（34.2 秒）通过，未修改生产合并逻辑或削弱断言。当前按用户要求保存并推送检查点，不将上一批的完整 E2E 或远端 CI 当成本批证据；本批完整 E2E 与 Rust 双配置全量验收仍待补。

上一批记录更正：`7a7a6840` 的完整 CI 已验证 Rust 双配置；本地重复 lite 复核在开始本批前主动停止（退出 130），未计为通过。下方“仍运行”“与当前生产代码一致”描述的是上一批当时状态，不适用于本批新增代码。

### 公式条件与排名（本批已验收）

提交状态：本批已按用户要求提交并推送至 `origin/main`，提交 `7a7a6840`；提交门禁 232 文件／2820 项通过。以下验收补充尚未提交；下方“未提交”是实施期间的阶段记录。

最终验收：修正等待条件后的完整 E2E 顺序命令退出 0，654/654（9.1 分钟）通过。结合全量 Vitest 5288 项、构建和静态门禁、实际 lite/full WASM 核对、截图，以及同一生产提交的完整 CI（Rust 默认 3052／lite 3012、WASM 原生 127、Chrome WASM 7），本批三个功能已验收。验收引用的是完整 CI 双配置证据；本地额外复核的默认配置也已完成并进入 lite，lite 仍运行，不把它记为已通过。整个 41 项计划仍未完成；工作区仅剩 E2E 等待条件修正与本记录，尚未提交。下方“待补”“未验收”等为过程记录。

推送后验收补充：最终全量单测→根构建→lint→展现层边界→循环依赖→文档链接的顺序命令退出 0，Vitest 317 文件／5288 项通过，循环依赖检查 678 模块／1887 依赖无违规。保留原 500 kB 构建提示，没有调高阈值。公式／排名的 1280px 与 390px 四张最终截图均已目视检查：规则列表独立滚动，输入框和提交按钮未被挤出屏幕，无横向溢出；持久 E2E 同时检查焦点恢复和页面错误。最终条件格式浏览器专项 24/24、原生边界专项 26 passed／1 ignored、WASM 原生 127 passed／1 ignored。

远端 [CI](https://github.com/allroad88888888/einfach-excel/actions/runs/38095697740) 已 completed／success，核对的提交为 `7a7a6840`，与当前生产代码一致。Node 22.12.0、24 构建和测试作业均成功；Rust 日志合计 core 64 passed、Excel 默认 3052 passed／10 ignored、lite 3012 passed／10 ignored、WASM 原生 127 passed／1 ignored、Chrome WASM 7 passed，均 0 failed，另有基准程序编译门禁通过。这是远端完整回归证据，不冒充本地结果；本地默认→lite 的额外复核仍保持原进程运行，等待记录最终结果。

完整浏览器首轮退出 1：652 passed／1 failed，失败在既有公式引用向下拖动测试，不是条件格式专项。失败 trace 显示滚动已超过 200px，但松手时引用终点为 E24；原测试把像素阈值错误等同于超过第 25 行。单独重复原场景 10/10 通过；新增 560px 高窗口并按 16ms 采样像素，旧等待条件可复现停在 E19。修正只涉及持久 E2E：保持鼠标按住，既检查像素滚动，也等待公式草稿真正越过原有行／列阈值；松手后继续校验焦点、最终引用和 Rust 计算结果，没有降低阈值、增加重试或修改生产行为。修正后该文件 6 场景各重复 10 次，60/60（55.2 秒）通过；顺序命令已进入完整 654 项回归。最终结果待补，不提前验收或开始下一批。

提交前核对：按用户要求提交并推送本批，不等待长时间全量回归结束。最终版本全量 Vitest 317 文件／5288 项、真实浏览器条件格式专项 24/24 及根构建已通过；实际 lite/full WASM 已重建并核对百分比向下取整、0%、相对公式、基础样式隔离及持久化恢复。全量 E2E、Rust 默认→lite 回归仍运行中，不据此宣布本批完整验收。下方“未提交”等是实施期间的阶段状态。

本批仅三个功能：公式条件、前／后 N 项、前／后百分比。沿用现有面板与单个 `conditionalFormat.change` 命令，Rust 校验、判断、历史和持久化仍是唯一权威；React 只保留表单草稿。公式以作用范围左上角平移相对引用，支持绝对／混合引用、跨表引用、错误处理及数字／布尔判断，不把结果写成基础 cellStyle。行列插删、工作表改名／删除及其撤销恢复会同步保留条件公式源，跨表修订号耗尽在任何写入之前拒绝。

排名只统计整个作用范围中的有限数值（含公式结果），忽略文本、布尔、错误和空白，包含阈值并列项。N 的范围为 1–1000；百分比为 0–100，数值成员数乘百分比后**向下取整**，0 项不高亮。该边界以[微软 CT_CfRule 规范](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/025ea6e4-ad42-43ea-a016-16f4e4688ac8)及[Apache POI 的排名实现](https://github.com/apache/poi/blob/trunk/poi/src/main/java/org/apache/poi/ss/formula/EvaluationConditionalFormatRule.java)核对。公式相对原点依据[微软条件格式说明](https://www.microsoft.com/en-us/microsoft-365/blog/2012/02/27/conditional-formatting-rules-simplified/)。早期向上取整实现已纠正，对应测试和种子说明同步修改，不把旧测试通过当作最终验收。

排名阈值复用 Rust Store 派生 atom 与既有稀疏范围读取器；滚动和无关数据编辑不会重排整个范围，成员增加、删除或公式依赖变化会使原生依赖失效。规则替换、移除或工作表删除时释放阈值 atom；没有 JS 数据镜像、额外 backend 或第二套依赖图。公式谓词直接复用原生求值器，只读显示窗口；架构门禁按文件明确限定“名称定义／只读条件谓词”两个顶层用途，并继续限制单元格公式唯一入口及禁止谓词写入／存储工作簿结果。

演示仍用 Summary 原有数据：D65:D67 根据相邻 C 列大于 3 显示蓝色；E65:E67 中最高 1 项（6）为绿色，最低 50% 向下取整为 1 项（2）为黄色。三类规则均可使用上一批复制、启停、排序及原生撤销。规则目录独立滚动，避免挤出表单；继续做 1280px／390px 截图与焦点检查。本机未找到共享视觉脚本，使用持久 Playwright 截图、溢出和 pageerror 断言。

阶段结果：原生新增／既有条件专项 40 项、架构 10 passed／1 ignored、WASM 原生 127 passed／1 ignored、UI Core／React／种子专项 40 项、全量 Vitest 5288 项通过；上一轮真实浏览器专项 23/23 通过。之后补充了工作表引用浏览器场景、规则列表布局及百分比边界，因此这些结果不是最终验收。旧 Rust 全量进程因修正百分比语义主动停止（退出 130）；修正后的专项→默认→lite 顺序回归及两套 WASM 重建已启动，继续等待并补跑最终浏览器、构建与静态门禁。未提交，不进入第四个功能。

### 条件规则管理（本批已验收）

提交状态：本批已按用户要求提交并推送至 `origin/main`，提交 `66d029af`；提交门禁 231 文件／2804 项通过。下方“未提交”是实施期间的历史记录。

最终验收：原默认→lite 顺序命令退出 0；默认配置 3030 passed／10 ignored，lite 配置 2990 passed／10 ignored，均 0 failed，Doc-tests 完成。结合完整 E2E 644/644、Vitest 5279/5279、WASM 原生 126 passed／1 ignored、实际两套 WASM 的管理／历史／持久化核对、构建及静态门禁，本批三个规则管理功能验收完成。整个 41 项计划仍未完成，本批代码与记录尚未提交。下方“进行中”“等待”等为实施期间的阶段记录。

本批仅三个功能：复制已有数值规则、启用／停用、按显示优先级上移／下移。复用 Conditional formatting 面板；目录按实际优先级排列，上端优先。复制生成独立 ID 并保留范围、条件、样式和启停状态，插在原规则之后；停用不删规则、不修改基础样式。上下移动只交换相邻顺序，Rust 一次重排目录并进入一条历史；相同优先级及 i64 极值也能安全处理，边界移动和重复启停不增加原生修订号或历史。未支持的旧规则可保留原文并排序，不伪装为已支持的复制／启停。

最短链路仍是 React 按钮 → `runNativeConditionalFormatAtom` → 既有 Worker `conditionalFormat.change` → 原生 `manage_conditional_format_rule` → 同一次可见投影。复用既有目录、历史与命令；没有新的 backend、规则仓库或 TS 条件计算。数值规则的可选 `enabled` 缺省为 true，Rust 解析严格拒绝非布尔值，显示投影跳过停用规则。新增文件仅为原生管理测试与持久浏览器管理测试；修改文件按职责扩展，主要历史实现 224 行、React 面板 117 行、UI Core 面板 144 行。

演示种子仍在 Summary C65:C67：原红色规则大于 3；新增大于 1 的蓝色规则默认停用。启用蓝色后 2 变蓝、4 和 6 保持红色；把蓝色上移后 4 和 6 也变蓝；撤销一次恢复原优先级。没有增加数值记录或把演示规则写进生产视图。

阶段验证：Rust 管理、历史、投影及 API 架构专项 29 passed／1 ignored；WASM 原生 126 passed／1 ignored。UI Core／React／种子专项 33/33，真实浏览器专项 15/15（15.9 秒，含上批 9 项与本批 6 项）通过。lite/full 两套实际 WASM 均已重建，新增一个原子管理入口。1280px／390px 截图已目视检查，规则操作按钮不溢出，焦点与 Escape 正常；本机无共享视觉脚本，使用持久 E2E 的截图、溢出和 pageerror 断言。

完整 E2E、默认→lite Rust 回归、全量单测、构建及静态门禁已启动，等待最终结果，不提前验收或进入下一批。本批未提交；整个 41 项范围与公式条件、数据条、色阶、Top/Bottom、stop-if-true 及格式刷携带规则等剩余能力继续保留。

收尾进度：全量 Vitest 已退出 0，317 文件／5279 项通过；根构建退出 0，包含 UI Core 与 React 类型检查。主 JS 555.53 kB（gzip 159.97 kB），保留原 500 kB chunk 提示，不改阈值。直接加载实际 lite/full WASM，各自验证复制独立 ID、启停、排序、单条历史、撤销重做、无变化不写、过期写入拒绝与持久化恢复，全部通过。服务 `http://127.0.0.1:5183` HTTP 200。完整浏览器和 Rust 双配置测试仍是原进程执行中，等待最终验收；没有启动第四个功能。

静态门禁完成：lint、展现层边界和循环依赖顺序命令退出 0，循环依赖检查 678 模块／1887 依赖无违规；文档链接及 diff 检查通过。新增／主要修改文件均低于 300 行，本批不增加中间层。

完整浏览器验收：原 E2E 命令已退出 0，644/644（9.4 分钟）全部通过，包括规则管理、既有格式、剪贴板、导航和工作表历史。等待期间未改生产代码或重启任务。

原生默认配置已完成：3030 passed／10 ignored、0 failed，Doc-tests 已结束；原默认→lite 顺序命令已进入 lite，证明默认命令成功退出。当前只剩同一进程的 lite 全量结果，本批保持未完全验收、未提交，不开始下一批。

### 数值条件格式（本批已验收）

提交状态：实现已按用户要求提交并推送至 `origin/main`，提交 `deebb8ee`；提交门禁 237 文件／2848 项通过。推送后原 Rust 回归顺利结束，本次验收记录补充尚未提交。下方“未提交”“进行中”均为实施期间的历史状态。

最终验收：原默认→lite 顺序命令退出 0；默认配置 3023 passed／10 ignored，lite 配置 2983 passed／10 ignored，两种配置均 0 failed，包含 Doc-tests。结合完整 E2E 638/638、Vitest 5264/5264、WASM 原生 124 passed／1 ignored、实际 lite/full 产物核对、构建与静态门禁，本批新增／修改／删除数值条件规则全部验收完成。等待期间未重启测试或修改生产代码。整个 41 项计划仍有未完成项，继续按批次推进。

本批三个功能：新增数值条件规则、修改已保存规则、删除规则。工具栏 Conditional formatting 打开同一面板，支持等于／不等于／大于／大于等于／小于／小于等于／区间内／区间外，设置作用范围、填充色与文字色；新增规则优先于旧规则，修改保留原优先级。每个保存／删除进入同一 Rust 历史栈，取消只丢弃草稿。空白、文本（含文本数字）、布尔值和错误不作为数值匹配；区间包含两个端点，非法数字与倒置上下界由 Rust 拒绝。

最短链路：React 表单 → `runNativeConditionalFormatAtom` → 既有 Worker `conditionalFormat.change` → Rust 规则命令／历史 → 一次可见投影 → React。规则目录随投影返回；UI Core 仅保存面板草稿，没有新的 backend、bridge、规则数据库或 TS 条件计算。原生 `snapshot_display_format_range` 在窗口内读取当前数值／公式结果，只覆盖返回快照；持久 cellStyle／rowStyle／columnStyle 与基础格式快照不变，不会把 A1:A100 拆成多个颜色片段。行列插删只重定位规则几何，复用筛选区间的位移运算，并纳入结构历史；修订号耗尽在任何写入之前拒绝。

文件职责：原生 numeric 只解析和判断数值规则，projection 只生成显示快照，history 只记录规则变动，structure 只重定位规则范围；Worker IO 只校验目标并直调 WASM。React 组件只显示规则与收集表单事件。新增源码／测试均低于 300 行；原有 runtime 已是超过 300 行的分派文件，本批仅增加直接命令分支，不借此扩展重构范围。

演示原始规则位于 Summary 的 C65:C67：数值 2 不高亮，4、6 为浅红填充／深红文字。规则通过启动数据写入 Rust，启动历史清空；改 C66 为 1 后高亮消失，撤销恢复。没有增加第二套假数据或写死坐标样式。

阶段验证：Rust 数值投影与历史专项 12/12；WASM lite/full 均重建，新增一个显示快照 API。UI Core／React 专项与种子定义测试初版 15/15，全量 Vitest 初版 5263/5263；随后增加投影目录形状回归，最终检查进行中。真实浏览器专项 9/9（10.4 秒），覆盖增删改、撤销重做、重叠优先级、值／公式重算、失败草稿、结构移动、冻结／合并区和 1280px／390px 截图。截图已目视检查；共享视觉脚本不在本机，使用持久 E2E 的溢出／焦点／pageerror 断言与截图代替。

完整 E2E、Rust 默认→lite 全量回归、最终单测与静态门禁正在运行，不提前记为验收通过，不启动下一批。本批尚未提交。公式条件、数据条、色阶、Top/Bottom、规则优先级编辑及格式刷／复制携带规则等尚未闭环；旧持久化中未实现的规则原文继续保留，不能以保存 JSON 或数值规则通过代替这些功能。整个 41 项计划继续保留。

静态与单测收尾：最终全量 Vitest 317 文件／5264 项通过，随后类型修正及纯格式调整后的专项 16/16；根构建、UI Core／React 类型、lint、展现层边界、循环依赖（678 模块／1887 依赖）、文档链接与 diff 检查通过。根构建主 JS 554.25 kB（gzip 159.69 kB），仍保留 500 kB chunk 提示，未改阈值。Rust 数值条件＋结构历史＋架构交叉 39 passed／1 ignored，WASM 原生 124 passed／1 ignored；直接加载两套实际 WASM，条件高亮、基础样式隔离、撤销重做、持久化恢复、重算和过期写入拒绝均通过。服务 `http://127.0.0.1:5183` 确认 HTTP 200。完整 E2E 与 Rust 默认→lite 原任务仍在运行，本批继续保持未验收、未提交。

完整浏览器验收：原 E2E 命令已退出 0，638/638（9.5 分钟）全部通过，包含本批 9 项及既有剪贴板／格式／导航／工作表回归。本次续跑仅修正文档中的旧状态，没有修改生产代码或重启测试。Rust 默认→lite 顺序命令仍在原进程执行，当前还在默认配置集成测试阶段；继续等待双配置最终结果，不提前标为整批验收完成，不开始下一批。

原生默认配置已完成：3023 passed／10 ignored、0 failed，Doc-tests 也已结束；原顺序命令已进入 lite 配置，确认默认命令成功退出。只剩同一进程的 lite 全量结果待验收，未重新启动或缩小测试范围。本批继续保持未完全验收、未提交状态。

### 快捷公式（本批已验收）

提交状态：本批已按用户要求提交并推送至 `origin/main`，提交 `c972546c`；提交门禁 192 文件／1890 项通过。下方保留实施期间的阶段记录，其中“未提交”是当时状态，不是当前状态。

本批仅三个函数入口：SUM 求和、AVERAGE 平均值、COUNT 数值计数。工具栏 Σ 默认求和，旁边 Quick formula 可选择三个函数。选中一段数据，或紧贴数字下方／右侧的空白格，即可在现有公式栏得到草稿；Enter 或既有失焦提交写入，Escape 取消。确认前不写工作簿、不创建历史；确认后复用 `cell.setInput` 的原生事务、重算、投影和撤销重做。

原生推断规则：空白单格先找紧邻上方的连续数值，再找左侧，遇到文本／空白／错误就停止，不跨空行猜范围；显式单行选区使用右侧空格，其它矩形生成一个汇总公式，结果放在左下方。末列／末行已空时复用，不自动覆盖已有内容；空字符串或返回空文本的公式仍算内容。整个源区最多 100,000 格，超画布、合并源区／目标、溢出目标、隐藏目标明确拒绝。普通 SUM／AVERAGE／COUNT 保留标准范围计算语义，并非忽略筛选行的 SUBTOTAL，也不等同 Excel 多列批量自动求和。

调用链：React 选择函数 → UI Core `runQuickFormulaAtom` → 既有 Worker `formula.suggest` → Rust 只读建议 → 既有 `startEditingAtom` → 公式栏 → 原有提交链。Rust 文件只负责范围推断；WASM 文件只做严格参数转换；新增 UI Core 命令只负责操作防重、过期响应校验、目标保护和启动草稿；React 组件只收集事件并显示反馈，没有新增 TS 计算、提交协议或数据副本。原有 Worker runtime 是存量 397 行文件，本批仅增加直接分发分支，不顺手重构。

演示数据：Summary 的 C65:E67 各为 2、4、6；C68、D68、E68 留空供操作，C70:E70 是三个原生公式样例，显示 12、4、3。进入 C68 点击 Σ，或 D68／E68 选择 AVERAGE／COUNT；确认后改对应第 65 行，结果应重算，撤销可恢复。

阶段证据：Rust 专项 9/9，WASM 原生 122 passed／1 ignored，API 架构门禁 10 passed／1 ignored，lite/full 实际 WASM 均重新构建。UI Core／React 初版专项 22/22、全量 Vitest 5245/5245，另补数据版本回归待最终复测。真实浏览器专项 9/9（8.8 秒）覆盖草稿、确认、取消、改写公式、撤销／重做／重算、只数数值、隐藏／合并／已有内容及边界。第一轮发现 pending 提示改变布局后产生新投影，被对象身份检查误拒绝；已改为核对 Rust 数据版本和选区，保留导航／编辑／断连的迟到结果保护。桌面 1280px／窄屏 390px 截图已检查，公式栏可见且焦点可用；共享视觉脚本不可用，使用持久 Playwright 截图及 DOM／pageerror 断言。

完整 E2E 与 Rust 默认→lite 全量回归正在运行；本批未提交，不提前填写通过或启动下一批。整个 41 项计划继续保留。

静态收尾：补齐版本回归后，全量 Vitest 313 文件／5247 项通过，新增专项合计 24 项；lint、展现层边界、循环依赖（673 模块／1872 依赖）、主线类型、根构建、文档链接和 diff 检查通过。新增源码／测试各文件均低于 300 行。根构建主 JS 545.87 kB（gzip 157.61 kB），保留 Vite 500 kB chunk 提示，未修改阈值。服务 `http://127.0.0.1:5183` 已确认 HTTP 200；两个长测试任务仍在原进程运行，完整验收结果待补。

完整 E2E 首轮终态为 627 passed／2 failed（9.2 分钟），不能作为验收通过：Summary D 列新增 2、4、6 和平均值 4 后，旧统计预期应由一个数值 20 更新为五个数值、和 36、平均 7.2；另一项定位后立即冻结的场景，独立重复 8 次复现 1 次失败。冻结命令在菜单 disabled 尚未跟上当前窗口 loading 时会直接拒绝事件；冻结只依赖坐标和画布，现允许当前同表的在途窗口读取，先读后写仍由既有投影入口处理，没有增加刷新或重试层。新增确定性单测覆盖该时序，冻结 UI Core／React 14/14、浏览器连续重复 12/12、快捷公式／定位／统计交叉 E2E 28/28 通过。修正后根构建再次通过，完整 E2E 已重新启动；Rust 源码未变，仍等待原默认→lite 测试任务，未重启。

冻结修正后的全量 Vitest 313 文件／5248 项通过（原命令退出 0），修改文件 lint、主线类型、展现层边界、循环依赖及根构建通过。当前主 JS 545.89 kB（gzip 157.62 kB），仍保留体积提示。最终 E2E 与原 Rust 双配置回归尚在执行，本批继续保持未验收、未提交状态。

实际产物补充核对：直接加载本次构建的 lite/full `.wasm`，两种产物各验证 SUM／AVERAGE／COUNT 的原生建议、建议不写目标或历史、确认生成单条历史、撤销／重做、修改源值后重算及非法函数拒绝，6 组全部通过。该检查只在新建的临时内存工作簿上执行，不修改演示数据；它用于确认产物包含新接口，不替代持久 E2E、单测或仍在运行的 Rust 全量回归。

最终完整 E2E 已退出 0：629/629（8.9 分钟），包括上轮失败的冻结时序和整列统计；这轮运行期间没有再修改生产代码或 WASM。Rust 默认全量已完成：3011 passed／10 ignored、0 failed，原顺序命令已进入 lite 配置，证明默认命令成功结束。当前只剩同一任务的 lite 全量结果待验收，不重启、不先写通过；本批未提交，未开始下一批。

最终原生验收：原默认→lite 顺序命令已退出 0，lite 为 2971 passed／10 ignored、0 failed；默认配置为 3011 passed／10 ignored、0 failed。结合完整 E2E 629/629、Vitest 5248/5248、WASM 原生 122 passed／1 ignored、实际 lite/full 产物核对、构建及静态门禁，本批三个快捷公式功能验收完成。期间保留原测试进程，没有重启或缩小测试范围；所有实现及本次冻结竞态修正仍未提交。完整 41 项计划及公式目录、动态名称等剩余范围继续保留，不将本批完成当作整个项目完成。

### 地址定位（本批已验收）

本批三个功能：A1／R1C1 地址或区域定位、带工作表名前缀的跨表定位、最近 10 次定位。工具栏 Go to、F5、Ctrl/⌘+G 打开同一弹窗；React 只读既有定位 atoms 并派发 `runGoToReferenceAtom`，命令复用地址解析器、工作表激活、选区与滚动；可见值继续由原 Rust Worker 投影读取，没有新增工作簿镜像、TS 计算或写入 RPC。普通定位不创建撤销记录，不擅自提交编辑草稿，也不自动取消隐藏。

最近记录是会话内去重的绝对地址，带当时的工作表名；相对 R1C1 再次点击不会漂移。工作表改名使旧地址无法解析时明确报错，用户可输入新名字；这些文本地址不是动态命名区域或持久版本。无效地址、未知表及超出当前画布的地址在切表前拒绝，不把它们夹取到边界。解析器补齐 `$A$1` 及转义单引号后紧跟 `!` 的表名。既有 Go To Special 的 TS 扫描入口未接入 React，这一批只复用会话和地址解析，不宣称 Special 完成。

试用：Sales Orders 输入 `B40:D42`，再输入 `R[2]C[-1]` 到 C44；输入 `Summary!B2` 可看到 Rust 跨表公式返回 `Acme Co.`；点击最近的 `'Sales Orders'!C44` 返回原位置。`R1001C16` 到演示画布最后一格 P1001。此批仅增加导航 UI 状态，复用原演示种子，没有新增坐标特判或持久数据。

当前证据：UI Core／React 定向 116/116（含既有解析器 90 项），全量 Vitest 5223/5223、310 文件；最终专项 E2E 12/12，覆盖 1280px／390px 截图、焦点循环、F5／Ctrl+G／⌘+G、无历史、隐藏／合并／冻结、跨表视图记忆、输入法组合 Enter 及旧表名报错。初次浏览器用例的种子文本与演示列数预期写错，已依据原种子修正，不改变产品行为；类型检查还发现测试误用 Playwright 的 `exact` 选项，修正后根构建通过。生产 Rust／WASM 本批未改动；不把上一批 Rust 测试数字当作本批新增原生行为证据。

桌面／窄屏截图已复核，无横向溢出，操作按钮和键盘焦点可见；共享 visual-runtime 脚本在技能目录不可用，采用持久 Playwright 截图、溢出、焦点与 pageerror 断言。新增源码文件均低于 300 行。根构建成功但主 JS 为 542.90 kB（gzip 156.83 kB），有 Vite 500 kB chunk 提示，未提高阈值隐藏提示。完整 E2E 已启动，功能代码冻结等待结果；不开始下一批。本批尚未提交。

静态收尾：最终 lint、展现层边界、循环依赖（670 模块／1855 依赖）、类型、根构建、文档及 diff 检查均通过；格式／测试类型修正后定向 116/116 再次通过。完整回归本次共 620 项，在同一进程中继续运行，未提前记录通过。

最终验收：完整 E2E 620/620（8.3 分钟，原命令退出 0）通过，期间生产源码与 WASM 保持不变。本批三个功能验收完成，新增代码及本次／前批最后的验收记录尚未提交；服务 `http://127.0.0.1:5183` 已确认 HTTP 200。最短链路为 React DOM → 定位 command atom → 既有选区／切表／滚动 atoms → 既有 Rust 可见窗口投影；新增命令只集中解析与目标校验，弹窗只负责 DOM 和焦点，没有新增计算或传输层。#06 的非连续多区／Special 等剩余工作及整个 41 项范围继续保留。

提交记录：地址定位及此前去重批次的最终验收记录已按用户要求提交并推送至 `origin/main`，提交 `2df630a7`。提交钩子的 164 文件／1635 项测试通过；未把下一批尚未完成的 Rust 快捷公式草稿混入该提交。

| 批次 | 功能 | 证据 / 状态 |
| --- | --- | --- |
| 既有基线 | 编辑、导航、选择、常用格式 | `736a2109` 及其前序提交；相关 `test/`、`e2e/` |
| 数字精度 | 增加小数位、减少小数位、恢复常规 | `736a2109`；`e2e/format/number-precision.spec.ts` |
| 表头选择 | 整行、整列、整表 | `736a2109`；`e2e/selection/header-selection.spec.ts` |
| 清除操作 | 清除内容、清除格式、全部清除 | `094f8ba7`；`e2e/editing/clear-selection.spec.ts` |
| 基础剪贴板 | 复制、同表剪切、矩形粘贴 | `42dd8505`；`e2e/editing/system-clipboard.spec.ts` |
| 粘贴选项 | 仅粘贴值、仅粘贴格式、选区平铺 | `42dd8505`；`e2e/editing/paste-special.spec.ts` |
| 粘贴变换 | 转置、跳过空白、值及格式 | `4ba9c57a`；`e2e/editing/paste-options.spec.ts` |
| 编辑输入 | 原始数值、输入法组合键保护、Alt+Enter 换行 | `4ba9c57a`；`e2e/editing/input-semantics.spec.ts` |
| 输入类型 | 强制文本、布尔值、百分比输入 | Rust 实现 `4ba9c57a`；回归、公式栏错误提示与边界补充 `7dd12e68` |
| 公式粘贴 | 仅公式、公式及数字格式、值及数字格式 | `7dd12e68`；`e2e/editing/paste-formula-modes.spec.ts` |
| Copy As | 纯文本、Markdown、HTML 表格 | `7dd12e68`；`e2e/editing/copy-as.spec.ts` |
| 工作表标签 | 新增、切换、重命名 | `481d7c7b`；`e2e/workbook/sheet-tabs.spec.ts` |
| 工作表结构 | 删除、向左移动、向右移动 | `481d7c7b`；`e2e/workbook/sheet-structure.spec.ts` |
| 行列尺寸 | 输入行高、输入列宽、恢复默认尺寸 | `42d760a1`；`e2e/format/selection-sizes.spec.ts` |
| 原生编辑历史 | 撤销、重做、最近操作列表 | 接入 `42d760a1`；测试及快捷键修正 `2af12dad`；`e2e/editing/history.spec.ts`、`e2e/editing/history-mutations.spec.ts` |
| 剪贴板历史 | 普通粘贴撤销、选择性粘贴撤销、同表剪切撤销 | `2af12dad`；`e2e/editing/clipboard-history.spec.ts` |
| 工作表历史 | 重命名撤销、移动撤销、增删表撤销 | `6cd5a12e`；`e2e/workbook/sheet-history.spec.ts` |
| 粘贴运算 | 加法、减法、乘法粘贴 | `b32b416a`；`e2e/editing/paste-arithmetic.spec.ts` |
| 粘贴组合 | 除法、组合选项面板、仅列宽 | `b32b416a`；`e2e/editing/paste-special-dialog.spec.ts`、`e2e/editing/paste-column-widths.spec.ts` |
| 行列隐藏 | 隐藏行、隐藏列、恢复隐藏行列 | 基础 `d271d095`；收尾 `aa102ded`，`e2e/format/visibility*.spec.ts` |
| 行列插删 | 插入行、插入列、删除所选行列 | 底层 `0849e27f`；界面见行列插删功能提交，`e2e/workbook/row-column-structure.spec.ts` |
| 合并单元格 | 合并、合并后居中、取消合并 | 阶段 `cb99acfc`；收尾见[验收记录](docs/merge-wave.md)，全量 E2E 216/216 |
| 冻结窗格 | 冻结首行、首列、按当前格冻结／取消冻结 | 界面 `0023ee98`；收尾 `55e7b244`，React 150/150、全量 E2E 234/234，见[验收记录](docs/freeze-wave.md) |
| 尺寸交互 | 拖拽行高、拖拽列宽、自动适应 | 拖拽与原生基础 `55e7b244`；自动适应 `df8224e6`，全量 Vitest 2602/2602、E2E 245/245，见[本批记录](docs/size-interaction-wave.md) |
| 查找替换 | 查找定位、替换当前、全部替换 | 主链路 `012a26e1`；键盘／截图验收补充随查找结果批次提交，既有全量 E2E 256/256 + 新增 2/2，见[本批记录](docs/find-replace-wave.md) |
| 查找结果 | 通配符、查找全部列表、点击定位 | `36cdc3de`；专项 E2E 15/15、全量 E2E 263/263，见[本批记录](docs/find-results-wave.md) |
| 状态栏统计 | 数值计数、求和、平均值；非空计数、最小值、最大值 | 主链路 `44908983`；布局收尾 `818817b0`，专项 22/22、全量 E2E 270/270，见[本批记录](docs/status-bar-wave.md) |
| 状态栏交互 | 显示项配置、恢复默认、复制统计 | `818817b0`；Vitest 2593/2593、全量 E2E 276/276；包含底栏尺寸变化的贴边修复，见[本批记录](docs/status-bar-wave.md) |
| 定向填充 | 向下填充、向右填充、键盘入口 | 底层 `d3128c72`；界面与验收 `3a943ff2`，Vitest 2611/2611、全量 E2E 287/287，见[本批记录](docs/directional-fill-wave.md) |
| 序列填充 | 数值等差、文本编号、线性趋势 | `3a943ff2`；Vitest 2626/2626、全量 E2E 297/297，见[本批记录](docs/fill-series-wave.md) |
| 填充柄 | 四方向拖拽、自动数字／编号、Ctrl/⌘ 复制 | `d8ecb165`；Vitest 2649/2649、全量 E2E 314/314，含四边自动滚动与首帧定位修正，见[本批记录](docs/fill-handle-wave.md) |
| 名称序列 | 星期、月份、自定义顺序列表 | 实现 `d8ecb165`，验收记录 `fa25958f`；Vitest 2661/2661、全量 E2E 326/326，见[本批记录](docs/fill-named-series-wave.md) |
| 日期 | 无歧义日期输入、日期格式、日／周／月序列 | `fa25958f`；Vitest 2665/2665、全量 E2E 340/340，原生输入／显示／公式／填充共用 1900 日期基准，见[本批记录](docs/date-input-wave.md) |
| 构建收尾 | Rust 门禁及失效数组投影 | `c8e5a0d2` 已推送，远端 Rust/Node 22/Node 24 CI 全绿；审查更新 golden，未重生成 |
| 排序 | 升序、降序、多列排序 | 随本次排序提交归档；Vitest 4726/4726、全量 E2E 350/350，随后排序专项 11/11（含新增剪贴板交叉用例），见[排序记录](docs/sort-wave.md) |
| 筛选入口 | 条件筛选、重新应用、清除筛选 | 随本次筛选提交归档；原生历史只存条件与隐藏集合。全量 Vitest 4741/4741、E2E 361/361（含筛选 10 项）；同时修复并补测公式栏屏幕外输入竞态 |
| 筛选交叉 | 复制排除筛掉行、排序保留筛掉行、统计排除筛掉行 | 随本次提交归档；Rust 专项 7 项、全量 Vitest 4747/4747、全量 E2E 369/369（含本批 8 项）通过 |
| 筛选区域 | 指定区域、表头条件入口、清除单列条件 | 基础 `a53d0193`；收尾修正随本次提交归档，Vitest 4755/4755、最终全量 E2E 378/378，含冻结表头及真实 Worker 受控竞态 |
| 公式引用 | 点击引用、拖选范围、F4 切换锁定 | `dcff7b5f`；公式专项 E2E 12/12，含冻结区、横纵自动滚动、两种输入入口、复制与撤销；随后全量 E2E 390/390（7.1 分钟）通过 |
| 公式辅助 | 函数候选、键盘选择补全、当前参数提示 | `db790e99`；提交时全量 E2E 396/398。布局收尾随本次提交归档：Vitest 4781/4781、专项 E2E 25/25、最终全量 E2E 400/400（7.1 分钟），本批验收通过 |
| 公式键盘引用 | 方向键拾取、Shift 扩展、F2 文字/引用模式切换 | `89f303f9`（含布局收尾）；全量 Vitest 4798/4798、引用交叉专项 E2E 26/26、本批最终新增用例 10/10；最终全量 E2E 410/410（7.2 分钟）通过 |
| 跨表公式引用 | 点击单格、拖选范围、键盘移动/扩展 | `6267adcc`；最终全量 Vitest 4816/4816、最终全量 E2E 421/421（7.3 分钟，含本批 11 项）通过，构建及静态门禁通过 |
| 颜色选择 | 填充色、文字色、恢复无填充/自动文字色 | 基础 WIP `f6426374`，收尾随本次快照归档；本批完成时全量 Vitest 4850/4850、全量 E2E 432/432（7.5 分钟）及根构建/静态门禁通过 |
| 对齐选择 | 水平对齐、垂直对齐、文字旋转 | 基础快照 `92c93dcd`；收尾 `1b74df19`，专项 E2E 10/10、全量 Vitest 4892/4892、全量 E2E 442/442（7.7 分钟）、根构建及静态检查通过 |
| 字号选择 | 自定义字号、增大字号、减小字号 | `1b74df19`；全量 Vitest 4939/4939、Rust 默认/lite 与 WASM 原生测试、构建及静态检查通过；字号专项 E2E 13/13，全量 E2E 455/455 |
| 数字格式设置 | 数字精度/千分位、百分比精度、货币符号/精度 | `11b0ed08` 已推送；全量 Vitest 4978/4978、数字格式专项 E2E 20/20、全量 E2E 469/469（8.2 分钟）、根构建与静态检查通过 |
| 扩展数字类别 | 科学计数、分数、时间显示 | `11b0ed08` 已推送；全量 Vitest 5001/5001、专项 E2E 24/24、全量 E2E 479/479（8.4 分钟）、Rust 默认/lite 与 WASM 原生、根构建及静态检查通过 |
| 时间／分数输入 | 24 小时／累计时长、AM/PM、显式带分数 | `870aa5b4` 已推送；Rust 专项 5/5、Vitest 5019/5019、专项 E2E 13/13、全量 E2E 492/492（8.7 分钟）、Rust 默认/lite、WASM 原生、构建及静态检查通过 |
| 格式刷 | 单次刷格式、连续刷格式、取消刷格式 | `870aa5b4` 已推送；专项 Vitest 36/36、全量 Vitest 5020/5020、专项 E2E 14/14、全量 E2E 506/506（8.9 分钟）、WASM 原生、构建及静态检查通过；公开 API 签名遗漏随边框批修复 |
| 边框设置 | 选区边框位置、线型、颜色 | 入口批次已验收，随 `53db0e67` 推送；专项 E2E 33/33（含格式刷回归）、全量 E2E 525/525（9.3 分钟）、全量 Vitest 5062/5062、Rust 默认/lite、WASM 原生、根构建与静态检查通过 |
| 共边一致性 | 后写覆盖相邻边、清除及一次撤销、冻结接缝只画一条 | 实现已随 `46094f9e` / `d8a8bec8` 推送；最终全量 E2E 557/557（7.3 分钟）、Vitest 5073/5073、Rust 默认 2920/lite 2880/WASM 108 passed、根构建和静态检查通过；旧浏览器崩溃诊断及测试环境升级随本次验收记录提交 |
| 数字格式会话扩展 | 日期样式、文本格式、Rust 原生预览 | 实现随 `fc118e1a` / `e9a7e432` 推送，含 Summary A96:C96 样例；Vitest 5106/5106、Rust 默认 2932/lite 2892/WASM 111 passed。旧统计测试种子坐标冲突修正后，交叉专项 16/16、最终全量 E2E 569/569（7.5 分钟）通过；远端 Rust/Node 22/Node 24 CI 全绿。测试修正与验收记录随 `99adb7ff` 提交 |
| 工作表视图记忆 | 各表选区、横纵滚动、跨表公式临时视图隔离 | 基础随 `99adb7ff` 推送；首帧竞态修复后，专项 30/30、全量 Vitest 5126/5126、最终完整 E2E 578/578（7.6 分钟）、根构建与静态门禁通过；收尾修复随 `a0fdd727` 提交并推送 |

早期批次详细验收记录见 [历史说明](docs/early-feature-waves.md)；上面的全范围与批次账本仍为当前索引。

## 接下来

合并三项及冻结三项交互已验收；冻结界面提交为 `0023ee98`，编辑遮挡／菜单等待态收尾为 `55e7b244`，见[验收记录](docs/freeze-wave.md)。
填充柄及名称序列实现已随 `d8ecb165` 提交，名称序列全量验收通过。
日期输入、原生显示、日期序列已接入同一 Rust 1900 日期基准，全量验收通过，见[日期记录](docs/date-input-wave.md)。
日期与构建修复已分别随 `fa25958f`、`c8e5a0d2` 提交推送。
排序三项已随 `dedfe162` 提交推送。用户随后要求按批次持续推进整个计划；每批三项完成验证再进入下一批，不自动 commit/push。
早期筛选入口复用 Rust 的整表已用行扫描：首行保留、条件按 AND 组合，编辑后显式重新应用；指定区域为后续独立批次。
全量回归发现并补测公式栏的屏幕外定位输入竞态：未读到原值时禁用输入，已有草稿仍可编辑；用共享投影读取取代 React 自行查找原值。
筛选批次验收：Rust 默认与 lite 测试、WASM 原生测试（102 通过、1 忽略）、双版本 WASM 构建、bench check、lint、循环依赖、展现层边界、UI Core 构建、React 类型检查与构建均通过；日期编辑 E2E 连续 10 轮共 30 项通过。
手测：Sales Orders → Filter → C 列 Equals West，应筛掉 750 行；复用既有 1,000 条种子记录，不改默认数据。跨表 SUBTOTAL 由专项 E2E 现场创建验证，避免引入整列引用后阻塞既有的部分范围剪切。
筛选入口已随 `9f76a0ae` 提交推送。当前交叉批次仍走现有复制/排序/统计命令：Rust 快照保留复制格的真实源行，压紧粘贴、转置、平铺的相对公式按各自原位置平移；Copy As 三种编码共用原生筛选集合。排序、六项统计只排除筛掉行，手动隐藏行仍参与。
边界：空筛选结果拒绝复制；部分可见的合并块要求先取消合并；含筛掉行的剪切明确拒绝（包括剪切后才应用筛选），不暗中删除不可见源数据。粘贴目标仍是既有连续矩形，不宣称支持“仅粘到可见行”。
手测：Sales Orders 按 C=West 筛选后，复制 A2:A1001 得到 250 条（SO-10004 到 SO-11000）；E 列统计为 250 个数值、合计 3,484、平均 13.936；A2:P1001 降序只置换 West 的 250 个位置，清除筛选后其它记录仍在原位置。复用原有 1,000 条种子，不增加新 demo 数据。
交叉批次新增文件仅为专项测试，生产逻辑没有新增模块；`sort.rs` 为存量 1168 行文件，当批仅补排除条件，不扩大为排序重构。
交叉批次验收：Rust 默认/lite 全量测试、WASM 原生 102 项（1 忽略）、双版本 WASM 构建、根目录 `pnpm build`、lint、循环依赖、展现层边界、React 类型检查及文档链接检查全部通过。演示服务仍为 `http://127.0.0.1:5183`。
筛选区域批次已接入 Rust 区域快照、结构编辑随动与保存恢复；React 表头入口和单列清除共用条件弹窗，复用 Summary 的 A25:C29 种子。新增原生区域/结构测试 8 项通过，区域保存恢复专项通过，双版本 WASM 已构建。
`a53d0193` 按用户要求提交并推送了阶段进度（当时筛选 E2E 24/25）。随后稳定复现并修复清除竞态：命令发出前的窗口读取先完成，不再被误判为用户已切换视图；真正的新读取、滚动和切表仍不允许旧结果覆盖。修改仍直接使用 Rust 返回投影，不补读、不重试、不建新状态层。
筛选反馈改为工具栏专属单行样式，桌面恢复 46px；1280/390 截图、溢出、键盘焦点及冻结表头筛选已验证。新增 `filter-projection-race.spec.ts` 只延迟真实 Worker 响应，不伪造原生区域或历史，确认一次清除不增加投影请求。调用链保持 React 事件 → UI Core command → Rust Worker → 返回投影 → React。
本批复用 Summary A25:C29 和 Sales Orders 1,000 条种子。手测：选择 A25:C29 → Filter selected range → A 列表头设 West → B 列设最小值 15 → 清除 A 列条件，B 列条件仍生效；清除最后一列条件保留区域按钮，工具栏 Clear filter 才移除整个区域。
筛选收尾门禁：Rust 默认/lite 全量、WASM 原生 103 项（1 忽略）、全量 Vitest 4755 项、最终全量 E2E 378 项（6.6 分钟）、根构建、lint、循环依赖、类型检查、展现层边界及文档检查全部通过。收尾修改随本次提交归档。
区域边界：每表一个筛选区域；首行是表头，不猜测 Total/Summary；有条件时最多扫描 50,000 个条件单元格，空条件只保留区域、不扫描数据。删除表头移除区域，行列插删位移快照而不重新计算条件。合并表头不渲染单格按钮，仍可用工具栏条件入口；不宣称已经支持完整合并表头交互。
索引纠正：原编号 27 是名称管理、28 是重算/异步公式、29 才是排序筛选、30 是去重，现拆开列出，避免合并描述漏掉功能。第 9 组数据分析与第 16 组打印按原范围完全延后，不计入 41 项。
本批三项已验收；下一批继续补原计划缺口，完整筛选体验尚未完成。
完整 41 项计划仍保留上面的未完成项，不把单批收尾称为整个项目完成。

公式引用批次复用 Sales Orders 与 Summary 的既有公式种子，不新增 demo 数据。链路为 React 输入/指针事件 → UI Core 草稿与引用 command atom → Enter 沿既有 Rust 提交链写入；拾取期间不写工作簿、不移动原编辑选区。共享输入 hook 仅同步 DOM 光标；独立引用状态文件用于让编辑开始、取消、提交共用清理而不产生循环依赖。当前只高亮正在拾取的同表区域，不宣称跨表拾取、全部引用着色或补全已完成。
`dcff7b5f` 提交前复验：全量 Vitest 4767/4767、引用与筛选专项 E2E 21/21、根目录构建、lint、循环依赖、文档、展现层边界及类型检查通过；检查了 1280/390px 引用截图。提交后补跑全量 E2E 390/390（7.1 分钟），公式引用批次收尾通过。

函数补全接入前检查：现有 21 项候选只是 UI 元数据，计算仍全部交给 Rust。真实 WASM 预检发现 TRIM 只去两端空白、未压缩词间空格，还误删 NBSP/制表符；现已在 Rust 原函数内修正，只处理 U+0020，规则见 [Microsoft TRIM](https://support.microsoft.com/en-us/excel/functions/trim-function)。新增 Rust 回归覆盖中文、空串、空格、NBSP、制表符和换行；`e2e/editing/formula-function-catalog.spec.ts` 遍历目录并通过页面公式栏/真实 Worker 验证每项计算与 TRIM 撤销重做，目录新增条目必须补示例。
该修正随本次提交归档；Rust 默认/lite 全量、双版本 WASM 构建、Vitest 4767/4767、函数目录与引用专项 E2E 14/14、根构建及静态检查通过。更新引擎后的全量 E2E 392/392（6.9 分钟）通过。

公式辅助三项已实现：格内编辑和公式栏共享最多 8 项候选，↑/↓ 选择、Tab/Enter 补全、鼠标点击接受；Esc 先收起候选，再取消编辑。参数提示识别嵌套调用、字符串/数组内逗号、带引号工作表名。所有候选只是输入辅助，不计算、不写工作簿；最终 Enter 才使用既有 Rust 提交与历史。复用 Sales Orders 和 Summary 既有种子，不新增持久状态或 demo 数据。
新增生产模块仅为 `workbook/formula/FormulaAssist.tsx` 及样式：弹层用 DOM ref 贴着当前输入框定位，窄屏/底边翻转，光标留在输入框。原引用输入 hook 更名为 `use-formula-input.ts`，负责共同的 DOM 键盘/光标绑定；补全命令直接扩展已有 `editing/formula-input-commands.ts`，没有新建命令包装层。候选位置/关闭状态依附当前编辑快照与光标，重新编辑自然失效，不添加 reset 生命周期。
真实窄屏测试暴露并修复旧底栏跳动：统计等待时从多行缩成一行，导致双击 P1001 的第二下落到 P1000；统计改为稳定单行横向滚动，不缓存旧统计值。补全与统计交叉 E2E 12/12、该窄屏用例连续 3/3 通过，1280/390 截图及溢出检查通过。无障碍描述在提交失败时优先读错误，正常编辑关联当前参数提示。
本批最终 Vitest 4780/4780、根构建、lint、循环依赖、展现层边界、类型检查通过；全量 E2E 396/398（7.3 分钟），不能把专项结果当作全量验收。失败项为 `selection-status.spec.ts` 的 390px 统计按钮全部可见断言，以及 `freeze-editor-scroll.spec.ts` 的冻结单元格编辑错误提示无遮挡断言；两项尚未修复，下一批功能前先收尾。按用户要求提交当前状态。演示服务 `http://127.0.0.1:5183`。

`db790e99` 提交后收尾：先复现上述两项失败，再将窄屏统计改为固定两列三行（等待、空态也保留高度），默认六项全部可见；超长数值仍允许横向滚动，不缩小字体。公式辅助浮层根据现有格内错误 DOM 的底边定位，参数帮助与错误同时保留；格内输入的无障碍描述优先关联错误。链路仍为现有 UI Core 状态 → React DOM 布局，无新增 atom、传输或生命周期。
新增真实 Worker 统计请求延迟回归，验证等待/完成时网格高度相同；冻结错误测试扩为 1280/390px，检查实际命中、提示不重叠、焦点及取消；React 补测错误朗读、参数帮助与纠正后重试。专项 E2E 25/25、React 213/213、全量 Vitest 4781/4781、根构建、lint、循环依赖、展现层边界与类型检查通过，桌面/窄屏截图已检查。最终全量 E2E 400/400（7.1 分钟）通过，布局收尾随本次提交归档。

公式键盘三项：同表方向键移动当前引用，Shift 固定引用锚点扩展/收缩范围，F2 在文字光标与引用选择之间切换（参照 [Microsoft F2 说明](https://support.microsoft.com/en-us/accessibility/excel/keyboard-shortcuts-in-excel)）。补全列表优先消费上下键；没有候选时才拾取引用。复用普通导航对隐藏/筛掉行、隐藏列、合并格和边界的处理，引用焦点带动既有 viewport，原编辑单元格与工作簿选区不变；F4 行列锁随键盘引用移动保留。百分号后、字符串及未闭合工作表名内不自动进入引用模式。
链路为 React 输入 → `dispatchFormulaInputKeyAtom` → 现有引用草稿/导航/滚动命令；最终 Enter 才提交 Rust。F2 的文字模式标记只表达“本次编辑不要自动拾取”的真实差异，沿已有编辑清理命令复位；不新增生命周期、生产文件或 demo 种子。新增文件仅为 UI Core/React/真实 Worker E2E 测试。输入 hook 缩至 69 行，业务不搬进 React；隐藏数据直接读现有原生投影叶节点，避免打包进旧隐藏命令模块。
额外离屏提交测试暴露并补测旧焦点竞态：等待 Rust 时若用户已经进入名称框，旧编辑回调不能再抢回网格焦点。React 只检查当前 DOM 焦点归属；受控延迟单测先红后绿，真实 Worker 延迟 E2E 验证名称框输入与焦点保留。其它覆盖包括两个编辑入口、一次撤销/重做、F4、合并格、隐藏行列、冻结区、双向滚动、最后一格边界、取消后重开以及输入法/修饰键保护。1280/390px 截图、溢出和焦点检查已通过。
本批全量 Vitest 4798/4798；根构建、lint、类型、循环依赖、展现层边界及文档检查全部通过。引用交叉专项 E2E 26/26，本批最终新增 10/10（含后补的离屏提交与延迟焦点用例），合并与离屏用例分别连续 3/3。最终全量 E2E 410/410（7.2 分钟）通过。演示服务 `http://127.0.0.1:5183`；随本次提交归档，跨表拾取不在本批完成声明内。

跨表引用批次：三个入口共用原编辑草稿；切表只变更浏览/引用目标，格内编辑跨表后由公式栏接续。点击/拖选拼接转义后的工作表名称，键盘复用既有导航与 Shift 范围，F4 锁和 F2 模式仍保留；已有限定引用可用 F2 打开对应表继续选取。确认/取消后返回原编辑单元格，包含先切回源表及离屏位置。拾取期间不写 Rust，不新增撤销步骤；表结构按钮禁用，等待写入时所有切表入口禁用。
链路仍为 React DOM → UI Core 草稿/切表命令 → 确认时一条 `cell.setInput` → Rust 返回投影。写入表取原编辑源，投影表取当前浏览表；Worker 在写入前验证投影表存在，只对单格写入允许二者不同。返回源表沿已有视图切换读取源投影，不增加传输协议或第二份工作簿。新增文件仅为两份 UI Core 测试、一份 React 测试、一份 E2E；`runtime.ts` 是存量超限文件，本次只局部修改校验。
复用 Sales Orders 与 Summary 既有种子。手测：B10 输入 `=SUM(` → 点击 Summary → 拖选 B1:B2 → 输入 `)` 并确认，返回 B10 得到 79，一次撤销恢复 Contoso。专项覆盖真实原生重算、带空格/撇号/中文表名、F2/F4、等待写入、拒绝后纠正、P1001 返回及 1280/390px 焦点/溢出截图。引用交叉 E2E 27/27 通过。
首次全量发现迟到提交将新选区拉回编辑源，影响连续日期输入；在 46 项通过、4 项失败时停止，不计作完整验收。修正复用已有 `selectionAuthorityWitnessAtom`：用户等待期间重新定位就不返回旧位置；新增受控延迟回归及切表后投影尚未更新时立即确认的用例。日期/跨表专项 21/21、最终全量 Vitest 4813/4813、lint、循环依赖通过；全量 E2E 正重新执行中。旧切表拒绝测试显式用 F2 进入文字模式，保留原生错误阻止切表的覆盖；引用模式允许跨表，不提前提交未闭合公式。
收尾审查补测“跨表公式结束后直接点另一标签”：三个目标场景先红后绿。提交沿用同一命令，仅增加 `returnToSource` 选项区分直接确认与切表触发的提交，避免先回编辑源再吞掉用户的切表目标；不增加 atom 或生命周期。专项一次新建表检查失败时存在同期源码热更新，未据此断言根因；停止改源码后该用例独立连续 5/5，随后最终全量 E2E 421/421（7.3 分钟）通过。
最终全量 Vitest 4816/4816、根构建、lint、循环依赖（632 模块、1737 依赖）、类型、展现层边界、文档链接与差异检查通过。1280/390px 截图及溢出/焦点断言已检查，生产 JS 433.05 kB；本批已提交为 `6267adcc`。完整 41 项范围仍以上表为准，不将本批完成视为整个计划完成。

下一批颜色三项已开始：工具栏从固定黄色/红色切换改为颜色选择与显式恢复默认。底层扩展现有 `applySelectionFormatAtom` 的对象参数，颜色规范为小写六位十六进制；null 仅清除目标颜色字段，不以白色/黑色代替无填充/自动。复用 `runSelectionMutationAtom` → Rust `format.setRange`，不增加样式镜像或传输层。新增 `selection-color-command.test.ts` 验证单格/区域/行/列 scope、字段清除及无效值不发送，22/22 通过。React 已接入预设色、自定义 Hex、恢复默认入口，UI Core 保存交互草稿与上次颜色，并迁出原有工具栏弹层状态，未建立第二份工作簿样式。
按用户要求保存为 WIP 快照：提交前全量 Vitest 4838/4838、根构建、lint、类型、循环依赖、展现层边界和文档检查通过。本次没有重新执行全量 E2E；旧颜色切换用例仍需适配显式恢复默认，色板拒绝后重试与连接切换的 pending 状态仍需专项检查，不能据单测通过宣称颜色批次已完成。

颜色收尾：预设色、Hex 和系统颜色控件共用一份 UI Core 草稿；主按钮应用上次颜色，清除使用“无填充／自动文字色”，不再用重复点击猜测清除。复用原生 D2 黄色、E2 红色种子。新增命令测试 5 项、React 色板交互测试 4 项、真实 Worker E2E 11 项，旧两项颜色 E2E 改为显式清除。覆盖区域、行列交叉、离屏格、独立记忆颜色、只清除目标字段、单次撤销、冻结合并格、两个编辑入口禁用、原生拒绝后重试、延迟回包及窄屏焦点。
测试先暴露快捷上色失败后丢失重试草稿、更换连接后永久 busy；已修正。真实浏览器补测发现同步段 busy 未及时通知订阅，沿既有异步续体模式发布，不增加生命周期。色板与查找弹窗共用 `dialog-focus.ts` 的首尾焦点循环，避免重复 DOM 逻辑。
继承色清除的真实 WASM 快照包含 `bgColor: undefined`（Rust `Some(None)`），投影原先误当作缺省字段跳过；现在 null/显式 undefined 都清除继承字段，真正缺省仍继承。补两项投影回归，未修改 Rust 三层样式规则或 WASM 产物。
窄屏重复验收发现缩窗后名称框仍按旧 1,060px 面积判断 D2 可见，随后视口才变为 287px。仅监听 resize 的尝试未解决且已撤回；名称框现在读取即时 DOM 面积并交给原滚动命令，不增加滚动状态或重试。React 回归通过，原始桌面/窄屏交互连续 16/16 通过；未保留诊断日志或临时监听。早先全量 Vitest 4849/4849 与构建通过发生在这项定位修正之前，不能替代最终门禁；最终全量单测→构建→E2E 已顺序启动，运行期间不改源码或并行构建。本轮尚未提交。
最终源码的全量 Vitest 4850/4850、根构建、lint、类型、循环依赖（637 模块、1750 依赖）、展现层边界、文档和差异检查通过；生产 JS 440.06 kB。全量 E2E 432 项正在执行，完成前不进入下一批。演示服务 `http://127.0.0.1:5183` 已确认 HTTP 200。
颜色批次最终全量 E2E 432/432（7.5 分钟）通过，1280/390px 最终截图及焦点/溢出断言已检查；本批完成但收尾尚未提交。下一批仅做水平对齐、垂直对齐、文字旋转三个直接选择入口，不把常用格式工具或整个 41 项计划视为完成。

按用户要求提交当前进度：颜色收尾与对齐选择一起保存为 WIP 快照。对齐专项 Vitest 45/45；最新专项 E2E 11/15，失败涉及垂直默认值的继承清除、旋转用例的行高断言，以及 1280/390px 原生选择框键盘用例。上述失败尚未完成定位与修复；颜色批次此前的全量通过记录不能代表当前快照已通过全量验收。

对齐收尾：Rust 垂直对齐是枚举，null 表示“不修改”，恢复默认必须明确写入 default；已修正命令与公开类型，恢复默认能覆盖行列继承且不清除斜体等其它字段。旋转测试现在先等待设置行高回显，再比较操作前后尺寸。macOS 无头 Chromium 在独立原生 select 上同样不转发弹出菜单方向键；键盘验收改用原生按字查找，仍验证真实写入、焦点和窄屏溢出，不通过脚本改值替代键盘操作。
选择框在 busy 时 disabled 会丢失焦点，React 仅在回显后、原控件仍连接且用户未聚焦别处时归还焦点。持久 E2E 同时验证主动移到名称框后不抢焦点。补回字体/换行/缩进回归，新增真实拒绝后重试、单次撤销、冻结合并格四片同步、两种编辑入口禁用和原生种子回显；专项 E2E 10/10。种子沿用 F2 水平居中、J2 顶对齐、K2 45°，没有视图硬编码坐标样式。
当前入口支持水平 Auto/Left/Center/Right、垂直 Default/Top/Middle/Bottom、旋转 -90/-45/0/45/90° 及竖排；命令支持整数 -90..90，已有非预设角度可回显，但本批不宣称已交付自定义角度输入或完整格式对话框。竖排逐字直立；固定行高仍可裁切旋转文字，本批不擅自修改 rowStyle。调用链仍为 React DOM → UI Core 格式命令 → Rust 单次写入 → 投影回显；没有新增工作簿镜像。
收尾全量 Vitest 4892/4892（287 文件）、根构建、lint、类型、展现层边界、循环依赖和文档检查通过；1280/390px 截图已检查，生产 JS 442.55 kB。最终全量 E2E 442/442（7.7 分钟）通过，运行期间未改源码或并行构建；演示服务 http://127.0.0.1:5183 返回 HTTP 200。本批验收完成，收尾未提交；整个 41 项计划仍未完成。

下一批字号三项：保留预设选择，增加 Custom 输入与 A+/A− 相邻档位按钮。按 Rust u32 字号契约只接受 1–512 的整数像素；达到边界无写入。工具栏默认值从错误的 10 修正为与实际网格一致的 12。自定义 13、23 等值可回显，草稿/等待/错误由一个 UI Core atom 管理，真实字号仍读投影；React 与对齐控件共用 `tool-focus.ts` 处理 disabled 后焦点归还，不传控制器或复制工作簿状态。Demo H4 原生导入 13px 布尔值，修正布尔种子漏带格式的问题。
专项实测发现整行/整列大字号没有撑高，以及屏幕外新行高未随写入回包导致名称框定位最后一行失败。Rust 现在按本次范围每行一次更新 rowStyle.height，三个 scope 共用；不写 cellStyle/columnStyle 高度，不扫描选区外行，不在缩小字号时自动缩行。字号格式回包复用既有稀疏尺寸结构和缓存，单次 RPC 同时返回完整目标尺寸与可见投影；缺少尺寸能力在写入前拒绝。`runtime.ts` 原有 329 行，本次仅补该回包，未扩大重构。
本批新增命令测试 38 项、React 交互 4 项、Rust 行高 3 项、尺寸传输 2 项（该文件共 8 项），覆盖字段隔离、选区范围、非法整数、边界、失效草稿、重试与连接替换。字号 E2E 新增 11 项，覆盖单格/区域/行列交叉、离屏定位及撤销、冻结合并格、两种编辑入口、真实拒绝/延迟回包、键盘与 1280/390px 截图；字号加对齐最终专项 21/21 通过。WASM lite/full 已重建，全量 Rust、Vitest、构建及 E2E 正在验证，不能用上一批 442/442 代替当前验收。
全量单测发现格式回包扩展误改了填充尺寸范围，两个既有填充用例失败；已恢复完整请求范围，不修改其断言。边界复核又发现 UI 把手动行高上限 512px 用于接收自动行高，丢弃 512px 字体对应的 Rust 622px 高度；主动停止当时的 E2E 后修正，自动行高按 Rust u32 范围接收，手动输入/拖拽仍为 16–512px。补最大字号几何回归后，命令测试共 39 项，字号 E2E 11/11 通过（包括 622px 行高断言）。
当前源码全量 Vitest 4937/4937（289 文件）、根构建、lint、类型、边界、循环依赖及文档检查通过；Rust 默认版 2882 passed / 10 ignored、lite 版 2842 passed / 10 ignored、WASM 原生 103 passed / 1 ignored，未改原有 ignored 项。生产 JS 446.53 kB，演示服务返回 HTTP 200。最终全量 E2E 正在运行；尚未提交，不把中止的旧运行算作当前源码的验收。
窄屏补查确认快捷增减失败时，内联错误超出 390px 视口。再次停止当时的全量 E2E 后，失败改为打开已有字号弹窗并保留尝试值，不增加新面板；删除不可读的内联错误分支。新增增大/减小各一项真实拒绝后重试及窄屏截图用例，错误全文与重试按钮均在视口内。最终字号专项 13/13、全量 Vitest 4939/4939、构建及静态检查通过，生产 JS 446.36 kB；Rust 源码未再变更，前述 Rust 门禁仍有效。当前最终全量 E2E 正在运行，源码已冻结。

最终全量 E2E 455/455（7.9 分钟）通过，运行期间未改生产源码或并行构建。对齐收尾及字号三项随本次提交归档；全量 Vitest 4939/4939、Rust 默认/lite 与 WASM 原生测试、根构建及静态检查均通过。整个 41 项计划仍未完成，不扩大本批完成范围。

数字格式设置三项：新增一个 Number format 弹窗，支持数字的 0–15 位小数与千分位、百分比小数位、货币符号与小数位（空符号表示不显示币种）。现有快捷格式按钮保留；草稿从活动格投影读取，确认才写入选区，取消没有历史。调用链是 React 表单 → UI Core `runNumberFormatPanelAtom` → 既有 `runSelectionMutationAtom` → Rust `format.setRange` → 返回投影；不添加数字格式化器、预览 RPC、工作簿镜像或新传输协议。本批只覆盖三类设置，不宣称完整 Format Cells、负数规则、会计/时间/科学/分数等类别完成。
新增生产文件分别负责数字格式草稿命令、弹窗 DOM、弹窗样式，均小于 300 行；复用既有焦点循环。Sales Orders G12/O12/P12 原生种子为 3 位数字、1 位百分比、3 位欧元。UI Core 新增 35 项、React 新增 4 项测试；E2E 新增 14 项，覆盖取消、非法精度、拒绝重试、等待态、两种编辑入口、原始类型、公式/错误/空白、0/15 位边界、行列继承、离屏末行、冻结合并、撤销和 1280/390px 截图。首次专项因“小数位”测试定位匹配到快捷按钮而失败，改为精确 spinbutton 定位后通过，不修改产品行为迁就断言。全量 Vitest 4978/4978（291 文件）、数字格式交叉专项 E2E 20/20（26.8 秒）通过；桌面/窄屏/拒绝反馈截图已检查，继续完整门禁。
本批最终全量 E2E 469/469（8.2 分钟）通过，运行期间未改生产源码或并行构建。根构建、lint、主线类型、展现层边界、循环依赖（646 模块、1776 依赖）、文档与差异检查通过；生产 JS 451.49 kB（gzip 132.73 kB）。演示服务 http://127.0.0.1:5183 返回 HTTP 200，工具栏 Number format settings（0.0）进入设置。遵循批次 skill 保留三项范围、补齐三层测试与真实 Worker 截图，未自动提交；完整 41 项仍未完成。

扩展数字类别三项：继续使用同一 Number format 弹窗，科学计数支持 0–15 位小数，分数支持最大一/二/三位分母及固定分母，时间支持八种 24 小时、AM/PM、分秒和累计小时样式。显示规则参照 [Microsoft 数字格式指南](https://support.microsoft.com/en-us/excel/review-guidelines-for-customizing-a-number-format)，不宣称本批支持分数/时间字符串自动输入、任意自定义时间 token 或地区化。种子 G13/O13/O14 分别为科学计数、分数、时间。
Rust 增加三个原生类别及独立显示文件；科学计数复用现有 half-up 有效位收位，覆盖零/负数/进位/次正规数；分数在最多 999 个候选内求近似，固定分母不约分，wire 拒绝零/负/小数分母；时间使用 1900 日期序号，不依赖时区，负数及越界值显示 #####。只改显示，原数值仍用于计算与编辑。`format.rs` 是原有 898 行文件，本次仅增加枚举与分派；没有扩大重构。原先散在单元格格式与尺寸快照内的 NumberFormatJSON 归入一个 172 行的数字格式 wire 文件，复用原有 RPC、样式快照与历史。
新增类别通过既有 formattedDisplay 返回原生文本；窗口与自动尺寸测量不再把这三类交给 JS 重算，原有其它类别的显示分支未在本批改写。新增原生核心 4 项表驱动测试、WASM wire/持久化测试，UI Core 与 React 增量 23 项；全量 Vitest 5001/5001（291 文件）通过。新类别 E2E 10 项与上批 14 项共 24/24 通过，另加强自动列宽必须实际变化的断言，待最终全量确认。最初失败由新用例漏授剪贴板权限及错误切表定位引起，已修正测试入口；1280/390px 分数与时间截图已检查。WASM lite/full 已重建，lint/类型/循环依赖/展现层边界通过；继续 Rust 默认/lite、WASM 原生、根构建与全量 E2E 门禁，未提交。
本批最终全量 E2E 479/479（8.4 分钟）通过，包括加强后的自动列宽断言；运行期间未改生产源码或并行构建。Rust 默认版 2886 passed / 10 ignored、lite 版 2846 passed / 10 ignored、WASM 原生 106 passed / 1 ignored，忽略项未增加。根构建、lint、类型、展现层边界、循环依赖（646 模块、1777 依赖）、文档及差异检查通过。生产 JS 454.06 kB（gzip 133.42 kB），WASM lite 2303.46 kB。演示服务 http://127.0.0.1:5183 返回 HTTP 200；按批次与架构 skill 完成三类入口及原生/界面/浏览器验证，仍未提交，完整 41 项计划继续保留。

时间／分数输入三项：支持 `13:30`、`13:30:45`，超过 24 小时自动采用累计小时；支持 `1:30 PM`、`9 AM` 及大小写不敏感的 a/p；支持显式带整数部分的 `1 1/2`、`0 3/8`、`-0 2/8`，固定输入分母。裸 `1/2` 不猜测日期或分数，非法时分秒、零分母、含歧义的输入仍为文字，前导引号保持强制文本。分数采用显式整数部分的依据见 [Microsoft 格式设置说明](https://learn.microsoft.com/en-us/troubleshoot/microsoft-365-apps/excel/format-cells-settings)。地区日期、日期时间组合、亚秒与真实系统输入法跨浏览器验收仍未完成。
调用链不变：两个 React 编辑入口 → UI Core 既有提交 command → 一条 `cell.setInput` → Rust 输入解析／数值及 numberFormat 写入 → 同次回包投影。新增 `time_input.rs` 只识别时间语法、`fraction_input.rs` 只识别带分数语法；没有新 atom、新 RPC 或中间层。普通数值重编辑保留格式；修改仅作用于该格 numberFormat，不覆盖粗体等外观；外部 TSV 复用 Rust 数值解析但保留目标格式。种子 O15/O16/O18 分别显示 `3:36`、`4:48 AM`、`1/20`，原始演示数值不变。
专项 Rust 5/5 表驱动测试、全量 Vitest 5019/5019（291 文件）、真实 Worker 专项 E2E 13/13（20.4 秒）通过。E2E 覆盖两种编辑入口、数值计算、原始数值重编辑、滚动／切表、一次撤销恢复值和格式、重做、内部复制、外部 TSV、强制文字与种子。WASM lite/full 已重建，根构建、lint、类型、展现层边界及循环依赖通过；全量 Rust 与 492 项 E2E 运行中，生产源码冻结。新增源文件及测试均低于 300 行；本批尚未提交。
本批最终全量 E2E 492/492（8.7 分钟）通过，期间没有修改生产源码或并行构建。Rust 默认版 2891 passed / 10 ignored、lite 版 2851 passed / 10 ignored、WASM 原生 106 passed / 1 ignored，忽略项未增加；全量 Vitest 5019/5019、根构建、lint、类型、展现层边界、循环依赖与文档／差异检查通过。生产 JS 454.23 kB（gzip 133.45 kB），WASM lite 2308.95 kB；演示服务 http://127.0.0.1:5183 返回 HTTP 200。本批未提交，完整 41 项仍按全范围核对表继续推进。

格式刷三项：单击按钮只刷一次、双击连续刷、再次点击或工作簿内任意焦点按 Esc 退出。鼠标拖选在松手时写入，也支持名称框／键盘选区后 Enter 应用；切表或替换 Worker 后旧会话永久失效。普通格式完整替换，空白默认格式可清掉目标外观，异质源区域按既有原生规则平铺；不改目标值和公式。单次刷入对应一条原生撤销，不复制行高／列宽，也不宣称支持未接入 Rust 的条件格式规则。
将 1019 行旧兼容控制器改为约百行 UI Core command，移除 124 行兼容类型；旧端口／ticket／ledger 测试改为当前原生捕获、粘贴、并发、取消、连接／切表失效及 store 隔离测试。Solid 保持暂停，不补旧接口兼容层。链路为 React → `runFormatPainterAtom` → 既有 clipboard.capture / clipboard.paste（formats）→ Rust 历史与同次回包投影；新增 painter 标记只选择独立原生快照槽，避免覆盖普通复制／剪切。UI 只保留模式、反馈、现有连接／workspace 身份和快照 token，不保存格式副本。Worker `runtime.ts` 原为 330 行左右，本次只增加槽选择与失效分支，未扩大拆分。
复用原生种子 A2/B2/C2/D2/E2/F2/G13，真实 Worker 专项 E2E 14/14（20.1 秒）覆盖内容不变、原生数字格式、异质平铺、默认格式反向清除、连续刷、取消、撤销重做、普通剪贴板隔离、源修改后快照不变、切表、冻结区／屏幕外目标及失败重试。首轮 11/12 的唯一失败是测试点击已卸载的 A2，补名称框定位后通过；另补外观及任意焦点 Esc 用例。React 早期两项失败是异步命令未结算即断言，已改为等待真实状态。没有降低产品断言或跳过用例。
专项 Vitest 36/36、全量 Vitest 5020/5020（292 文件）、WASM 原生 106 passed / 1 ignored、WASM lite/full 重建、根构建、lint、类型、展现层边界及循环依赖（646 模块、1783 依赖）通过。共享 visual-runtime 不在当前环境，使用持久 Playwright 用例检查 1280/390px 截图、溢出、反馈和浏览器异常；截图已检查，并去掉错误时重复底部提示。最终 506 项 E2E 运行中，生产源码冻结。本批未提交。
最终全量 E2E 506/506（8.9 分钟）通过，生产源码全程冻结，没有并行根构建或 WASM 重建。根构建 JS 457.51 kB（gzip 134.44 kB），WASM lite 2309.58 kB；演示 http://127.0.0.1:5183 返回 HTTP 200。文档／差异检查通过；旧格式刷控制器由 1019 行缩为 101 行，旧 124 行兼容类型删除；原有 Worker 分发文件由 334 行局部增加到 348 行，其余新增／重写文件均低于 300 行。本批与上一批时间／分数输入均未提交，完整 41 项计划仍未完成。

边框设置三项：外框／内部／全框／内部横线或竖线／四个单边／清除；细、中、粗、虚、点、双六种线型；共用调色板与自定义 #RRGGBB。不增加范围样式层，几何边框只写当前有限选区的 cellStyle.borders；未指定边及其它格式保留。合并格锚点按完整矩形计算，部分合并范围在写前拒绝。内部边在两侧单元格均有原生数据，复制任意格不会丢边；React 对相同相邻边只画一次，虚／点线为 1px、双线为 3px，不改变行高。不同样式共边优先级及冻结接缝等完整投影语义仍留在第 23 项，不以本批替代全范围完成。

调用链：React 三个设置 → `runBorderPanelAtom` → 既有 `format.setRange` → Rust `patch_range_borders` 与原生历史 → 同次回包投影。UI Core 只存弹窗草稿和目标见证；Rust 决定哪些格的哪些边需要修改；React 负责显示与焦点。新增 `sheet_borders.rs`、WASM 边框入口、border-panel command、BorderTools 均为单一职责，未新增业务镜像或逐格 JS 请求。B6 红色双底线、B7 蓝色左虚线、B8 绿色上点线直接进入原生种子，测试验证真实回显。

本批全量 Rust 检查发现上一批格式刷修改 `capture_clipboard` 公开签名却未通过 API 固定门禁的遗漏。恢复原签名，新增独立 `capture_format_painter` 导出，底层仍共用同一捕获实现和原有独立快照槽；API 快照仅新增两个方法，没有放宽或跳过检查。原 Worker 分发文件 348 → 347 行，属于存量文件局部调整，其余新增／重写文件低于 300 行。

专项 42 项 Vitest 和最终全量 5062/5062（295 文件）通过；Rust 边框表驱动 5/5、WASM 原生 108 passed / 1 ignored、API 门禁 10 passed / 1 ignored 通过。两次早期浏览器失败分别是测试查找已卸载的 C9（10 项共用断言）及把列标题误写为 button；补名称框定位并使用 columnheader 后，边框 19 项与格式刷 14 项共 33/33（36.8 秒）通过，未降低产品断言。专项包括范围外不变、整行列屏幕外范围、精确线宽、合并、冻结、复制、一次撤销、种子、关闭焦点与非法色值。共享 visual-runtime 缺失，采用持久 Playwright 的截图、溢出和浏览器异常断言；1280/390px 弹窗、错误态及网格双线截图已检查。WASM lite/full 重建、根构建、lint、类型、展现层边界、循环依赖与文档检查通过。525 项全量 E2E 运行中，生产源码冻结，不并行构建。本批未提交。

边框入口批次最终全量 E2E 525/525（9.3 分钟）通过，期间没有修改生产源码或并行构建。Rust 默认版 2896 passed / 10 ignored、lite 版 2856 passed / 10 ignored、WASM 原生 108 passed / 1 ignored，忽略项没有增加。最终全量 Vitest 5062/5062、API 签名门禁、根构建、lint、类型、展现层边界、循环依赖（650 模块、1794 依赖）通过。生产 JS 463.27 kB（gzip 135.65 kB）、WASM lite 2317.16 kB；演示服务 http://127.0.0.1:5183 返回 HTTP 200。后续继续第 23 项的相邻不同样式边冲突、单侧清除后的共边归属及冻结接缝，不能用当前同样式相邻边去重替代完整共边规则。完整 41 项计划仍未完成。

### 当前提交检查点：共边批次尚未验收

按用户要求保存边框入口批次及共边处理的当前进度。新增 Rust 双侧边同步、邻格清除和原生历史范围计算，以及 React 共边解析与冻结接缝调整。当前主线类型检查、边框相关 Vitest 62/62、Rust 边框回归 7/7 通过。上面的全量 E2E 525/525 属于此前的入口批次，不代表这些后续改动已通过完整验收。

该检查点已随 `53db0e67` 推送。提交时仍待完成的入口统一、原生历史回归和专项浏览器验证见下面续做记录；合并格部分共边、其它格式写入路径及完整 E2E 尚未收尾，不将第 23 项或本批标记为完成。

### 共边批次续做：快捷入口与历史回归

快捷 Borders 按钮改为与设置面板共用 `borderPatch`，不再通过普通格式写入绕过共边同步。调用链仍为 React → `applySelectionFormatAtom` / `runBorderPanelAtom` → 既有选区命令 → Rust `patch_range_borders` → 同次回包投影；没有新增命令层或工作簿状态。删掉已失去调用者的旧相邻边去重函数及重复事务分支。

新增原生历史测试文件验证一次撤销／重做恢复四个邻格、重复设置不创建历史或丢弃 redo、部分合并／超大选区失败后可继续操作、Excel 首尾边界。新增 React 绘制测试验证旧数据冲突优先级、格式化空格的共边、虚拟窗口边缘、隐藏行列、冻结两侧只拼同一投影。各新增文件低于 300 行。

全量 Vitest 5066/5066（296 文件）、Rust 边框专项 11/11、WASM 原生 108 passed / 1 ignored 通过。WASM lite/full 已重建；主线类型、lint、展现层边界、循环依赖（651 模块、1796 依赖）、根构建、文档及差异检查通过。当前 JS 465.03 kB（gzip 136.29 kB）、WASM lite 2323.57 kB。

真实 Worker 专项 E2E 24/24（29.3 秒）通过；补强“显式滚回原点且断言接缝两侧不重复绘制”后，共边专项再次 5/5（8.1 秒）。首轮 20/24：两项旧断言把上／左边的绘制归属固定在当前格，一项顺序清除污染了下一条相邻种子，一项测试 helper 操作了清除模式下禁用的线型控件。修复为验证实际四条可见边、额外检查邻格线宽／颜色、撤销还原种子、清除时不设置线型，未跳过用例。1280/390px 截图已检查，包含原点冻结接缝；页面无横向溢出或浏览器异常。演示 http://127.0.0.1:5183 返回 HTTP 200。

仍未完成：合并格只修改部分边段时的准确投影，格式刷／粘贴／通用清格式的共边一致性，以及当前版本完整 E2E。此前 525/525 不能作为当前版本的全量验收证据。保持当前三项边框批次，不另开功能批；本轮改动未提交。

### 共边批次续做：合并格可见边段

三个原生回归先复现并修复：修改旧锚点首段会改变其它缺省边段、空白合并首段着色扩散、清除中间段后旧锚点颜色重新透出。仍使用 cellStyle.borders；首段默认值变化前，仅固定这一条外沿的旧值，不扫描合并内部或整表，不引入边表、时间戳或新的样式层。

新增 `MergedCellBorders.tsx` 只绘制窗口内外沿；`MergedCells` 继续负责文本和矩形，普通格与合并格复用 `grid-border-style` 的同投影共边规则。锚点格式作为旧数据的默认值，物理边段含显式 none 优先。未新增 RPC、atom 或工作簿状态。各新增／大改文件低于 300 行。

Summary A15:D15 原生种子增加红色粗底边，其中 C15 一段蓝色细线；空白覆盖格使用 null 值和原生格式导入，React 没有坐标特判。持久 E2E 验证种子、四个方向的局部覆盖及撤销重做、局部清除及滚动、首段不污染其余段、隐藏末行仍保留底边。首轮 26/31：隐藏种子行影响了两个测试的分段数量；另发现并修复隐藏末行吃掉底边的真实绘制问题；冻结格定位不复位滚动、窄屏边段卸载分别改用非冻结定位和横向滚动。保留隐藏末行专项断言，没有移除不易通过的场景。

最终边框专项 E2E 33/33（40.1 秒）、全量 Vitest 5068/5068（296 文件）、原生边框专项 14/14、WASM 原生 108 passed / 1 ignored 通过。WASM lite/full 已重建，类型、lint、展现层边界、循环依赖、根构建、文档和差异检查通过。JS 467.77 kB（gzip 137.09 kB）、WASM lite 2325.54 kB。共享 visual-runtime 不可用，采用持久 Playwright 截图、溢出和浏览器异常检查；1280/390px 合并边段截图已检查。

此版本完整 E2E 结果为 538/539：旧 Borders 用例仍断言当前格画上边，已改为检查上方邻格的实际底边及清除结果。Rust 默认版 2905 passed / 10 ignored、lite 版 2865 passed / 10 ignored。以上全量结果先于下面的格式写入改动，不作为后续版本的全量验收证据。

### 共边批次检查点：粘贴、格式刷与清格式

格式刷、格式粘贴、完整粘贴和剪切复用 Rust 的临时边框替换计划，同步相邻两侧并纳入既有的一次历史记录。通用清格式沿现有 WASM 格式命令进入原生历史包装，只补邻格样式快照，不把邻格内容纳入清空范围；没有新增 RPC、atom 或持久样式层。合并粘贴使用操作后的合并范围计算外沿。

新增原生回归 10/10，覆盖粘贴覆盖／清除、仅值粘贴不改边框、剪切、合并边段、一次撤销重做、事务回滚和行列已存样式。WASM 原生 108 passed / 1 ignored、全量 Vitest 5068/5068、lint、类型、展现层边界及循环依赖通过，WASM lite/full 已重建。

提交前格式写入／清除／剪贴板历史专项 E2E 42/42（51.0 秒）通过，包含修正后的旧 Borders 断言；当前源码根构建和文档检查通过。首轮 40/42 的两项失败是测试误把“仅粘贴格式”当成下拉选项；已改用现有独立按钮，未跳过测试或修改生产行为。

按用户要求提交当前进度，不宣告本批完成。仍待验证隐藏锚点离屏组合、有限选区外仅继承行列样式的边框，以及最终源码的完整 E2E 与 Rust 默认/lite 全量回归；完整 41 项计划继续保留。

上述检查点已随 `46094f9e` 推送到 `origin/main`。

### 共边批次续做：行列继承边框的清除

原生回归复现：清除第 3 行格式后，有限展示区域外 Z2 的继承底边仍然存在。新增 `sheet_axis_border_clear.rs` 只负责整行／整列清边框：收集已有行列样式交叉点及邻轴独有的 cellStyle，邻轴自身只清相应的一条边。继续使用 rowStyle／columnStyle／cellStyle，不新增持久边表，也不展开整列百万格；测试约束最终 cellStyle 数量仍低于 100。

调用链保持 React 清格式 → UI Core 既有 command atom → 既有 WASM 格式命令 → Rust 稀疏清边计划及一次历史事务 → 投影。邻轴快照只含样式，不含值或公式；邻格其它边、粗斜体保持。原生格式历史回归 6/6，包含远处继承样式、邻格独有边框、一次撤销重做及事务回滚。文件分别为 113 行（稀疏轴边处理）、68 行（格式历史入口）、297 行（格式历史测试），未超过普通文件上限。

此阶段 WASM lite/full 已重建，全量 Vitest 5068/5068、lint、类型、展现层边界和循环依赖通过。专项 E2E 46/46（59.6 秒），包含新增整行／整列清边框各一项；根构建通过。Rust 默认版 2917 passed / 10 ignored、lite 版 2877 passed / 10 ignored、WASM 原生 108 passed / 1 ignored。忽略项未增加；后续只修改投影和绘制，Rust 结果仍适用。

### 共边批次续做：隐藏锚点离屏及冻结交界

React 回归先复现两个问题：逻辑外沿落在窗口外的隐藏轴时整段不渲染；压缩后的合并首行／首列未把边交给相邻冻结格。投影在同一次读取中只补这些可见外沿的稀疏样式（`mergeBorderCells`），不读隐藏区域内容、不展开合并内部、不扩大普通 cells 的窗口契约、不增加 Worker 往返。`merge-border-cells.ts` 负责这类补充外沿的坐标／数量校验，拒绝内部格、重复条目和未压缩到窗口的逻辑外沿。

React 继续复用同一共边解析：原生物理边段优先于锚点缺省，隐藏轴仅改变边框的实际位置与绘制归属，不改变数据。`MergedCellBorders` 按像素边界判断是否可见；`grid-border-style` 把首末可见行列映射回物理外沿。没有新增 atom、业务命令或持久状态。

新增原生投影读取、合并绘制、冻结归属与边界校验测试。当前全量 Vitest 5073/5073（297 文件）、隐藏合并／冻结共边 E2E 18/18（23.1 秒）、lint、类型、边界、循环依赖（653 模块、1800 依赖）与最终根构建通过。首轮 E2E 16/18：两个横向用例使用了超出 1024px 上限的列宽，并把宽选区首格可见作为前提；已改合法尺寸及名称框选择，不跳过场景。1280/390px 顶边及左边截图均已检查，页面无横向溢出或浏览器异常；共享 visual-runtime 仍不可用，使用持久 Playwright 截图及断言。

此版本启动的 552 项全量 E2E 在 145 项通过后主动停止（1 项中断、406 项未运行）：只读核对发现填充仍直接写格式，新增原生回归确认它会保留邻格旧粗边。停止是为修复真实缺口后统一重验，不把这次运行算作全量通过。演示服务 http://127.0.0.1:5183 返回 HTTP 200；本轮改动未提交，完整 41 项计划继续执行。

### 共边批次续做：填充写入与单轴合并首段

四方向原生回归复现“蓝色细边已填入目标，但邻格仍保留红色粗边”。填充现在复用同一临时边框替换计划；`auto_fill/apply.rs` 负责一次预检、实际应用及接入已有历史事务，不重复推断源样本。额外样式快照继续不含邻格值或公式，菜单填充／填充柄／序列面板仍共用原来的 WASM 方法和 UI Core command；无新增 RPC 或 atom。

历史回归同时复现单行／单列合并格的首段问题：锚点自身可能也是底边／右边的物理首段。已把旧边段保留规则补到这两种几何，不展开合并内部。新增撤销、重做及事务回滚用例，保证被补入历史的合并邻格内容不变。

原生边框／格式／粘贴／填充专项 22/22、既有填充单测 27/27 通过；WASM lite/full 已重建，当前运行浏览器填充与合并交叉专项、Rust 默认/lite 全量及静态门禁。存量 `auto_fill.rs` 从 2627 行降为 2519 行，仍为存量超限文件；本次只移出应用入口，没有扩张为全部算法和旧测试的重构。新应用入口 145 行、填充专项测试 232 行。

填充／合并浏览器专项 52/52（1.0 分钟）通过：新增菜单填充、拖拽复制、序列面板、拖拽序列各一项，以及原生单行合并种子的首段修改回归。保留原有千行序列、四方向拖拽、循环公式、失败重试等用例。全量 Vitest 5073/5073、lint、类型、展现层边界、循环依赖和差异检查通过，正在做最终根构建及完整回归；当前三项共边批次仍未提前标记完成。

最终根构建已通过：JS 469.66 kB（gzip 137.78 kB）、WASM lite 2347.46 kB。重新启动包含新增用例的完整 E2E，生产源码及 WASM 冻结；原生默认/lite 全量仍在运行。两项全量结果完成前不进入下一批，本轮不自动提交或推送。

### 用户要求的提交检查点

原生完整回归现已完成：默认版 2920 passed / 10 ignored、lite 版 2880 passed / 10 ignored、WASM 108 passed / 1 ignored。构建、全量 Vitest 5073/5073 和填充／合并专项 E2E 52/52 通过。

按用户明确要求提交并推送当前改动，不宣告共边批次完成。557 项完整 E2E 在提交检查时仍在运行，已知 `editing/find-worker.spec.ts` 的 current 替换用例在 `page.evaluate` 内等待 30 秒超时；原因尚未确定，不能将此轮算作全量通过。后续需定位该超时并取得最终完整验收结果，再进入下一批。

`d8a8bec8` 已推送。该轮完整 E2E 最终为 556 passed / 1 failed（10.7 分钟）。保持原用例和 30 秒超时，三个 Worker 用例各重复 20 次并开启 trace，结果 59 passed / 1 failed，再次复现 current 用例超时。

诊断续跑只在测试内记录请求阶段，不修改真实请求、WASM 或生产状态。浏览器 stderr 捕获 Chromium 147.0.7727.15 的 `Received signal 4 ILL_ILLTRP`；macOS 崩溃报告确认 `DedicatedWorker thread` 的 `EXC_BAD_INSTRUCTION / SIGILL`，首轮全量和隔离重跑均有对应报告。日志中 `workbook.initialize` 已响应，`workbook.importCells` 尚未响应，替换请求还未发出。已确定是导入阶段的 Worker 原生崩溃，而非替换断言失败；具体触发原因及浏览器版本对照仍在验证，未通过验收。

同一组测试各重复 30 次：Chromium 147 默认编译为 86/90，Chromium 151.0.7922.34 默认编译为 88/90，均捕获同类 SIGILL；151 仅启用 Liftoff 基线编译时 90/90（37.6 秒）。这些对照指向 WASM 优化编译相关路径，但尚未定位具体上游缺陷；基线模式仅用于临时诊断，不能替代正常设置的全量验收，也没有写入项目配置。最新配套浏览器的默认编译对照待运行。

Playwright 改为失败时保留 trace，修正“本地不重试却只在首次重试录制”导致首次失败无诊断数据的问题；没有增加重试、延长超时或删减用例。生产代码、WASM 和仓库测试依赖版本保持不变。

进一步对照：151 保留优化编译、仅关闭 WASM deopt 时 90/90（37.6 秒）；156.0.8078.4 不加任何编译开关时 90/90（37.9 秒）。这些结果支持旧浏览器优化运行时相关的判断，不声称已映射到某个具体上游缺陷，也不把关闭优化当作产品修复。

据此仅将 React 的 `@playwright/test` 固定为 1.64.0（配套 Chromium 156），锁文件只新增相应三个包；Solid 等其它包版本和 peer 绑定保持原样。使用与现有依赖目录匹配的 pnpm 10.15.1 完成安装，冻结锁文件复装通过；CI 的 Node 22.12/24 满足新版要求。README 补充配套浏览器安装和完整 E2E 命令。测试阶段日志、首次失败 trace 保留；没有修改 Rust、WASM、atom 或生产 UI，后续仍须新版配套测试器下专项及全量验收。

新版配套测试器按项目默认配置复验 Worker 三项各 30 次，90/90（36.1 秒）通过，无诊断编译开关或额外重试。全量 Vitest 5073/5073（297 文件）、根构建、类型、lint、循环依赖、展现层边界、文档及差异检查通过；产物保持 JS 469.66 kB（gzip 137.78 kB）、WASM lite 2347.46 kB。557 项完整 E2E 已重新启动，源码及 WASM 冻结，完成前不进入下一批。演示服务 http://127.0.0.1:5183 返回 HTTP 200；本轮六个文件改动未提交。

### 共边批次最终验收

新版配套环境完整 E2E 557/557（7.3 分钟）通过，包含之前超时的三个真实 Worker 用例；源码和 WASM 在整轮运行期间未修改，也未并行构建。桌面冻结接缝、390px 隐藏合并顶边和左边截图已复核，实际共边与分段颜色正常；共享 visual-runtime 仍不可用，使用持久 Playwright 截图、溢出及浏览器异常断言。此前 Rust 完整结果仍对应当前未变化的 Rust 源码：默认 2920 passed / 10 ignored、lite 2880 passed / 10 ignored、WASM 108 passed / 1 ignored。

本批三项验收完成。第 23 项仍有明确的高级格式缺口，不据此关闭整个条目或完整 41 项计划。未增加新的业务层、RPC 或 atom 来绕开浏览器崩溃；本轮测试配置、依赖和验收文档按用户要求一并提交。

### 数字格式下一批：阶段性提交，尚未验收

计划三项为日期显示样式选择、文本格式输入、Rust 原生格式预览。按用户要求先提交当前进度：仅完成 Rust `Text` 数字格式类别、按最终行／列／格格式保留文本输入，以及 WASM 格式传输与持久化往返。设置文本格式不转换已有值或公式，后续输入才按文本保存；沿用现有输入和历史链路，没有新增业务层。

提交前原生专项 13/13（文本 4、日期 4、时间／分数 5）通过，WASM 原生测试 108 passed / 1 ignored。日期样式 UI、文本格式 UI、原生预览和外部粘贴交叉仍未完成；本次未重建浏览器 WASM 或验收这些新功能的 E2E。上面的 557/557 仅属于共边批次，不作为本批完成证据。

### 数字格式会话扩展：原生链路续做

补齐外部 TSV 的目标格式判断：快照只保留解码后的原文，粘贴预检按最终落点的行／列／格数字格式解析。编辑与外部粘贴复用同一 Rust 输入函数；内部复制继续使用冻结的值类型。普通格式中的无效公式仍在全部写入前拒绝，文本格式允许保留公式样式原文。新增回归覆盖精度与前导零、行列继承、混合格式平铺／转置、内部复制、空白跳过和单次撤销，专项 18/18 通过；既有剪贴板筛选回归通过。

新增 `format.preview` 只读请求，直接读取 Rust 当前格值并使用已有数字显示规则，不写样式、不建历史、不推进 Worker 修订号。WASM 原生 111 passed / 1 ignored、API 签名校验 10 passed / 1 ignored、传输 Vitest 4/4 通过。`commands.ts` 的既有写入结果类型归入 `mutation-results.ts`，保留原导出路径，没有新增执行层；存量 347 行的 Worker 分发文件仅增加直接预览分支，不扩大重构。

lite/full WASM 已重建；生产源码和 WASM 冻结期间，新增真实 Worker 两项加既有查找三项 E2E 5/5（2.6 秒）通过。现有剪贴板／粘贴 E2E 57/57（49.3 秒）通过，覆盖选择性粘贴、运算、转置、合并、列宽与历史。全量 Vitest 5077/5077（298 文件）、类型、lint、循环依赖、展现层边界、根构建与文档检查通过；产物为 JS 469.66 kB（gzip 137.77 kB）、WASM lite 2351.02 kB。

此时日期／文本弹窗入口、预览 UI、基础数字格式显示统一、演示数据及全量 UI E2E 尚待完成；原生默认/lite 全量回归仍在运行，本轮未提交。后续接入预览时还需验证草稿快速变化、关闭重开、切换工作簿及提交中的过期预览响应不能覆盖当前状态。

### 数字格式会话扩展：界面接入与统一显示

上一步原生完整结果已取得：默认 2929 passed / 10 ignored、lite 2889 passed / 10 ignored。随后本轮新增日期／文本类别和原生预览 UI，复用 `runNumberFormatPanelAtom`，草稿校验由预览与应用共用；只读预览不创建历史，应用继续走原有区域格式命令。旧预览响应通过现有草稿对象身份丢弃，不增加 ticket、业务数据镜像或重试层。测试覆盖快速修改、关闭重开、切换目标、应用等待、失败后的等待态恢复和空值／错误显示。

基础数字／百分比／货币显示收回 Rust，单元格、预览、自动尺寸不再双重格式化。原生固定小数修正为既有 UI 的半数远离零，并消除负零显示，新增 3 项原生回归通过；尚未接入的 custom/accounting/special 等不据此宣告完成。演示 Summary A96:C96 通过原生导入新增文本长编号、前导零和日期样式，视图无坐标特判。

专项 E2E 34/34（42 秒）通过；1280px 与 390px 截图复核后，把被截断的日期样式控件改为整行宽，复验 2/2 通过。共享 visual-runtime 不可用，继续使用持久 Playwright 截图、溢出、焦点和浏览器异常断言。预览在应用失败后残留 loading 的新增红绿回归及 React 专项 14/14 通过。

最终根构建通过，JS 472.38 kB（gzip 138.40 kB）、WASM lite 2350.28 kB。最终 Vitest 5106/5106（300 文件）、类型、lint、循环依赖、展现层边界、文档与差异检查通过。完整 569 项 E2E 已启动，生产源码与 WASM 冻结；Rust 默认全量已结束，lite/WASM 回归链仍在运行。按用户要求提交当前进度，完整验收仍待上述运行结果；完成前不进入下一批，不把专项通过替代完整验收。

`e9a7e432` 提交后收尾：Rust 默认 2932 passed / 10 ignored、lite 2892 passed / 10 ignored、WASM 111 passed / 1 ignored，整条命令退出 0。首次完整 E2E 为 568/569（7.9 分钟）；旧统计复制测试把 A96 当空白格，但它现为本批长编号样例，原生非空计数正确返回 1。测试改选 A97，并新增空白显示及 Count: 0 的明确断言，保留复制零值的原预期，不修改生产统计逻辑。数字格式与统计交叉 E2E 16/16（14.5 秒）通过，完整 569 项已重新启动；生产源码和 WASM 继续冻结，测试修正及本段记录尚未提交。

最终完整 E2E 569/569（7.5 分钟，命令退出 0）通过。本批三项验收完成；沿用既有 React 事件 → UI Core command atom → Rust Worker/WASM → 投影 → React 链路，只读预览不产生工作簿写入或历史。`e9a7e432` 的[远端 CI](https://github.com/allroad88888888/einfach-excel/actions/runs/38069704213) 中 Rust、Node 22.12.0、Node 24 三组全部通过。测试修正与验收记录仍未提交；第 18–19 项剩余格式类别及整个 41 项计划不据此宣告完成。演示服务为 `http://127.0.0.1:5183`，Summary A96:C96 可直接手测。

### 工作表视图记忆（已验收）

已实现三项：普通切表恢复上次选区（包含区域、行列选择）、恢复横纵滚动、跨表公式引用确认／取消后恢复原编辑视图且不污染引用目标表的普通视图。离屏选区不会把已恢复的浏览位置拉回；重复点击当前标签保留当前位置。

沿用现有切表／编辑命令，UI Core 保存同一工作簿会话内的 UI 位置，React 只同步 DOM；Rust 工作簿数据、历史和投影继续走原链路，不新增 RPC 或数据镜像。稳定 sheet ID 隔离视图，新建表首次进入仍从 A1 开始；删除时回收记忆，撤销恢复的表从新视图开始，重命名／排序保留记忆，重新初始化清空记忆。缩放按钮当前尚未接功能，本批不把它当作已有可记忆状态，也不宣称完成刷新持久化或第 37–39 项个人视图服务。

新增 UI Core 16 项、React 1 项及真实 Worker/WASM E2E 8 项。全量 Vitest 5123/5123（302 文件）、根构建通过；视图记忆／跨表公式／标签专项 E2E 29/29、结构／历史／冻结／查找交叉 E2E 30/30 通过。复用 Sales Orders、Summary 原始数据，无新增种子。本批完整 577 项 E2E 尚未运行，不将专项结果视为整批验收；按用户要求先提交当前进度。

`99adb7ff` 已推送。后续完整 577 项回归在填充柄用例暴露真实时序问题：切表首帧请求尚未完成时用户已通过名称框跳到 A40:A41，旧请求窗口不含新选区，首帧校正被跳过，原生冻结行及隐藏行尺寸到达后填充柄落入冻结遮罩。用可控 Promise 稳定复现 1092px 未校正到 1036px；首轮完整回归主动停止（124 passed、1 failed、1 interrupted、451 未运行），不能计为通过。

修复只把首帧判断依据从旧请求窗口改为发布原生尺寸前的当前可见窗口，复用既有坐标包含判断，不增加 atom、RPC 或重复状态；离屏选区恢复仍不被拉回。新增真实 Worker 延迟请求的持久 E2E，覆盖定位、填充柄可见及单击不写数据；另补跨表提交拒绝／等待期间改选位置的视图记忆回归。修复后全量 Vitest 5126/5126（302 文件）、填充柄／冻结／视图记忆交叉 E2E 30/30 通过；完整 E2E 增至 578 项，尚待重新验收。桌面与 390px 截图已复核；共享 visual-runtime 脚本不可用，使用持久 Playwright 截图、溢出及浏览器异常断言。本段与修复尚未提交。

受控竞态 E2E 连续 10/10 通过；根构建、类型、lint、展现层边界、循环依赖和文档链接检查通过。完整 578 项 E2E 已重新启动，运行期间生产源码和 WASM 冻结，结束前不进入下一批。演示服务 `http://127.0.0.1:5183` 返回 HTTP 200。

第二轮完整 E2E 为 577/578（7.7 分钟）：首帧竞态及全部视图记忆用例通过；唯一失败是旧列宽粘贴测试的切表助手仍要求 A1 可见，而回访已正确恢复 P1001。助手改为等待选中标签与就绪投影，回访处新增 P1001 名称框及可见性断言，保留列宽、表头、编辑器尺寸和撤销断言，不修改生产逻辑。列宽／视图记忆交叉及完整回归仍需复验。`99adb7ff` 的远端 CI 已确认 Rust、Node 22、Node 24 全绿；该证据只对应已提交基础，不代表未提交首帧修复的远端验收。

列宽／视图记忆专项 13/13（12.5 秒）通过，文档链接与差异检查通过；第三轮完整 578 项 E2E 已启动，生产源码与 WASM 保持不变。整批仍待完整回归结果，不进入下一批、不自动提交。

第三轮完整回归仍为 577/578（7.7 分钟）：列宽及所有视图记忆用例通过，唯一失败是选择性粘贴面板在取消测试中没有响应一次页面级 Escape。原用例单独重复 20/20 通过，尚无足够证据断言生产代码根因；测试在 Transpose 勾选框被禁用后未指定键盘目标，现改为从仍可用的 Paste content 控件发送 Escape，并增加失败时页面焦点、活动元素与 dialog.open 的诊断附件。原关闭、焦点返回、草稿重置和不产生历史的断言全部保留。改后整个面板套件连续三轮 24/24（23.4 秒）通过，不修改生产实现；下一次完整验收单独串行运行，不把局部复跑代替全量结果。

最终第四轮完整 E2E 578/578（7.6 分钟，退出 0）通过，生产源码及 WASM 在整轮验收中保持冻结。本批三项完成；1280px 最后单元格恢复、390px 跨表引用确认截图复核通过，继续使用既有持久 Playwright 截图和溢出／异常检查，未引入新视觉体系。最终 Vitest 5126/5126、根构建、类型、lint、循环依赖、展现层边界、文档检查均通过；首帧修复和测试收尾尚未提交。不据此宣告整个第 01 项或全部 41 项计划完成。

### 原生分列（本批三项已验收）

只做三项：分隔符拆列（多分隔符、连续分隔符合并、引号保护）、固定宽度拆列、指定目标位置及已有数据覆盖确认。取消不写入，预览不创建历史，应用是一次原生可撤销操作；源值、拆分结果、覆盖检查和写入由 Rust 持有，不复用旧 TS 分词／importCellChunks 计算链路。

交互依据为 Microsoft 的[分列说明](https://support.microsoft.com/en-us/excel/get-started/split-text-into-different-columns-with-the-convert-text-to-columns-wizard)与[文本导入选项说明](https://support.microsoft.com/en-us/excel/text-import-wizard)：先选源列，配置拆分规则并查看预览，再选择目标。当前批不把地区日期转换、列类型向导或文件导入归为已完成。验收须覆盖空字段、引号内分隔符／换行、Unicode 固定宽度、源目标重叠、覆盖拒绝、合并／溢出保护、撤销重做及超过可见区的记录。

第一步已新增 `excel-core/src/text_columns.rs` 原生分词器及独立测试：多分隔符、连续分隔符合并、双／单／无引号、转义引号、单元格内换行、空字段、Unicode 标量固定切点及长度／列数边界共 11/11 原生单测通过。分词只返回字段，不提前转类型，不借用 CSV 文件的换行拆记录语义；未闭合引号和越界明确拒绝，不截断后宣告成功。文件按单一职责分开（实现 136 行、测试 140 行）；当前仍需实现工作簿预览、覆盖检查、原生历史写入、Worker 命令、React 面板及演示数据，未重建 WASM，不视为分列产品已可用。

第一步已随 `a0fdd727` 提交并推送。第二步新增 Rust 工作簿完整计划与只读预览、已有内容覆盖门禁、一次可撤销写入，并经 WASM 接入 `textColumns.preview`／`textColumns.apply` 两条 Worker 命令。源与目标重叠时先冻结全部源值；隐藏行不压缩；原地拆列不把源列当成额外覆盖，移到其它位置则检查完整目标。源／目标合并或动态数组溢出、画布及 Excel 边界、超过 100,000 输出格／32 MiB 数据、撤销预算超限均明确拒绝，不截断写入。预览最多返回 20 行 × 12 列、每字段 120 个 Unicode 标量，并标记样本截断；完整源行仍参与拆分和校验。

本批字段保持文字，保留前导零、引号及以 `=` 开头的内容，不自动变数字、日期或公式；空字段清空对应目标，目标格式与行列尺寸不改。公式源使用计算结果，撤销恢复原公式。列类型向导仍是第 13 项后续范围，不能把文字模式宣称为完整分列功能。应用校验预览时的工作簿版本，拒绝旧确认；原生成功后即推进版本，投影失败也不能重放旧请求。没有新增 TS 分词器、源数据 atom 镜像或第二层历史。

第二步专项证据：Rust 分词 11/11；原生预览／历史在默认及 lite 配置均 21/21；WASM 原生套件 114 passed、1 ignored（含新增 wire 测试 3 项）；Worker Vitest 7/7。lite/full WASM 重建成功，两个实际二进制均通过 Node 调用预览、覆盖拒绝、应用、一次撤销／重做的烟测。主线类型、lint、循环依赖、展现层与文档检查通过。新增文件均不超过 300 行；现有 `runtime.ts` 本次仅新增命令分支，不扩展为目录重构。React command atom、面板、演示种子及浏览器 E2E 尚未接入，整批仍未验收；第二步未提交。

全量 Vitest 5133/5133（303 文件）及根构建通过。Rust 首次完整回归在架构门禁失败：新增的两个 WASM 方法未同步 API 签名快照。已用仓库生成器更新，差异严格为新增两条签名，没有删除或修改旧接口；架构门禁复验 10 passed、1 ignored。默认及 lite 完整回归已重新启动，结果未完成前不写为全绿。已提交 `a0fdd727` 的远端 CI、docs、Publish 均成功，该远端证据不代表当前未提交改动。

补查公开读取边界时，用 2,000 行汇总公式复现了分列预览遗留 Store 队列：下一次无关写入被计入 4002 次 flush 访问。预览与应用预检现复用 `settle_pending_reads`，正常预览、错误预览、覆盖拒绝、解析拒绝四种路径均由同一计数回归钉住，不增加队列或状态包装。回归 1/1、默认配置预览／历史 21/21、WASM 原生 114 passed／1 ignored 复验通过；lite/full 再次重建，实际二进制固定宽度 Unicode 拆分、覆盖拒绝及撤销重做烟测均通过。运行中的完整 Rust 回归起于此读取收尾修复之前，不能当作该修复的最终全量验收；整批接入界面后仍须在源码冻结状态统一复验。

第三步已接入 React 表单与 UI Core command atom：选择拆分方式／分隔符／引号／定宽切点／目标位置，查看原生预览，显式勾选已有内容覆盖后应用。修改任何草稿会使预览与覆盖确认失效，点击 Update preview 才重算，避免输入一个字符就读取整列。取消和 Escape 不写入；提交中禁止重复点击；保护检查针对完整原生目标而非源选区。新旧异步响应通过现有 store 对象身份及选区 witness 隔离，没有另造生命周期或源数据镜像。

演示种子在 Summary E97:E98（逗号、引号、前导零）及 E99（`北京😀AB007`，切点 `2, 5`）；把 E97:E98 拆到 B97 会遇到 C98 的 `Existing destination`，可测试覆盖确认和斜体保持。新增 UI Core 15 项、React 4 项、持久真实 Worker/WASM E2E 8 项，专项全部通过；E2E 另覆盖 400 行全部写入、多分隔符／连续合并／引号保护、Unicode 定宽、源目标重叠、合并／溢出拒绝、一次撤销重做、键盘循环及 1280px／390px 布局。初轮失败分别是测试表格定位不唯一、固定切点的标签把帮助文字纳入名称、合并源选区被自动展开后应先触发单列校验；已修正标签及明确断言，不放宽数据或历史验证。

全量 Vitest 5152/5152（305 文件）、根构建、类型、lint、循环依赖和展现层检查通过。已检查桌面与窄屏截图；共享 visual-runtime 脚本不可用，使用现有 Playwright 的持久截图、弹窗溢出断言及浏览器异常检查。完整 E2E 增至 586 项并已启动，期间生产源码及 WASM 冻结，不启动下一批。演示服务 `http://127.0.0.1:5183` 返回 HTTP 200。本批尚未完成全量验收，未提交。

提交前收尾：完整 E2E 586/586（8.0 分钟，退出 0）通过；再次运行全量 Vitest 5152/5152（305 文件），展现层边界、循环依赖和文档检查全部通过。Rust lite 全量 2925 passed／10 ignored（包含最终读取边界回归）；默认配置先前全量 2964 passed／10 ignored 起于读取收尾修复前，不能冒充最终源码的完整回归，最终源码补跑默认库测试 1647 passed／3 ignored，加此前预览／历史 21/21、WASM 114 passed／1 ignored 均通过。本批三项验收完成，按用户要求提交并推送；不宣称列类型向导、地区日期、文件导入或整个 41 项计划已完成。

### 分列字段类型（已验收）

上一批已以 `26673f48` 提交并推送。本批只补三项：逐列常规／文本类型、逐列日期顺序、跳过字段。沿用原分列面板、command atom、两条 Worker 命令及原生历史，不新建向导控制器或 TS 转换器。Rust 先冻结全部源值，再按源字段编号转换并去掉跳过字段；预览与提交共用同一计划。新增 `text_columns_value.rs` 只负责字段转换，`TextColumnTypes.tsx` 只渲染逐列选项；已有模块仅扩展请求字段。

默认未配置字段仍保留文字及目标格式，显式 Text 保留前导零并设置文本数字格式；General 复用原生输入识别数值、布尔、百分比、无歧义日期／时间／分数，但不执行公式、不吞掉原始前导单引号。显式日期支持 MDY、DMY、YMD、MYD、DYM、YDM 六种数字顺序，分隔符为 `/`、`-`、`.` 或八位紧凑日期；两位年固定 00–29 → 2000–2029、30–99 → 1930–1999，不随系统地区漂移。非法或不符合指定顺序的日期原样保留为文字，不猜另一种顺序。有效日期复用 1900 序号并显示 `yyyy-mm-dd`。

跳过字段不占目标列，后续字段左移；覆盖确认、保护、画布边界及撤销只作用于实际输出范围。全部跳过、重复类型规则、引用不存在的源字段明确拒绝，原数据与历史不动。类型修改使预览和覆盖确认失效；查看另一个字段的配置不失效；改分隔方式／分隔符／引号／定宽切点会清除旧类型，避免套到错位字段。颜色、字体、行列尺寸不随类型转换改变，数字格式和值一次撤销恢复。

原生种子新增 Summary E95：`001,29/02/2024,ignore,=1+2`。拆到 B95，字段 1 选 General、2 选 Date—DMY、3 选 Skip、4 选 Text，可得到 B95=1、C95=2024-02-29、D95 为文字 `=1+2`，选中 B95:C95 的原生求和为 45,352。保留 E100 空白与 F 列原有宽度样例，不破坏填充及自动适应测试的样本约定。

新增原生类型回归 11 项，默认与 lite 的分列专项各 32/32；WASM 原生 115 passed／1 ignored，lite/full 两种实际二进制的类型预览及写入烟测通过。Worker／UI Core／React 专项 35/35，全量 Vitest 5161/5161（305 文件）、根构建、类型、lint、依赖与展现层检查通过。桌面及 390px 截图已检查，无横向溢出；窄屏弹窗纵向滚动展示配置和结果，沿用现有视觉样式。共享 visual-runtime 仍不可用，使用持久 Playwright 截图、焦点、溢出和 pageerror 断言。

浏览器专项覆盖原分列 8 项及新增 6 项；初轮测试误等默认目标的成功预览（靠右源格实际越界）、下拉框精确标签定位错误，已改为先指定可用目标及按控件角色定位。第二轮为 11/14：剩余断言分别漏了状态栏千分位、400 行写入后尚未等待弹窗关闭就操作背景名称框；修正同步步骤并保留所有数据／历史断言，不修改产品逻辑来迎合测试。专项复验及 Rust 默认／lite 全量仍在运行；完整浏览器回归尚待运行，本批未验收、不自动提交、不进入下一批。

专项第三轮 12/14 暴露两处虚拟网格断言问题：390px 的 E100、宽表的 N400 均在当时 DOM 窗口之外。改为用真实名称框定位后再读格，未删减目标数据检查；第四轮 14/14（14.6 秒）通过。完整 E2E 592 项已启动，期间生产源码及 WASM 冻结；Rust 默认／lite 全量继续运行，完整验收结束前不进入下一批。演示服务 `http://127.0.0.1:5183` 返回 HTTP 200。本批尚未提交。上一批 `26673f48` 的 [CI](https://github.com/allroad88888888/einfach-excel/actions/runs/38076073430)、docs 和 Publish 全部成功，该远端证据不用于证明本批未提交代码。

完整回归发现样例冲突：新增 F100 使 F 列自动适应宽度变为 176px，而原样例的短多行文字应小于 120px，两个既有自动适应用例因此失败。该结果是按真实内容计算的正确列宽，不修改引擎或放宽测试断言；主动停止本轮（345 passed、2 failed、1 interrupted、244 未运行），将新样例移到已有长文本的 E95，目标改为 B95，保留 E100 空白和 F 列原样。新增 E2E 同时验证源 E95 未改、范围外 F95 仍为空；分列／自动列宽／填充交叉复验中。Rust 源码及 WASM 未因样例调整改变，原生全量回归继续有效。

另用 lite/full 实际二进制验证覆盖拒绝不留历史、General 与 Date 的数值类型、Text 的公式字面量、一次撤销恢复原公式及完整数字格式快照、重做恢复新格式、重复应用不新增历史，全部通过；该烟测补充但不替代持久测试或完整 E2E。

样例调整后，分列／自动列宽／填充交叉 E2E 31/31（29.2 秒）通过，两个原自动适应断言均保持不变；E95 新样例的 1280px／390px 截图复核通过。最终根构建、类型、lint、文档及差异检查通过。第二轮完整 592 项 E2E 与最终全量 Vitest 已启动，生产源码及 WASM 再次冻结；Rust 全量仍使用原先同一条运行命令，不因观察等待而重启。本批仍待完整验收，未提交。

最终全量 Vitest 5161/5161（305 文件，45.79 秒）通过；第二轮完整 E2E 与 Rust 全量仍在运行，不能提前计为通过。

第二轮完整 E2E 为 591/592（8.2 分钟）：自动列宽及全部分列用例通过，唯一失败是旧统计测试把 A95:F95 当成全空区域，而新增 E95 文字的正确非空计数为 1。空区域测试改选同样六格的 A100:F100，并增加逐格空白断言，原有数值计数、非空计数、和、均值、极值断言均保留；不改产品统计逻辑。统计／分列专项复验中，之后重跑完整回归。Rust 默认全量已完成 2976 passed／10 ignored，命令自动接续 lite 全量；原生源文件在两种配置验证期间未改动。本批仍未完成验收、不提交、不进入下一批。

统计／分列专项 21/21（20.1 秒）通过，文档与差异检查通过。第三轮完整 592 项 E2E 已启动，Rust lite 全量继续沿用同一进程；保持生产源码和 WASM 冻结，等待最终完整结果。

第三轮完整 E2E 592/592（7.9 分钟，退出 0）通过，包含两项自动列宽、统计空区域及全部新分列回归。最终 Vitest 5161/5161、根构建、类型、lint、循环依赖、展现层边界与文档检查均已有通过证据；Rust 默认全量 2976 passed／10 ignored，WASM 原生 115 passed／1 ignored，两种原生配置分列专项各 32/32。Rust lite 完整回归仍在运行，尚不能写成整批全绿；期间继续冻结源码与 WASM。本批未提交，不据此宣告第 13 项全部范围或整个 41 项计划完成。

Rust lite 最终完整回归 2936 passed／10 ignored，整条默认＋lite 命令退出 0。本批三个功能验收完成。最短链路仍为表单选项 → 既有 command atom → Rust 字段转换及一次历史事务 → 单次投影回显；新转换文件只决定字段值与数字格式，新 React 子组件只显示逐列配置，没有新增传输层或工作簿镜像。本批尚未提交；第 13 项其它范围及整个 41 项计划继续保留。

### 删除重复项（本批已验收）

本批三个功能：选择比较列、首行作为表头、精确／忽略大小写／去除首尾空白／两者组合的文本比较。React 面板 → UI Core command atom → Rust 原生预览或一次历史事务 → 单次投影；没有新增 JS 工作簿镜像或传输层。Summary D32:F37 提供可直接试用的数据，比较 D/E 列并选择去空白且忽略大小写可删除三条重复记录，一次撤销／重做恢复整次操作。

比较显示值并保留首次出现的记录，只压缩选定矩形内的单元格；筛掉行保留位置，手动隐藏行参与。单元格样式及原公式文本随记录移动，行列尺寸与范围外数据不移动；合并单元格和活动溢出区域拒绝操作。预览扫描完整范围但只展示有限样本，应用前要求明确确认并校验工作簿版本。

提交检查：全量 Vitest 5183/5183（308 文件），构建、lint、边界、循环依赖及文档检查通过；去重与自动适应专项 E2E 12/12，Rust 去重专项 13/13，WASM 原生 119 passed／1 ignored。桌面与窄屏截图、焦点和溢出断言已验证。Rust 全量在 API 签名门禁发现新增两个接口漏更新快照；提交前已重新生成，仅增加这两个签名，架构专项复测 10 passed／1 ignored，去重 13/13 再次通过。本批完整 E2E、Rust 默认及 lite 全量尚未验收，不沿用上一批结果宣称完成。

补充验收：`894b24d9` 的 [CI](https://github.com/allroad88888888/einfach-excel/actions/runs/38080643915) 已全部成功。实际日志中 Rust 默认 2998 passed／10 ignored、lite 2958 passed／10 ignored，均包含去重专项；WASM 原生 119 passed／1 ignored，Chrome 7/7；Node 22 和 24 构建及单测通过。桌面 1280px 与窄屏 390px 截图复核通过；共享 visual-runtime 脚本不可用，使用持久 E2E 的截图、焦点与溢出断言。新增文件均不超过 300 行；既有 Worker 命令分派 `runtime.ts` 为 386 行，本批只新增两条分支，未扩围重构。

本地首次完整 E2E 为 602 passed／1 failed：旧筛选剪贴板测试假设 Summary E32 为空，但新增去重种子将其设为 `Group`，实际保持原值并非粘贴越界。已将该测试改为比较操作前的相邻值，并增加撤销／重做后相邻值不变的断言；没有删除范围隔离检查或修改产品实现。筛选交叉与去重专项重跑 14/14 通过；最终完整 603 项回归已再次启动，生产源码与 WASM 继续冻结，结果未完成前不开始下一批。原清单仍要求分页预览，当前前 20 条样本不是完整分页能力。

最终验收：修正测试后的完整 E2E 603/603（8.2 分钟，退出 0）通过。期间没有修改生产源码或 WASM，Rust 双配置完整验收以同一提交 `894b24d9` 的 CI 实际日志为据。另用实际 lite/full WASM 枚举 2048 组重复键与筛掉行组合，验证原位跳过筛掉行、稳定压紧、范围隔离、无重复时不增历史及一次撤销／重做；这是补充验证，不替代持久单测或 E2E。本批三个功能验收完成；测试修正与记录尚未提交，第 30 项分页能力和其余 41 项范围继续保留。

### 去重结果浏览（本批已验收）

本批三个功能：分页浏览完整重复记录列表、定位某条重复记录、定位对应首条保留记录。每次仍由 Rust 扫描完整数据域，仅返回当前最多 20 条样本，前端替换当前页而不缓存完整列表。`sampleOffset` 是重复列表偏移而非工作表行号，最后一页提交仍处理整个选区；翻页和定位核对原预览版本，遇到冲突要求重新预览，不自动删除或重试。定位复用既有选区／滚动 atom，关闭弹窗后焦点回网格，不增加历史；隐藏目标要求先取消隐藏。

继续使用 Summary D32:F37 演示：取消 F 列比较后可点击重复行号或首条行号。分页 E2E 在 O1:P46 写入三种键，验证 43 条重复记录分三页完整呈现，首条来源跨页一致，末页执行仍一次删除全部 43 条并可一次撤销／重做。新增 `tests/remove_duplicates_paging.rs` 只负责分页完整性；其余均扩展既有文件，没有新传输层或业务镜像。

当前证据：Rust 默认及 lite 去重专项各 17/17、lite 架构门禁 10 passed／1 ignored；WASM 原生 120 passed／1 ignored，lite/full 实际构件均重建。UI Core／React 专项 28/28，全量 Vitest 5192/5192。专项 E2E 19/19，包含桌面与窄屏的两种定位、焦点和无历史检查；初次分页用例仅因 table 定位器同时匹配主网格而失败，已限定到结果表，所有原断言保留。截图复核后进一步隐藏单页的无用翻页按钮，窄屏多页按钮成组排列；正在复测最终布局。共享 visual-runtime 脚本仍不可用，沿用持久 E2E 的截图、焦点和溢出断言。最终完整 E2E／Rust 默认及 lite 全量尚未完成，不使用上一批结果替代本批验收；本批尚未提交。

最终布局专项 E2E 19/19（29.7 秒）通过，窄屏截图中取消／更新／删除按钮均可见。全量 Vitest 再跑 5192/5192 通过，根构建通过；最终 lint 尚有 JSX 显示区间表达式的换行问题，待当前源码冻结回归结束后作等价格式修正。完整 E2E 本批为 608 项，已启动；Rust 默认→lite 全量也在运行，不能记为已经通过。试用分页可选择 Sales Orders 的 C1:C1001，保留首行为表头，即可看到 996 条重复记录；定位可继续使用 Summary D32:F37。

最终浏览器及静态验收：完整 E2E 608/608（8.4 分钟，退出 0）通过。补充隐藏行／列定位不改可见性、翻页／定位期间选区改变不被旧响应覆盖、结果消失不跳旧坐标五项测试；相关三层专项为 33/33，全量 Vitest 更新为 5197/5197（308 文件）。回归结束后只对 JSX 区间表达式换行，lint、根构建、类型、边界、循环依赖与文档检查均通过，构建 JS 的 SHA-256 在换行前后同为 `2fde3809fa563f1c2855d9854de46ca6a92d57ac964803f44ef6949e9ffe526c`，运行代码未变。Rust 默认→lite 完整回归仍在原进程继续运行，尚无最终结果；不开始下一批，也不以之前的远端 CI 替代新分页代码的全量证据。本批及前批测试修正仍未提交。

Rust 默认配置完整回归已结束：3002 passed／10 ignored、0 failed；顺序执行命令的 `&&` 已进入 lite 配置，证明默认命令退出 0。lite 正在同一任务中继续编译／运行，不重启，不提前记录通过；目前只剩该配置的全量结果待验收，期间未修改 Rust 或 WASM。

最终 Rust 验收：原默认→lite 顺序命令已退出 0，lite 完整结果为 2962 passed／10 ignored、0 failed，默认为 3002 passed／10 ignored、0 failed；没有重启或替换测试进程。结合本批完整 E2E 608/608、Vitest 5197/5197、WASM 原生 120 passed／1 ignored及构建／静态门禁，本批三个功能验收完成。实现及前批测试修正已按用户要求提交并推送为 `4a1b5cc8`，提交钩子另复测主线 178 文件／1645 项通过。此次只补最终验收记录，尚未再次提交。演示服务 `http://127.0.0.1:5183` 已确认 HTTP 200；完整 41 项范围继续保留，未将本批完成等同整个计划完成。

### 分列高级数字解析（已验收）

新增小数分隔符、千位分隔符及尾随负号三个选项，只作用于 General 字段。沿用既有面板草稿与 command atom，由 Rust 校验和转换；Text、显式 Date 及未配置字段不受影响。千位分组必须是三位，错误数字保留原文，冲突分隔符明确拒绝；更改选项后必须重新预览及确认覆盖。

Summary E96 新增 `1.234,50;12,50%-;001`。以分号拆到 B100，前两字段选择 General、小数逗号、千位点号并允许尾随负号，得到 1234.5、-12.50%、文字 001；一次撤销／重做覆盖整次操作。

提交前已有证据：全量 Vitest 5164/5164（305 文件），根构建、lint、展现层边界、循环依赖与文档检查通过；分列／自动适应／统计专项 E2E 32/32，Rust lite 分列专项 41/41，WASM 原生 116 passed／1 ignored。新增数字解析之后尚未重跑完整 E2E 和两种 Rust 全量，不能沿用上一批的完整回归结果宣称本批已全面验收。按用户要求将字段类型及数字解析一起提交推送，后续从此检查点继续。

检查点已以 `349ad74c` 提交并推送。补充验收：lite/full 两种实际 WASM 均通过数字预览、覆盖拒绝不留历史、原生数值／文字类型、一次撤销／重做、重复应用不增历史及冲突分隔符拒绝检查。桌面 1280px 与窄屏 390px 截图已复核，面板纵向滚动且无横向溢出；共享 visual-runtime 脚本仍不可用，沿用持久 Playwright 的截图、焦点和溢出断言。新增八个源／测试文件均不超过 300 行。完整 E2E 及 Rust 默认／lite 全量已启动，期间生产源码与 WASM 冻结；完整结果出来前不进入下一批。

最终验收：本地完整 E2E 597/597（8.2 分钟，退出 0）通过。`349ad74c` 的 [CI](https://github.com/allroad88888888/einfach-excel/actions/runs/38079177459) 全部成功；实际 Rust 日志证明默认配置 2985 passed／10 ignored、lite 配置 2945 passed／10 ignored，均包含新增数字解析 9 项；WASM 原生 116 passed／1 ignored、WASM Chrome 7/7、基础 atom 核心 64/64，bench 编译门禁也通过。两种 Node 版本构建和单测、[docs](https://github.com/allroad88888888/einfach-excel/actions/runs/38079177479)、[Publish](https://github.com/allroad88888888/einfach-excel/actions/runs/38079177581) 成功。验收期间只补文档，生产代码与该提交一致；本地重复 Rust 进程不再作为门禁证据，以已完成的同提交 CI 双配置全量为准。本批三个功能验收完成，规则说明及验收记录尚未提交，不代表第 13 项全部范围或整个 41 项计划已完成。
