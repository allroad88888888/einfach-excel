# AD-219 新人走查：README → 能编辑单元格的表格

- **走查人设**：从未接触过本项目的前端工程师，只看公开文档，字面照做。
- **入口**：`README.md`（本地镜像 `/Volumes/work/self/excel/README.md`）→ `docs/QUICKSTART.md`。
- **环境**：macOS，Node v24.14.0（满足 >=22.12.0），npm 11.9.0，registry 强制 `https://registry.npmjs.org/`（工程级 `.npmrc`）。
- **工作目录**：`…/scratchpad/walkthrough/my-sheet`（Vite 脚手架工程）。
- **结论先行**：**走通了，但不是按文档写的路走通的。** 模板路（一键起步）全死；手工路的 `npm run dev` 开箱即坏，最终经「生产构建 + preview」完成验收（浏览器实测 双击 A1 → `=1+2` → 回车 → 显示 `3`，截图 `walkthrough/probe2-final.png`）。阻断级卡点 **2 个**。

---

## 逐步记录

### 第 0 步：读 README，选路

- **文档说**：README 顶部给了 Quickstart 链接；「Release status」节说五个包 2026-08-17 已发 npm `0.1.0`，给了 `npm install @einfach/solid-excel solid-js`；「Get started locally」节却写前提 **Node.js 18 or later (CI covers Node.js 18 and 20)** + pnpm 10 + Rust 工具链，走 clone 仓库；「Minimal repository-checkout example」节又说 *"the project is documented for use from a repository checkout … it is not an npm-installation path"*。
- **实际发生**：三个小节口径互相打架——npm 已发布 vs "只文档化了 checkout 用法"；Node 18+ vs 同页下文的 baseline >=22.12.0。npm 包实测 `engines: { node: ">=22.12.0" }`，照 Prerequisites 装 Node 18 会直接撞 engines。新人在这一页要自行仲裁三种矛盾说法。
- **定级**：摩擦（Node 版本矛盾，可把人送错方向）+ 瑕疵（checkout-only 陈旧段落）。

### 第 1 步：Quickstart 模板路（"一键起步"）——死路

- **文档说**（`docs/QUICKSTART.md` §一键起步）：`npx degit allroad88888888/einfach-excel/templates/vite-starter my-sheet && cd my-sheet && npm i && npm run dev`，并给 StackBlitz / CodeSandbox 在线链接，声称"已在 Node 22.12.0 + 官方 registry 上离体验证构建"。
- **实际发生**：degit 报 **`could not find subdirectory /templates/vite-starter in archive`**。GitHub contents API 查 `templates/` → **404**。本地镜像里 `templates/vite-starter/` 存在且已提交（commit `158406c`），但**没有推送到 GitHub**。同理 StackBlitz / CodeSandbox 两个链接指向同一 GitHub 路径，全部失效。
- **定级**：**阻断**（三个"最低门槛"入口对真实用户全部 404）。

### 第 2 步：手工路——脚手架 + 装包（顺利）

- **文档说**：`npm create vite@latest my-sheet -- --template solid-ts`；然后 `npm install @einfach/solid-excel @einfach/core @einfach/solid solid-js`。
- **实际发生**：脚手架顺利（拿到 Vite **8.2.1** + vite-plugin-solid 2.11，注意与后文 recipe 钉的 ^5.4 不一致）。装包一次成功：`@einfach/solid-excel@0.1.0` 及 fixed group 全到位，`@einfach/core@0.4.0`、`@einfach/solid@0.4.0`、`solid-js@1.9.14` 且 npm ls 确认单实例。这一步体验良好。
- **小字**：文档处处强调钉 `solid-js 1.9.12`（vite recipe、模板 package.json），照 Quickstart 命令实装的是 `1.9.14`（peer `^1.9.12` 放行）。没出问题，但"钉 1.9.12"的说法与实际到手版本不一致。定级：瑕疵。

### 第 3 步：20 行示例——写错了地方，静默失败

- **文档说**：「替换 `src/main.tsx`（`index.html` 里有 `<div id="root">` 即可）」。
- **实际发生**：照做后 `npm run dev`，页面是 **Vite 模板默认首页**（Get started + 计数器），无任何报错。原因：**当前 create-vite 的 solid-ts 模板入口是 `src/index.tsx`**，`index.html` 的 `<script src="/src/index.tsx">` 根本不引用 main.tsx——我写的文件是个孤儿。文档假设的是老模板布局。零报错、零提示，只能靠自己打开 index.html 发现。
- **绕过**：把 index.html 的 script 指到 `/src/main.tsx`（偏离文档，记录在案）。
- **定级**：摩擦（高）——不阻断但属于最恶劣的失败形态：静默无效。

### 第 4 步：`npm run dev`——开箱即坏（白屏）

