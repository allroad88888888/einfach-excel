# React Excel 小批次验收路线

## 阶段门

- M0 只建立真实 Rust/WASM 最小链，由自动测试与独立 reviewer 放行。
- S01 起每阶段只交付 2–4 个用户功能；完成后给出不超过 5 条人工步骤并停止。
- 用户通过才展开下一阶段；失败则在当前阶段开 `discovered_from` 修复叶。
- 未展开 group 不是可派发任务。

## 路线

| stage | priority | 用户功能 | readiness | 用户验收重点 | status |
|---|---|---|---|---|---|
| M0 | P0 | private neutral Rust worker、React runtime、browser gate | detailed | 真 WASM ready/read/edit/dispose；零 TS/Solid route | review_pending |
| S01 | P0 | loading/retry、虚拟滚动、选择、单格编辑、Univer shell | detailed | 1000 行；选择；编辑；界面方向 | pending |
| S02 | P0 | Sheet tabs、Name Box/Go To、公式栏、undo/redo | backlog | 切表；定位；公式；撤销 | pending |
| S03 | P0 | copy/cut/paste、Paste Special、AutoFill、Find/Replace | backlog | 延迟 cut；选择性粘贴；系列；替换 | pending |
| S04 | P1 | 行列结构、尺寸隐藏、冻结、合并 | backlog | 插删；尺寸；隐藏；冻结；合并 | pending |
| S05 | P1 | outline、rich/spill、常用格式、数字格式 | backlog | 大纲；富值；字体；日期货币 | pending |
| S06 | P1 | 格式刷、条件格式、数据验证、border/rotation | contract_first | 规则；验证；shared-edge；diagonal | pending |
| S07 | P1 | filter/sort、remove duplicates、status summary | backlog | 排序筛选；去重；统计 | pending |
| S08 | P1 | formula dialect、autocomplete、async/recalc | contract_first | A1/R1C1；名称；补全；重算 | pending |
| S09 | P1 | custom formulas、named ranges、Table CRUD/totals | mixed | Rust 回调；名称；Table | pending |
| S10 | P1 | Table resize/style/filter、Sheet Views | contract_first | resize/style/filter；个人视图 | pending |
| S11 | P2 | workbook codec、import/export、recovery | contract_first | 原子 roundtrip；失败不覆盖 | pending |
| S12 | P2 | page setup、pagination、browser print | contract_first | 页边界；多页预览；焦点恢复 | pending |
| S13 | P2 | menu/diagnostics、theme、i18n | backlog | 键盘菜单；错误；中英文；主题 | pending |
| S14 | P2 | responsive chrome、mobile touch、a11y | backlog | 390px；触摸；键盘；reduced motion | pending |
| S15 | P3 | comments/tasks、presence、protection | service_gated | 保护可用；服务能力真实门禁 | pending |
| S16 | P3 | Show Changes、versions、perf/RC | service_gated | 真实 revision service；最终审计 | pending |

## 当前用户检查点

- M0 不打扰用户；完成后直接进入 S01。
- S01 完成后只测试：打开 Rust 工作簿、滚到第 1000 行、选择并编辑、确认界面方向。
