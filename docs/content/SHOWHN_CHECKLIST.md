# AD-620 Show HN 落地检查单

> **性质**：发布「弹药」。逐项确认全绿后，由维护者亲手发布；任何一项红灯即推迟。
> 正文与标题见 [showhn-post.md](./showhn-post.md)，时点见 [schedule.md](./schedule.md)。

## A. 安装链路（已有背书 + 当日复验）

- [ ] **既有背书在案**（引用即可，不必重跑）：
  - AD-137 本地 registry 全链路 dry-run（2026-08-17，五包 0.1.0 经 verdaccio 发布并被仓外消费者安装/解析/类型检查，`docs/AD137_LOCAL_REGISTRY_DRYRUN_OBSERVATION.md`）
  - AD-138 Vite 仓外冒烟（通过，`docs/AD138_VITE_SMOKE_OBSERVATION.md`）
  - AD-139 webpack 仓外冒烟（通过，验证了预编译 ESM 路径，`docs/AD139_WEBPACK_SMOKE_OBSERVATION.md`）
  - AD-140 Next 仓外冒烟（通过，框架中立包 + client bundle，`docs/AD140_NEXT_SMOKE_OBSERVATION.md`）
  - AD-141 Nuxt 仓外冒烟（通过，注明 solid-excel 仅安装/解析，`docs/AD141_NUXT_SMOKE_OBSERVATION.md`）
- [ ] **发布当日**在仓外干净目录复跑一次最小链路：`npm install @einfach/solid-excel solid-js`（Node ≥22.12.0）→ Vite 模板能构建、浏览器能渲染。HN 读者第一件事就是装包。
- [ ] npm 五个包页面正常：README 渲染、版本 0.1.0、license MIT 字段、repo 链接可点。

## B. Demo 可点

- [ ] https://allroad88888888.github.io/einfach-excel/ 冷缓存打开（无痕窗口），首屏可交互。
- [ ] 核心动线各点一遍：选区、编辑、公式输入、filter/sort、undo/redo、find/replace。
- [ ] Console 无红色报错；至少 Chrome + Firefox + Safari 各开一次。
- [ ] 移动端打开至少不白屏（HN 相当比例读者在手机上点）。
- [ ] demo 页能一眼找到「回 GitHub / 回 npm」的链接。

## C. README 首屏（HN 落点是 repo）

- [ ] 首屏五要素齐且无过期：一句话定位、live demo 徽章/链接、`npm install` 命令、0.x 阶段说明（minor 可破坏、`~0.1.0` 钉法）、MIT License 徽章。
- [ ] 「仅 Solid 绑定，无 React/Vue 集成」的诚实段落在场（README「Framework integrations」现有口径）。
- [ ] 中英 README 口径一致（不逐字互译但事实一致）。
- [ ] GitHub 门面：repo description 与 topics 对齐定位（AD-414/415）、CI 徽章绿、Issues 开启、LICENSE 文件在根目录。

## D. 作者在线响应窗口

- [ ] 选发布时点时**同时选好自己的守候窗口**：发布后 4–6 小时能持续回复评论（HN 峰值讨论集中在前几小时；美东上午 ≈ 北京晚间，对时区反而友好）。
- [ ] 发布后 24 小时内不安排其它需要专注的事；48 小时内每天至少查两轮评论。
- [ ] 提前登录 HN 账号，确认能正常发帖与评论（新号/低 karma 账号先在别的帖子正常参与几天）。

## E. 常见问题预备答案（口径卡）

统一纪律：竞品只说**带来源的事实**，不说优劣（`docs/UNIVER_PRODUCT_EVIDENCE.md` / `docs/HANDSONTABLE_PRODUCT_EVIDENCE.md` 的证据口径）；规模问题守 README 原话边界。

1. **"Why yet another spreadsheet?"**
   —— 差异不在功能量在边界：UI core 与 workbook 实现之间是显式 backend port（三个必需方法，其余全可选、缺哪个 UI 降级哪个），载荷跟视口不跟工作簿。想换数据后端/换计算引擎的人才需要这个形状；要全家桶请直接用成熟全家桶。
2. **"How does it compare to Univer / Handsontable?"**
   —— 只给事实 + 来源：Univer 的 LICENSE 文本标识为 Apache 2.0，其文档记载了 UMD/CDN 形态与「公式计算在 Web Worker」的方案；Handsontable 的 LICENSE.txt 自述为双许可（非商业 + 商业）。本项目 MIT。各自适合谁由读者判断；README「Dated product facts」表带核实日期与来源链接，明确写了「不要从表中推断产品优势」。
3. **"Any performance numbers / how big a sheet can it handle?"**
   —— 诚实边界（README 原话方向）：规模相关行为以**当前代码契约**表达（按存储条目遍历、显式矩形投影、越界结果被拒绝），**不做性能、内存、容量、传输或生产 SLA 主张**。有 dated observations 文档记录具体修订上的观察，欢迎自己跑。
4. **"React/Vue support?"**
   —— 当前口径：`spreadsheet-ui-core` 框架无关，但这**不等于**已有 React/Vue 集成；目前唯一提供的绑定是 Solid。README 明说了这一点。（若发帖时 AD-300 已有进展，按届时事实更新此答案。）
5. **"Why Solid.js?"**
   —— 细粒度响应式和 atom 模型天然契合；也踩过真实的坑（一个进程两份物理 solid-js 导致 Provider 重挂，有 ADR 0001 + 契约测试钉住）。这是后续文章素材，可给链接。
6. **"Why both a Rust/WASM engine and a TS engine?"**
   —— Rust 是现役主引擎；TS 引擎是 parity 参照兼纯 JS 部署路径。两个 worker 后端跑同一批 e2e 用例钉 parity（`excel/solid-excel/e2e/BACKEND_PARITY.md`）。
7. **"Is it production ready?"**
   —— 0.1.0，不装成熟：minor 可能破坏兼容（CHANGELOG 明列 removals），钉 `~0.1.0` 可获得稳定面；Node ≥22.12.0；面向 bundler，不支持 bare-Node import；peer 依赖必须单实例。
8. **"Who's behind this / will it be maintained?"**
   —— 如实回答维护者身份与投入方式，指向 README 维护者与响应预期段（AD-413）。不承诺做不到的响应 SLA。

## F. 发帖机制项

- [ ] 标题以 `Show HN: ` 开头，≤80 字符（备选见 showhn-post.md，发布前重数一次字符）。
- [ ] URL 提交 **GitHub repo**（demo 链接放正文与 README 首屏——repo 落点能同时承接 demo、npm、docs 三条线）。
- [ ] 正文用 text 附上（HN 允许 Show HN 带正文），150–250 词，见 showhn-post.md。
- [ ] **不拉票**：不私发求赞、不让同事同网段点赞（voting-ring 检测）；只可中性分享讨论页链接。
- [ ] 发布后把 HN 讨论页链接记入 AD-625 回收档。
- [ ] 失败预案：无水花不删帖；隔 1–2 周换角度重发一次，重发前把学到的问题补进 README。
