# 006 独立审查

**REJECTED**。入口迁移、canonical demos、i18n 实体迁移与普通文件行数基本符合任务目标，但 CSS 是跨文件的语法/职责假拆分，违反本仓硬性单一职责规则；`gotoDemo` 对冲突 query 也没有真正合并 flag。

## 阻断发现

### [重要] CSS 在规则块中间切开，且职责边界交叉

- `demo/app-shell.css:28-31` 开始 `.app-title {` 后没有在本文件闭合；`demo/navigation.css:1` 以孤立的 `}` 开头。两个独立 stylesheet 不能共享一个 CSS block，这不是有效的按职责拆分。Vite/PostCSS 能容错并不改变源文件分别语法不完整的事实。
- 导航职责也没有落在 `navigation.css` 内：`.nav-group-sep` 位于 `app-shell.css:32-38`；反过来 app header 的 `.app-subtitle` 位于 `navigation.css:3-7`。
- import toolbar 同样跨职责文件：主体规则在 `app-shell.css:87-118`，disabled/cancel/status/error 延续在 `legacy-table.css:1-31`。这符合 `one-file-one-thing` 所列“假拆分”特征：理解或修改同一个控件必须同时打开两个文件。

因此，虽然三个 CSS 文件分别为 118/78/196 行且机械行数达标，验收 4 背后的单一职责硬规则未通过。应至少先补齐每个文件的独立语法边界，再将 navigation、app shell、legacy table/import UI 依实际职责完整归位。

## 质量发现

### [一般] `gotoDemo` 追加参数而非规范化合并冲突 flag

`e2e/helpers.ts:83-86` 将 caller query 原样放在前面，再追加 `legacy=1`。若 caller 已传 `legacy=0`，结果是 `legacy=0&legacy=1`，而 `URLSearchParams.get('legacy')` 读取第一个值，最终仍进入 current；若传 `bench=1`，`demo/main.tsx:8-10` 令 bench 优先，根本不会出现 legacy 导航。`locale` 与 `backend` 的保留/去重逻辑本身仍成立，但“自动补 legacy”尚未对互斥 flag 做真正 query merge。建议使用 `URLSearchParams.set('legacy', '1')` 并删除/覆盖冲突的 `bench`，而非字符串追加。

## 逐条验收与覆盖矩阵

1. **构建：报告通过，本审查未重跑。** `index.html:11` 只有一个 module script，指向 `/demo/main.tsx`；旧 `src/main.tsx` 已删除。`demo/main.tsx` 是唯一 Vite render 入口。
2. **目标 E2E：报告为 25 passed，本审查未重跑。** 默认无 flag 进入 current；`legacy=1` 选择 legacy groups；`bench=1` 在顶层优先选择 `BenchRoot`。静态上三种渲染结果互斥，但冲突 query 的 helper 行为存在上述一般问题。
3. **TypeScript：报告通过，本审查未重跑。** `tsconfig.json` 已覆盖 `demo/**`、`bench/**` 与 `src-vnext/**`。
4. **行数：机械检查通过，职责检查失败。** demo 为 11–196 行，bench 为 20–181 行，i18n 实现 119 行；无普通新增文件超过 300 行。但 CSS 假拆分构成阻断。

- **C-003：通过。** 默认 current groups 只包含四个 canonical barrel exports 与 remote demo，默认 tab 仍为 `vnext-wave5`（remote backend 为 `vnext-remote`）。
- **C-004：部分通过。** `legacy=1` 的四组、tab id、label key、组件映射与基线一致；`gotoDemo` 保持常规 caller query、locale 与 project backend。不过冲突 legacy/bench 参数未被规范化，见一般发现。
- **C-005：通过（静态）。** `src/bench/**` 已迁到 `bench/**`；registry 仍注册 scroll/recalc/first-screen，除相对 import 与拆分后的 CSS import 外未见语义变化；报告说明没有重跑长期 benchmark 采样。
- **C-009：通过本叶边界。** `demo/App.tsx` 直接消费 `src-vnext/demos` canonical barrel。i18n 的 source authority 仅在 `src-vnext/i18n/**`；所有现役 `src-vnext` 的 i18n imports 已迁到该目录。`src/i18n/index.ts` 只有兼容 re-export，现存 legacy demos/tests 通过它消费，属于任务 009 的阶段接口而非重复实体。
- **C-013：通过本叶静态范围。** `withEnglishLocale`/`gotoRoot` 的 backend 合并未被改坏，常规 `gotoDemo(debug=...)` 同时保留 backend、locale、legacy。报告只执行 wasm，未验证 TS browser project，残余风险如实保留。

## 薄桥与唯一实体判定

- `src/App.tsx` 仅两行，供 `src/demos/index.ts` 暂时 re-export `App`，没有导航壳实现；可接受为任务 007 阶段接口。
- `src/i18n/index.ts` 仅两行 re-export，没有 catalog/store/locale 状态；可接受为任务 009 阶段接口。
- `src-vnext/i18n/index.ts` 是唯一源实现，`locales/{en,zh}.ts` 也只在该 source 目录存在。`esm/` 与 `@types/` 下旧路径文件是既有构建产物，不构成第二份 source authority，但后续正式产物切换应由 009 验证。

一句话回执：**REJECTED — 功能迁移主体成立，但 CSS 跨文件切断语法块且职责交叉，必须修复后再审。**

---

## R1 复审

**APPROVED**。原审查的两项发现均已关闭；本轮只核对修复范围，报告中的已跑测试未重跑。

### 原阻断：CSS 语法与职责 — 已关闭

- `demo/app-shell.css` 的 `.app-title` 已在本文件闭合，`.app-subtitle` 已归回同一 app/header 壳职责；文件从全局页面壳到 demo 内容壳均语法独立完整。
- `demo/navigation.css` 不再以孤立 `}` 开头，locale switcher、tab bar 与 `.nav-group-sep` 均完整归于导航职责。
- 新增 `demo/import-toolbar.css` 完整收拢 `.import-toolbar`、file label/input、disabled、cancel、status/stats/error 的全部状态规则；不再需要跨文件理解或修改同一控件。
- `demo/legacy-table.css` 现在从 `.excel-table-wrapper` 开始，只保留旧表格 wrapper、虚拟 spacer、header、cell、edit/selection 样式，不再夹带 import toolbar 职责。
- 四个文件的 `{`/`}` 均逐文件配平，行数分别为 85、77、63、164，未出现新的行数或假拆分问题。

### 原一般发现：`gotoDemo` 冲突 query — 已关闭

- `e2e/helpers.ts:84-87` 先用 `URLSearchParams` 解析 caller query，再以 `set('legacy', '1')` 覆盖既有 legacy 值，并以 `delete('bench')` 删除所有 bench 冲突值；不会再产生 first-value-wins 或 benchmark 抢占 legacy 导航。
- 随后传给既有 `withEnglishLocale`：caller 已提供的 `locale`、`backend` 仍被保留；未提供时仍按原逻辑补 `locale=en` 与当前 Playwright project backend。
- `e2e/demos/demo-budget.spec.ts` 新增冲突路由回归，输入 `legacy=0&bench=1&locale=en&backend=wasm`，逐项断言最终 `legacy=1`、`bench` 不存在、locale/backend 保持不变。
- 更新报告记录目标 wasm current + legacy 套件 **26 passed (24.7s)**，即原 25 条加上述冲突参数用例；本复审按要求不重跑。

一句话回执：**APPROVED — CSS 已各自语法完整并真实按职责归位，`gotoDemo` 已规范化互斥参数且新增回归测试据报告通过。**
