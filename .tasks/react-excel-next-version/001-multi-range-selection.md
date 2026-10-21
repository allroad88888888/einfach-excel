---
id: 001
title: 手动建立并操作非连续选区
kind: leaf
parent: null
depends_on: []
model: gpt-6.1-sol
reasoning_effort: xhigh
status: done
created: 2026-10-21
done: 2026-10-21
base: b2ab6a1a0287cf6f0123ce3d7d55c07180264cfb
files:
  - excel/react-excel/src/workbook/multi-range-selection/
  - excel/react-excel/src/workbook/selection/use-grid-pointer-selection.ts
  - excel/react-excel/test/workbook/multi-range-selection/
  - excel/react-excel/test/workbook/selection/pointer-selection.test.tsx
  - excel/react-excel/e2e/multi-range-selection/
  - excel/react-excel/docs/multi-range-selection/
  - excel/spreadsheet-ui-core/src/selection/multi-range/
  - excel/spreadsheet-ui-core/src/selection/pointer-selection-commands.ts
  - excel/spreadsheet-ui-core/test/multi-range-selection/
---

# 手动建立并操作非连续选区

先完整读index与指定skills；只写本任务files及reports/001-report.md，状态由root改。共享契约尽早写报告发root转007，不私改共享文件。

覆盖M-01/M-02。

## 已核对入口

use-grid-pointer-selection.ts当前pointerDown只传extend:event.shiftKey；Core selection/pointer-selection-commands.ts以setSelectionWithAuthorityReceiptAtom替换全部选区。selection/index.ts已有setPrimaryRegionAtom/addSelectionRegionAtom/setMultiRegionSelectionAtom/clearNonPrimaryRegionsAtom、同一authority与MAX_SELECTION_REGIONS；pointer interaction已有append字段。多区显示/清除/格式/聚合已有，不再存一套selection。

## 交付

- Ctrl/Command+点击追加不相邻格；修饰键拖拽追加矩形，保留原区域，只更新本次主区；普通点击回单选。明确定义重复点击/重叠、去重计数及主焦点，预算超限保原选区且反馈。
- Shift原扩选、公式引用拾取、格式刷优先级保持。Escape依既有编辑优先级退出/清追加交互；pointercancel、切表、结构变化/晚到指针安全结束。普通/合并/冻结/拖动自动滚动共用，不用包围矩形代替多个区域。
- 新语义集中Core selection/multi-range/；有新的DOM helper才放React workbook/multi-range-selection/，不为目录造空包装。确需selection/index.ts公开接口由007最小接线，不自己重写超大index。白名单内pointer命令/hook你独占。
- 最短调用链和状态所有者、拟增加StartPointerSelectionInput字段先发布。新操作用MRSEL-前缀给唯一FEATURES行建议。
- 必要Core/React专项：点击/拖拽/重叠/预算/cancel/Shift/引用/独立store。持久e2e/multi-range-selection/实际modifier鼠标完成追加格/追加矩形/普通回单选/退出、多区格式/清除、统计去重和间隙不变，含合并/冻结/滚动两宽。只专项Vitest，真实浏览器/截图由007；纯会话选区不伪称文件持久化。

## 真实浏览器r3 overlap定位（先只读，须007确认自然退出）

r3完整117项自然结果待007session确认；JSON已有113pass/4fail，两个属于本域`overlap-statistics.spec.ts`：1280主区B93:C93与Rust数字count3/sum6/avg2全过，几何selected count却11；390主区变B93:D93。原始JSON/trace/error-context在证据根007-e2e-impact-r3/。不得改预期为11或扩大C至D，也不得删除去重/间隙/邻格断言。

- 先只读trace实际起终坐标/滚动、pointer.ts固定+12与Summary!A93接近视口底部、footer新增多区说明导致grid尺寸变化等事实，区分合法边缘自动滚动与真实选区bug。Core countSelectionCells原算法及Rust聚合都是原有入口，不因猜测改它们。
- 若新case在边缘拖动触发合法滚动，只在该spec通过真实DOM把A93:C93放到可靠内区并等待投影/几何稳定，再原鼠标拖动；可用局部不共享helper。不改旧support、源数据或调宽断言；其它专门autoscroll case仍严格保留。若确为产品bug，先给root精确源码/因果及最小修正方案再动产品。
- 当前全r3输入仍冻结，须收到007明确自然退出后才改该spec。与007约下一真实执行，自己不跑浏览器/全仓；纯前置改不重复Core专项。报告准确证据/diff/指纹，完成立即冻结交007；不新增ID或native/WASM。
