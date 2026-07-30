# copy-as — e2e cases

> 功能源码：excel/spreadsheet-ui-core/src/copy-as/（html/markdown/plain/png 编码器 + atoms）
> + src-vnext/provider/copy-as-dispatch.ts（multiTierWrite 三级降级 + PNG 双级降级）
> + src-vnext/copy-as/renderRangeAsImage.ts
> 存量 spec 行数超限登记（如有）：copy-as.spec.ts 330 行（历史文件，只登记不拆）

全部用例跑在 vNext Wave 5 静态 demo，经 `__EINFACH_E2E__` 运行时开关读
`window.__einfach_lastCopyAs__` 镜像（`lastCopyAsAtom` 的 e2e 投影）断言。
降级链（copy-as-dispatch.ts::multiTierWrite）：
tier 1 ClipboardItem(html+plain+markdown) → tier 2 ClipboardItem(html+plain) →
tier 3 writeText(plain)；PNG：ClipboardItem(image/png) → atom-only 软成功。

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| CA-01 | Ctrl+Shift+C 产出三 flavour | 选 2x2 → Ctrl+Shift+C | 镜像含 html/plain/markdown | ✅ 存量 | copy-as #"selecting a 2x2 region and pressing Ctrl+Shift+C emits all three flavours" |
| CA-02 | Ctrl+C 仍走 legacy copy | 无 shift 复制 | 镜像不变，剪贴板有文本 | ✅ 存量 | copy-as #"Ctrl+C (no shift) still routes through the legacy copy path" |
| CA-03 | HTML 保留 bold/bg/fg 样式 | 复制预置样式 A1 | inline style 命中 hex，无 url( | ✅ 存量 | copy-as #"preserves bold + bgColor + fgColor from a pre-styled anchor cell" |
| CA-04 | GFM markdown 表结构 | 2x2 复制 | 头行/分隔行/数据行匹配 | ✅ 存量 | copy-as #"emits GFM markdown table syntax for a 2x2 selection" |
| CA-05 | TSV plain 精确形状 | 2x2 复制 | 精确等于 '120\t180\n80\t160' | ✅ 存量 | copy-as #"emits TSV plain text with tab between columns and \\n between rows" |
| CA-06 | 合并区 rowspan/colspan | 合并 A1:B2 后复制 A1:C3 | html 含 rowspan="2" colspan="2" | ✅ 存量 | copy-as #"emits rowspan/colspan on the anchor of a merged A1:B2 region" |
| CA-07 | clipboard.write 被拒 → writeText 降级 | 注入 write reject | 镜像仍全量，writeText 收到 TSV | ✅ 存量 | copy-as #"falls back to writeText(plainText) when clipboard.write rejects" |
| CA-08 | 菜单入口与快捷键同流 | Edit → Copy as | — | ⏳ P2 延后 | copy-as #"menu entry…"（test.fixme：Wave 5 无菜单栏，单测 vnext-copy-as.test.tsx 覆盖） |
| CA-09 | 超限选区裁剪为纯文本 | >100k 格选区 | — | ⏳ P2 延后 | copy-as #"oversize selection…"（test.fixme：demo 上限 800 格，单测覆盖） |
| CA-10 | fgColor CSS 注入被白名单剥离 | 恶意颜色串 | — | ⏳ P2 延后 | copy-as #"CSS injection…"（test.fixme：无自由格式 setter，单测覆盖） |
| CA-11 | Ctrl+Shift+P 产出 image/png | 2×2 → Ctrl+Shift+P | 镜像 kind=image 且 blob 非空 | ✅ 存量 | copy-as-png #"2×2 selection mirrors a non-empty image/png blob into lastCopyAsAtom" |
| CA-12 | 单格 Ctrl+Shift+P 仍出图 | 单格按下 | 镜像 kind=image | ✅ 存量 | copy-as-png #"Ctrl+Shift+P with no selection rectangle leaves the mirror untouched" |
| CA-13 | ClipboardItem 构造抛错 → writeText 降级 | init 注入抛错构造器 | 镜像仍全三 flavour，writeText 收到 TSV | 🆕 本轮 | copy-as-degradation.spec.ts #"ClipboardItem constructor throwing…" |
| CA-14 | ClipboardItem 缺失（undefined）直落 tier 3 | init 置 undefined | 同 CA-13 | 🆕 本轮 | copy-as-degradation.spec.ts #"missing ClipboardItem…" |
| CA-15 | 全链失败镜像保持不变 | 构造抛错 + writeText reject | 镜像保持 null（不写陈旧值） | 🆕 本轮 | copy-as-degradation.spec.ts #"total clipboard failure…" |
| CA-16 | PNG：ClipboardItem 缺失仍发布快照 | 置 undefined 后 Ctrl+Shift+P | 镜像先于剪贴板写入，blob 非空 | 🆕 本轮 | copy-as-degradation.spec.ts #"PNG snapshot still publishes…" |
| CA-17 | HTML flavour 转义标记字符 | 单元格填 <b>&"quoted" | html 含 &lt;b&gt;&amp;&quot;，不含裸 <b> | 🆕 本轮 | copy-as-flavour-shape.spec.ts #"HTML flavour escapes…" |
| CA-18 | Markdown flavour 转义竖线 | 单元格填 a\|b | markdown 含 a\\\|b，表结构完好 | 🆕 本轮 | copy-as-flavour-shape.spec.ts #"markdown flavour escapes pipes…" |
| CA-19 | 空格子在三 flavour 中保位 | 2x2 含一空格 | TSV 空字段/GFM 空列/空 td | 🆕 本轮 | copy-as-flavour-shape.spec.ts #"empty cells keep their slot…" |
| CA-20 | HTML 结构形状（tr/td 计数） | 2x2 复制 | 1 table / 2 tr / 4 td | 🆕 本轮 | copy-as-flavour-shape.spec.ts #"HTML flavour structural shape…" |
| CA-21 | tier 2（丢 markdown 的 rich 写入）可区分断言 | 仅 markdown MIME 被拒 | — | ⏳ P2 延后 | —（镜像三 flavour 恒全量，区分 tier 需读系统剪贴板 MIME 列表，headless 不稳定） |
| CA-22 | 过滤隐藏行不进 copy-as 输出 | 筛选后复制跨隐藏行区 | — | ⏳ P2 延后 | —（S5 flip 前 rect 内无 filter-hidden 行，行为不可达；单测 copy-as.test.ts 覆盖） |

## 备注

- CA-13/14/15 用 `context.addInitScript` 替换 `window.ClipboardItem` / `navigator.clipboard.writeText`
  模拟浏览器拒绝；镜像只在任一 tier 成功后写入（copy-as-dispatch.ts），
  全链失败必须保持上一次成功值（首轮即 null）—— 这是产品对"陈旧值误导诊断"的显式承诺。
- PNG 路径与文本路径相反：快照在尝试系统剪贴板**之前**先发布（CA-16 断言依据）。
