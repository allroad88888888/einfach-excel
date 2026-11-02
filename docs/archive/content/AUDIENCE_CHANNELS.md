# AD-602 受众与渠道映射

原则:**一稿不乱投**。每题一个主渠道首发,次渠道错开 ≥72 小时;中英各自成稿(不是机翻互贴);HN 与 Reddit 不同日投同一篇;每个渠道的标题按该渠道的阅读动机重拟,正文不改事实。全部文末零推广话术,最多一行仓库链接(与 AD-607 约束一致)。

## 渠道速览

| 渠道 | 语言 | 吃什么 | 忌什么 |
|---|---|---|---|
| HN | 英 | 普适工程教训、意外根因、诚实复盘 | 框架布道、营销味标题 |
| r/rust | 英 | Rust/WASM 工程实践、跨语言对照 | 与 Rust 无关的前端内容 |
| r/solidjs | 英 | Solid 生态一手踩坑、内部机制 | 泛前端通稿 |
| r/javascript | 英 | 生态级陷阱、工具链问题 | 过深的领域设定 |
| dev.to | 英 | 结构化长文、教程式复盘 | — |
| 掘金 | 中 | 源码级分析、踩坑复盘 | 太抽象的方法论 |
| 知乎 | 中 | 深度长文、架构论证 | 碎片化短稿 |
| V2EX | 中 | 短平快踩坑帖、引流讨论 | 长文直贴 |

## 逐题映射

### 1. solid-js 双实例 Provider 重挂(文章一)

- **目标读者**:前端工程师(不限 Solid)、组件库作者、pnpm/monorepo 维护者。
- **主渠道**:掘金(中文原稿首发);r/solidjs(英文稿首发,生态一手案例)。
- **次渠道**:HN(英文,标题打普适性,如 "Two copies of your framework in one process",不提仓名);dev.to(英文全文);知乎(中文长尾)。
- **V2EX**:只发 300 字踩坑摘要 + 讨论钩子("你的 lockfile 里 grep 得出几个 solid-js/react?"),链接原文。
- **不投**:r/rust(无关)。

### 2. spill 用 derived atom + 溢出区按需查询

- **目标读者**:电子表格/引擎实现者、响应式状态管理深度用户、对 "how Excel works" 好奇的通用工程师。
- **主渠道**:知乎(中文深度长文的最佳容器);HN(英文,"How dynamic-array spill works in a spreadsheet engine" 类标题)。
- **次渠道**:dev.to;掘金(中文,偏源码视角剪裁)。
- **不投**:r/solidjs(素材在引擎层,与 Solid 无关);r/rust 仅当成稿突出 `sheet_spill_blocker.rs` 的按需现算与不变式论证时作次渠道,否则不投。

### 3. filter/sort 判给引擎(ADR 0003)

- **目标读者**:架构师、做前后端/引擎分层的工程师、写 ADR 的团队负责人。
- **主渠道**:知乎(架构翻案复盘是其强项题材)。
- **次渠道**:掘金;dev.to(英文,"State ownership follows computation" 角度);HN 备选(标题必须打判据方法论,不打电子表格)。
- **不投**:V2EX(过抽象)、r/solidjs、r/rust。

### 4. 双引擎 parity 怎么钉

- **目标读者**:Rust+TS 双栈工程师、测试/质量工程师、维护参照实现(reference implementation)的人。
- **主渠道**:r/rust(英文,Rust 引擎 + WASM + differential testing 是该社区对口题)。
- **次渠道**:HN;dev.to;掘金(中文版侧重 Playwright 双 project 工程细节)。
- **不投**:知乎单独成文优先级低(可并入专栏);r/solidjs 无关。

### 5. headless backend port 设计(ADR 0012)

- **目标读者**:组件库/headless UI 作者、TanStack/Radix 类库的使用者、设计跨框架内核的人。
- **主渠道**:dev.to(英文,headless 话题的主阵地)。
- **次渠道**:r/javascript;掘金。HN 仅当成稿带具体降级事故叙事时再投。
- **不投**:V2EX、r/rust。

### 6. 可见窗口投影不建 per-cell atom(建议并入 #5 或 #2)

- **目标读者**:jotai/recoil/signals 用户、做大表格/虚拟滚动的前端。
- **若独立成短文**:主渠道掘金(源码向短稿);次渠道 r/javascript(英文,"Why we have zero per-cell atoms for a 1M-cell grid")。
- **并入方案**(推荐):作为 #2 或 #5 的一节随主文走,不单独投放。

## 首发节奏建议

同一题的中英两稿间隔 ≥1 周,后发的一稿在文首注明 "originally published"(避免渠道判重复);同一渠道两题之间间隔 ≥2 周,避免刷屏观感。
