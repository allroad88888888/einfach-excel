# AD-601 选题清单定稿

选题原则(树里写死):写真实的技术决策与踩坑,不写软文;仓内 ADR 与架构裁决就是素材。
排序依据三轴:**素材扎实度**(仓里现成的一手材料密度)、**外部读者共鸣度**(不认识这个仓的人为什么要读)、**与定位的贴合度**(是不是"真决策/真踩坑",有没有软文风险)。各轴 1~5 分,只作排序辅助,理由为准。

## 总排序

| # | 题目 | 素材 | 共鸣 | 贴合 | 结论 |
|---|---|---|---|---|---|
| 1 | solid-js 双实例 Provider 重挂(ADR 0001) | 5 | 5 | 5 | **文章一,已定** |
| 2 | spill 用 derived atom + 溢出区按需查询 | 5 | 4 | 5 | 文章二候选 |
| 3 | filter/sort 判给引擎(ADR 0003) | 4 | 4 | 5 | 文章三候选 |
| 4 | 双引擎 parity 怎么钉(BACKEND_PARITY) | 4 | 4 | 4 | 需自建叙事 |
| 5 | headless backend port 设计(ADR 0012) | 4 | 3 | 4 | 难写好,后置 |
| 6 | 可见窗口投影不建 per-cell atom | 3 | 3 | 4 | 建议并入 #5 或 #2 |

## 逐题理由

### 1. 一个进程里的两份 solid-js:Provider 重挂之谜 —— 第一名,文章一

- **素材源**:`docs/decisions/0001-solid-js-single-instance.md`(完整根因叙事)、契约测试 `excel/solid-excel/test/provider-remount-1912.test.tsx`(带机制注释)、根 `package.json` 的 `pnpm.overrides`、lockfile 门禁 grep、`@astrojs/solid-js@7.0.1` 撞 grep 误报插曲(已在当前 lockfile 上复核实锤:未锚定 grep 数出 23 处 1.9.12 + 2 处 7.0.1)。
- **素材扎实度**:全仓叙事最完整的一个坑——症状、误判、根因机制(模块级全局 `Listener` 的跨副本泄漏)、修复、三道护栏、连"门禁自己也有 bug"的二阶插曲都有。引用可全部落到真实文件与真实源码行。
- **共鸣度**:双实例是整个 JS 生态的通病(React "Invalid hook call"、Vue inject 失效同构),受众远超 Solid 圈;而"context 查找其实成功了、坏在依赖追踪全局上"这个变体,连踩过双实例坑的人都多半没见过。pnpm/monorepo 用户直接对号入座。
- **贴合度**:纯踩坑复盘,结论(peerDependencies 的真正意义)对库作者普适,零软文风险。

### 2. 动态数组怎么"溢"出来:spill 用 derived atom,可见性按需查询 —— 第二名

- **素材源**:CLAUDE.md spill 一节(`Value::Array` 锚点 + 非 (0,0) 目标挂 derived atom、WASM 边界塌缩为左上标量)、`excel/spreadsheet-ui-core/src/spill/README.md`(全仓论证密度最高的 README:放弃可见窗口投影的三条理由、`blockedBy` 两步算法、`blockedByArray` 只换措辞不换该不该说话、TS 引擎"答不出就诚实缺席"、回看上限 200 是代价不是几何真相)、ADR 0006、`sheet_spill_blocker.rs` 按需现算的 INV 论证。
- **素材扎实度**:满分。每个取舍都有写下来的反方案与放弃理由,还有跨引擎差异被测试钉住的实例。
- **共鸣度**:"Excel 的动态数组内部怎么实现"是引擎类文章的天然钩子;"溢出目标复用响应式框架的 derived atom、不建平行索引"对状态管理人群也有独立吸引力。稍逊于 #1 是因为需要读者先接受一点电子表格领域设定。
- **贴合度**:全是真决策;风险是内容太多,成文要克制——建议只写"可见性为什么按需查询 + blockedBy 指哪一格"这一条主线,别贪全。

