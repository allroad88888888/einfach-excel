# editing

负责单元格编辑器的草稿、来源、提交状态与取消。工作簿值不在这里保存，提交只调用 Rust。

## Atom 清单

- Source atoms:
  - `editingSessionAtom`: 当前唯一编辑会话，包含地址、来源和草稿。
  - `editingCommitLifecycleAtom`: `ready / blocked / pending / rejected / outcome-unknown`。
- Derived atoms:
  - `editingIsActiveAtom`: 是否正在编辑。
  - `editingDraftAtom`: 当前草稿的可写视图。
- Commands:
  - `startEditingAtom`
  - `startCellEditingFromProjectionAtom`
  - `commitCellEditingAtom`
  - `cancelEditingAtom`
- Scale bound: one active edit session.
- Backend reads: `cell.setInput` 一次返回 ACK 和写入后的可见窗口；开始编辑时从当前投影读取源文本。
- Per-cell/per-row/per-col atom risk: none; editing state stores one active cell coordinate only.
- Tests: `test/editing-session.test.ts`、`test/cell-editing-commands.test.ts` 和 `editing-commit-*.test.ts`。

## 内部文件边界

- `session-domain.ts`: 纯编辑会话转换。
- `session-atoms.ts`: 同步会话 atom 与命令。
- `start-cell-editing.ts`: 从当前 Rust 投影开始编辑。
- `commit-cell-editing.ts`: 一条串行的 Rust 编辑事务。
- `commit-state.ts`: 提交锁与生命周期。
- `bounded-operation.ts`: Worker Promise 超时边界。
- `commit-feedback.ts`: 生命周期到界面提示的映射。
- `index.ts`: 公共导出。

提交没有第二条 refresh 链。Rust 的 `cell.setInput` 已经把新可见区放在同一回包中；当前窗口没变就
直接发布，期间发生过滚动就丢弃旧窗口结果。ACK 不匹配或超时会保留锁，防止盲目重发未知写入。

## Mutation gateway (`mutation-gateway.ts`)

Single choke point for content mutations (`set-cell-input`, `clear-range`,
`fill-range`, `fill-series`, `paste-range`, `import-cell-chunks`) and format
writes (`set-format-range`): validates the target coordinates and enforces
the UI-side protection gate (`isRangeFullyUnlocked` over the target ranges)
before any transport. `set-format-range` gates like content (Excel semantics:
locked cells on a protected sheet cannot be reformatted); consumers are the
toolbar format commands, the borders/clear-format/decimal paths, and the
format-painter apply port.

Mutation targets are source coordinates on arrival. Filtering hides rows
rather than compacting them (#27), so display row IS source row: the gateway's
display→source remap half (the per-cell source-row echo, the run-splitting
range mapper, the unmappable-row block reason, and the identity-mapping
fail-closed door that served frozen paste-special / text-to-columns request
shapes) was retired with the compaction it existed to undo. `ranges` is always
the single input range and stays a list only so looping callers stay unchanged;
the only block reasons left are `locked` and `invalid-target`.

### Writes land on filter-hidden rows — deliberately

The gateway does **not** filter its target range against the filter-hidden set,
and must not start. Paste, fill and fill-series write a contiguous block over
filtered-out rows, which is Excel's actual behaviour — its well-known
data-overwrite trap, not a bug. The identity mapping satisfies this with no code
at all, so #27 turned this into a **parity fix**: display compaction used to skip
filtered rows on paste, diverging from Excel. It is a user-perceptible change for
anyone used to the old build, so it belongs in release notes.

The asymmetry is intentional and matches Excel: writes ignore the filter, but
**reads that leave the app** (copy, Copy As, TSV/image export) drop filter-hidden
rows, and delete-rows deletes only visible rows. Those live in `../copy-as/` and
`../operations/`, never here. The rule across UI core: anything that moves data
reads `viewportFilterHiddenAtom` (the filter subset), never the
`effectiveHiddenAtom` union — manually hidden rows are written, copied and
deleted exactly like visible ones.

See `../../docs/filter-sort.md` and
`excel/solid-excel/docs/online-excel-parity/design-filter-hidden-rows.md` §8.4.

- Source atoms:
  - `contentMutationLastBlockBackingAtom` (private) —
    `spreadsheet.mutationGateway.lastBlockBacking`.
- Derived atoms:
  - `contentMutationLastBlockAtom` — `spreadsheet.mutationGateway.lastBlock`;
    latest blocked resolution for UI hints, null when none.
- Commands:
  - `resolveContentMutationAtom` — `spreadsheet.mutationGateway.resolve`;
    returns `allowed` (source coords) or `blocked` (structured diagnostic,
    recorded on lastBlock + appended to diagnostics).
  - `clearContentMutationBlockAtom` — `spreadsheet.mutationGateway.clearBlock`.
- Scale bound: one recorded block; resolution work is bounded by the visible
  window row count.
- `protectionGate: false` skips the lock gate but still validates the target
  (fill sources, format-only clears).
- Tests: `test/mutation-gateway.test.ts`.