- **文档说**：Quickstart 第 3 节 `npm run dev` → 双击 A1 输入 `=1+2` → 显示 3；并强调「**不需要任何 vite 配置改动**」。`docs/recipes/vite.md` 同样说「零特殊配置」。
- **实际发生**：页面全白，pageerror：
  `The requested module '/node_modules/@messageformat/parser/lib/parser.js' does not provide an export named 'parse'`
  依赖链：`@einfach/solid-excel → @lingui/core@6.6.0 → @lingui/message-utils → @messageformat/parser@5.1.1`（纯 CJS 包，dev 下被当 ESM 直出）。根因组合：包走 `solid` 导出条件从 node_modules 内源码编译（ADR 0019），其 CJS 传递依赖逃过了 Vite 预打包。
- **文档自查**：`vite.md` 的「未验证」节其实自曝了——冒烟只走 `vite build` + `preview`，钉 vite ^5.4，**dev-server/HMR 未验证**。但 Quickstart 主流程教的恰恰是 `npm run dev`，且全文档无 troubleshooting、无此错误的只言片语。
- **复现矩阵**（本次实测）：
  | 路径 | Vite 8.2.1 | Vite 5.4.21（recipe 钉的版本） |
  |---|---|---|
  | `dev`（零配置） | 白屏，@messageformat 报错 | 白屏，同样报错 |
  | `dev` + `optimizeDeps.include:['@lingui/core']` | **修好，验收 PASS** | 恶化为 `SpreadsheetUiProvider is required.`（ADR 0001 双实例症状） |
  | `dev` + `exclude:['@einfach/solid-excel']` + 嵌套 include（含清缓存冷启动） | 未测（8 已有解） | 仍 `SpreadsheetUiProvider is required.` |
  | `build` + `preview`（零配置） | **PASS** | **PASS** |
- **定级**：**阻断**——Quickstart 的字面路径（scaffold → dev）在两个 Vite 大版本上都到不了"输入公式"这一步；Vite 5 下我没有找到任何简单配置能救活 dev。
- **绕过**：a) `npm run build && npm run preview`（文档没教，但这才是它冒烟过的路）；b) Vite 8 上加一行 `optimizeDeps: { include: ['@lingui/core'] }`。

### 第 5 步：最终验收（走通）

- `npm run build`：一次通过，856 modules，产物与文档描述吻合（`worker-runtime`、`worker-entry-ts` 两个 worker chunk + `einfach_wasm_bg-*.wasm` 1.86MB）。`tsc -b` 也零报错——README 说的 TS `lib`/`moduleResolution` 前提在脚手架默认 tsconfig 下成立。
- `npm run preview` + Playwright Chromium：网格渲染（`role="grid"`，列头 A–L，行号，a11y 属性齐全）；双击 A1 → 出现编辑框 → 键入 `=1+2` → Enter → **A1 显示 `3`**，控制台零错误。截图 `walkthrough/probe2-final.png`。
- 同一验收在「Vite 8 dev + include 修复」路径上也 PASS。

### 第 6 步：文档交叉核查（顺手发现）

`git ls-files` 全树证实以下被引用的文件**不存在**：

| 引用处 | 引用了 | 实际 |
|---|---|---|
| `docs/QUICKSTART.md`（两处）、间接 `docs/recipes/README.md` 表格 | `recipes-index.md` | 应为 `docs/recipes/README.md` |
| `docs/QUICKSTART.md`、`docs/recipes/next.md`、`docs/recipes/README.md` | `ui-core-only.md` | 应为 `docs/UI_CORE_ONLY.md` |
| `docs/QUICKSTART.md`、`docs/recipes/vite.md` 的「事实来源」 | `ad200/verification.md` | 全仓不存在（事实来源指向幽灵记录） |
| `docs/recipes/vite.md` | `quickstart.md` | 应为 `docs/QUICKSTART.md`（Linux/GitHub 大小写敏感） |

这些都写成行内代码而非 Markdown 链接，所以 `npm run check:docs` 链接门禁抓不到。定级：摩擦（新人按名找文件会扑空 4 次）。

---

## 卡点分级汇总

**阻断（2）**
1. 模板入口三连死：`templates/vite-starter` 未推送 GitHub，degit / StackBlitz / CodeSandbox 全 404（QUICKSTART §一键起步）。
2. `npm run dev` 开箱白屏：`@messageformat/parser` CJS/ESM interop 崩溃，Vite 5 与 8 均复现；与 Quickstart「不需要任何 vite 配置改动」+ 第 3 节 dev 流程直接冲突；文档无 troubleshooting。

**摩擦（4）**
3. 「替换 `src/main.tsx`」在当前 create-vite solid-ts 模板（入口 `src/index.tsx`）下静默无效，零报错。
4. README Prerequisites 写 Node 18+/CI 18 和 20，同页与 npm 包 engines 均为 >=22.12.0。
5. 幽灵文档引用 ×4（recipes-index.md / ui-core-only.md / ad200/verification.md / quickstart.md 小写），check:docs 门禁盲区。
6. 工具链口径分裂：Quickstart 教 `create vite@latest`（今天=Vite 8），vite recipe 钉 ^5.4 并自曝 dev 未验证——两份文档各说各话，且哪个组合都过不了 dev。