### 3. 判据不变,事实变了:filter/sort 为什么翻判给引擎 —— 第三名

- **素材源**:`docs/decisions/0003-engine-owns-filter-sort.md`(初判 → 事实前提被 SUBTOTAL 两档规则推翻 → 翻转,以及"这不是反复横跳"的自辩:隐藏列作为同一判据的负对照留在 UI core)、BACKEND_PARITY.md 的能力证词一节(TS 引擎干脆声明 `evalHiddenRows: false`,功能有无 ≠ 答案分歧)。
- **素材扎实度**:ADR 本身就是一篇小论文,连翻案理由都是成文的;略薄于前两名是因为代码侧引用面窄(核心就 `SubtotalHiddenPolicy` 一处)。
- **共鸣度**:"状态归谁"之争存在于一切分层系统;"归属是判据的函数,判据不变、事实变了就该翻案"是能带走的方法论,比大多数 state ownership 文章多一层。
- **贴合度**:极高——它示范的正是"技术决策怎么被推翻而不丢脸",与定位严丝合缝。

### 4. 一套用例钉两个引擎:Rust/WASM 与 TS 的 parity 工程 —— 第四名

- **素材源**:`excel/solid-excel/e2e/BACKEND_PARITY.md`(双 Playwright project 共享用例、能力证词 fail-closed、"能力差异 ≠ 分歧"的判读框架、审计方法论)、`cross-engine-parity-spill.test.ts`(闭式断言 + 分歧标志)、ADR 0005。
- **素材扎实度**:材料多但形态是运营快照(通过数、修复清单),叙事线要自己搭:差分测试怎么区分"功能没有"与"答案不同"、怎么避免 `test.skip(project === 'ts')` 式作弊。
- **共鸣度**:differential testing / oracle testing 是好话题,Rust+WASM+TS 双实现能吸 r/rust;但读者面比前三窄。
- **贴合度**:好;注意别写成"我们测试很全"的自夸,主线放在**判读规则**上。

### 5. 三个必选方法撑起一张表:headless backend port 设计 —— 第五名

- **素材源**:`excel/spreadsheet-ui-core/src/backend/types.ts`(必选仅 `readVisibleProjection` / `readRangeProjection` / `setCellInput` 三个,其余全可选;端口缺席 = 功能不存在,fail-closed 而非假 ACK)、ADR 0012(UI-core 与共享展示层的准入判据、DOM-free 硬约束)、CLAUDE.md backend port 一节。
- **素材扎实度**:接口本体注释极好,ADR 0012 判据清晰;但 ADR 偏边界治理、较抽象,缺一个"踩坑"作叙事引擎。
- **共鸣度**:headless UI 是热门方向,但同类文章多,不带具体冲突故事容易泛。建议等有一个"某功能因端口缺席而优雅降级/或没降级好"的具体事故再写,会好一个量级。
- **贴合度**:合格,软文风险略高于前四(容易滑向"看我们设计多好")。

### 6. 一百万格子,零个 per-cell atom —— 第六名,建议合并

- **素材源**:CLAUDE.md atom conventions("No per-cell, per-row, or per-column atom families")、`backend/types.ts` 的 `DisplayCell` / `VisibleProjectionRequest`、spill README 的 `spillCellRoleAtom` 返回选择器函数而非 atom 家族。
- **理由**:单独成文素材最薄(一条约定 + 类型定义),容易写成泛泛的"虚拟滚动 + 状态管理"通稿;而它作为**论据**在 #2(spill 为什么不给 DisplayCell 加字段)和 #5(投影契约)里都天然出场。**建议不独立成文**,并入 #5 作为主案例,或在 #2 里占一节;若渠道需要短稿,可单独出一篇掘金向短文。

## 落地顺序建议

文章一(#1)已成稿;文章二取 #2,文章三取 #3;#4 待一次新的全量 parity 审计后写(有新鲜数字);#5+#6 合并,等一个具体降级事故做叙事钩子。
