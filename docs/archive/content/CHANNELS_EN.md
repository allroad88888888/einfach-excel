# AD-617 英文渠道清单

> **性质**：本文是发布「弹药」，不是发布指令。实际是否发、何时发、由谁发，均由维护者决定与执行。
> **规则时效**：各站发帖规范与自我推广规则以撰写时（2026-08）的通行认知整理，**以站方当前规则为准**——发布前逐条打开对应站点的 rules/guidelines 页面复核。

对应文章编号见仓内 `docs/adoption-issues/AD-600-content-channels.md`：
文章一 solid-js 双实例、文章二 filter/sort 裁决、文章三 双引擎 parity、文章四 backend port、文章五 React/Vue 适配。

---

## 1. Hacker News（Show HN）

- **适投内容**：项目本体（Show HN 一次），之后深度技术文章可作普通 submission 各投一次。Show HN 要求是「你做的、别人能上手试的东西」——本项目有 live demo + npm 包，符合。
- **规范与禁忌**（以 HN 官方 Show HN guidelines 为准）：
  - 标题必须以 `Show HN: ` 开头，总长 ≤80 字符，平实描述、不设悬念、不用感叹号/emoji/营销词（"blazing fast" 之类会被编辑或降权）。
  - URL 指向 repo 或 demo；补充背景写在首条 text/评论里。
  - **严禁拉票**：私发链接求 upvote、同网段多账号点赞会触发 voting-ring 检测，直接沉底且伤账号。只能分享「这是我的 Show HN 讨论页」而非「帮我点一下」。
  - 作者需守评论区、平和回应质疑（HN 文化：defensive 的作者比有缺陷的项目更减分）。
  - 无水花可隔 1–2 周换个角度重发一次，HN 官方容忍少量 repost；短期内反复刷会被降权。
- **时段通行认知**：美东工作日上午 8:00–11:00（周二~周四常被引用为最佳），此时投稿量与浏览量都高；周末流量低但竞争少。HN 有 second-chance pool，好内容有二次机会，不必过度择时。

## 2. Reddit（通用规则 + 四个子版）

**Reddit 通用**：老规矩是「自我推广 ≤ 1/10」（9:1 原则），各子版执行松紧不一；新号 + 只发自己项目的账号极易被判 spam。建议维护者账号先在目标子版正常参与评论一段时间。同一内容**不要同日横扫多个子版**（用户重叠，会被认成 spam 波）。

- **r/rust**
  - 适投：文章三（双引擎 parity，Rust 视角）、项目本体（角度：Rust 写公式引擎/atom store、wasm-pack 到浏览器 worker 的链路）。
  - 规范：内容必须与 Rust 实质相关，纯前端角度会被移除；项目展示帖被接受但要求有技术含量、正文写清「为什么用 Rust、学到了什么」。部分时期有 showcase 固定楼，发帖前看置顶。
  - 时段：美东工作日上午；该版全球读者多，时段敏感度低于 HN。
- **r/solidjs**
  - 适投：文章一（solid-js 双实例/Provider 重挂）、项目本体（Solid 生态的 spreadsheet 组件，直接对口）。
  - 规范：小版、生态展示友好，几乎没有自我推广障碍；但版小意味着流量有限，定位是「养 Solid 社区认知」而非引流。
  - 时段：不敏感。
- **r/javascript**
  - 适投：文章四（backend port 设计）、文章三（parity 的 TS 侧）。
  - 规范：要求内容「关于 JS 本身」且面向有经验的开发者，入门教程和纯产品宣传会被移除；项目帖通常要求正文说明技术点而非只丢链接。注意该版历史上对 showcase 有专门规则/固定楼，发前读 sidebar。
  - 时段：美东工作日上午。
- **r/webdev**
  - 适投：项目 demo 展示。
  - 规范：**项目展示只允许在 Showoff Saturday**（周六的固定规则/固定楼），平日发自己项目会被秒删。技术文章平日可发但同样受自我推广比例约束。
  - 时段：受 Showoff Saturday 约束，即周六（美区时间）。

## 3. dev.to

- **适投内容**：五篇文章的英文版全文首发地（自有博客缺位时的主阵地）。项目发布可加 `#showdev` tag。
- **规范与禁忌**：博客平台，自我推广天然合法；要求实质内容而非纯链接。用好 tags（`#rust` `#webassembly` `#javascript` `#webdev` `#solidjs` `#showdev`，每篇最多 4 个）。若未来有自有博客，dev.to 支持 `canonical_url`，避免 SEO 冲突。
- **时段通行认知**：美东工作日上午发帖进入 feed 的曝光较好；周刊/digest 收录看内容质量，时段影响小。

## 4. lobste.rs

- **适投内容**：文章三/文章四这类架构深度文（该站口味：机制、裁决、trade-off，反感营销）。
- **规范与禁忌**：**邀请制**——没有账号需先找现有用户拿 invite，这是硬前置。发自己的内容必须勾 "authored by" 标记；自我推广比例要求比 HN 更严（大量 self-post 的账号会被社区检举）；tags 必填（`rust`、`javascript`、`web`、展示类用 `show`）。文化上极重技术细节，评论区问题会很尖锐，作者要能接住。
- **时段通行认知**：站小、feed 慢，时段不敏感；与 HN 受众高度重叠，**与 Show HN 错开数天**，避免被视为多平台刷屏。

---

## 横向纪律（适用所有英文渠道）

1. 同一篇文章在不同渠道投放要错开日期（详见 [schedule.md](./SCHEDULE.md)）。
2. 所有涉及 Univer/Handsontable 的对比表述，只用 README「Dated product facts」与 `docs/UNIVER_PRODUCT_EVIDENCE.md` 的带来源口径，不说优劣（见 [showhn-checklist.md](./SHOWHN_CHECKLIST.md) FAQ 节）。
3. 规模/性能话题一律回到「代码契约，不做性能/容量/SLA 主张」的 README 原话边界。