**瑕疵（3）**
7. 文档强调钉 `solid-js 1.9.12`，Quickstart 命令实装 1.9.14（peer ^1.9.12 放行）；实测没炸，但口径不一致。
8. README「Minimal repository-checkout example」节仍称项目"documented for use from a repository checkout / not an npm-installation path"，与已发布状态和 Quickstart 冲突（陈旧段落）。
9. `vite build` 有 >500kB chunk 警告（641kB 主 chunk），文档未提预期（认知噪音，非功能问题）。

---

## 建议修复清单

| # | 修什么 | 修哪里 |
|---|---|---|
| 1 | 把 `templates/`（commit `158406c`）推送到 GitHub；推不了就先从 QUICKSTART 删掉「一键起步」节及两个在线链接——现状是给新人的第一条路 100% 失败 | 发布流程（git push）或 `docs/QUICKSTART.md` |
| 2 | 治本：消除 `@einfach/solid-excel` 对 `@lingui/core`（携 CJS 的 `@messageformat/parser`）的运行时依赖，或改为打包进产物/ESM-safe 引入，使 `solid` 源码条件下无裸 CJS 传递依赖 | `excel/solid-excel` 包依赖（代码） |
| 3 | 治标（在 #2 落地前）：Quickstart 与 vite recipe 明写「dev 需要 `optimizeDeps: { include: ['@lingui/core'] }`（Vite 8 实测）」，并把「不需要任何 vite 配置改动」「零特殊配置」的措辞降级为仅指 build 路径；同时把 `build`+`preview` 作为已验证路径写进 Quickstart 正文 | `docs/QUICKSTART.md`、`docs/recipes/vite.md` |
| 4 | vite recipe 钉的 `vite ^5.4` 与该修复不兼容（实测触发 `SpreadsheetUiProvider is required` 双实例症状且无简单解）：要么验证并升级 recipe 到 Vite 8 口径，要么在 recipe 里明写「dev 在 ^5.4 上不可用」 | `docs/recipes/vite.md`（必要时补 ADR/observation） |
| 5 | 「替换 `src/main.tsx`」改为「把 20 行写入脚手架入口文件（当前 solid-ts 模板为 `src/index.tsx`；以 `index.html` 的 `<script src>` 为准）」 | `docs/QUICKSTART.md`（`templates/vite-starter` 自身入口是 main.tsx，一致，不用改） |
| 6 | 修 4 处幽灵引用：`recipes-index.md`→`docs/recipes/README.md`、`ui-core-only.md`→`docs/UI_CORE_ONLY.md`、`quickstart.md`→`QUICKSTART.md`、删除或补上 `ad200/verification.md`；并让 `check:docs` 也扫行内代码形态的 `.md` 引用（或统一改成真链接） | `docs/QUICKSTART.md`、`docs/recipes/vite.md`、`docs/recipes/next.md`、`docs/recipes/README.md`、`scripts/`（check:docs） |
| 7 | README「Get started locally」Prerequisites 的 Node 18/CI 18-20 改为 >=22.12.0，与同页 Release status、ADR 0018、npm engines 对齐 | `README.md` |
| 8 | 删除/改写「repository-checkout only」陈旧段落，明确 npm 安装是受支持路径 | `README.md` §Minimal repository-checkout example |
| 9 | solid-js 版本口径统一：要么 peer 收紧到 1.9.12，要么文档改说「^1.9.12 均可（实测 1.9.14）」 | `docs/recipes/vite.md`、`templates/vite-starter/package.json` 或 `excel/solid-excel/package.json` peer |

---

## 好的部分（如实记）

- npm 官方 registry 上五包齐全、一次装成、依赖树干净（solid-js 单实例自动成立）。
- `vite build` + `preview` 路径零配置即通，产物结构与文档描述逐字吻合（两 worker chunk + 1.86MB wasm）。
- 20 行示例代码本身（API 面）完全正确：backend/provider/grid 三件套、worker factory 子路径、样式导入，照抄即用。
- 网格 DOM 质量高：语义化 role/aria、稳定的 data-testid，黑盒自动化验证毫不费力。

## 验收凭证

- 走查工程：`…/scratchpad/walkthrough/my-sheet/`
- 探针脚本：`…/scratchpad/walkthrough/probe1.js`（诊断）、`probe2.js`（验收）
- 截图：`…/scratchpad/walkthrough/probe2-final.png`（A1=3，网格完整）
- 服务日志：`walkthrough/dev-server.log`（Vite 8 dev 报错现场）、`dev5-server.log`/`dev5b-server.log`（Vite 5 实验）、`preview-server.log`
