/**
 * The "collaboration" demo: full chrome over a small sprint-planning sheet,
 * with two pre-seeded comment threads and three simulated remote teammates.
 *
 * Comments: `SpreadsheetCommentThread` and `SpreadsheetPresenceOverlay` are
 * already mounted globally by `ChromeDialogs` — this page never renders
 * them directly. The vnext grid does not (yet) render `commentThreadId` as
 * a visual marker on the cell (`SpreadsheetGrid.tsx` reads `validation`,
 * `format`, `richValue`, and merges, but never `noteIndicator`/
 * `commentThreadId`), so `CollaborationGrid` below opens the matching
 * comment session itself — via `openCommentSessionAtom` — whenever the
 * active cell lands on one of `collaborationCommentSeeds`' coordinates.
 * Landing the initial cursor on the first seeded cell (instead of A1) is
 * what makes a thread visibly open on load.
 *
 * The static backend (`static-backend.ts`) ships no `postComment` /
 * `resolveCommentThread` transport at all, so passing it straight through
 * would dead-end the toolbar's "Post"/"Resolve" buttons in a permanent
 * `Comment post is unavailable` error. `backend` below layers a trivial
 * in-memory acknowledgement on top — enough to satisfy
 * `CommentMutationAcknowledgement` and let the compose/resolve flow
 * complete — without claiming to persist thread bodies anywhere real (the
 * library does not render prior comment bodies either; see
 * `spreadsheet-ui-core/src/comments/README.md`).
 *
 * Presence: nothing here talks to a backend port. Three fake teammates are
 * joined straight onto the presence atoms (`applyPresenceUpdateAtom`) on
 * mount, the same way `vnext-presence-overlay.test.tsx` seeds them for
 * tests. One cursor is re-positioned on an interval to simulate someone
 * moving around the sheet.
 */
import { For, Show, createEffect, onCleanup } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import {
  applyPresenceUpdateAtom,
  openCommentSessionAtom,
  selectCellAtom,
  selectionAtom,
  workspaceSessionAtom,
} from '@einfach/spreadsheet-ui-core'
import type {
  BackendMutationResult,
  PostCommentRequest,
  ResolveCommentThreadRequest,
  ViewportMetrics,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetGrid, useSpreadsheetUiStore } from '@einfach/solid-excel/vnext'
import SpreadsheetChrome from '../../spreadsheet/SpreadsheetChrome'
import { makeStaticBackend } from '../../spreadsheet/backends'
import { useLocale, useSiteT } from '../../i18n/use-site-t'
import { collaborationCommentSeeds, collaborationSeed } from '../seeds/seed-collaboration'

let demoAckRevision = 0

async function acknowledgeCommentMutation(
  request: PostCommentRequest | ResolveCommentThreadRequest,
): Promise<BackendMutationResult> {
  demoAckRevision += 1
  return { sheetId: request.sheetId, requestId: request.requestId, revision: demoAckRevision }
}

const backend = {
  ...makeStaticBackend(collaborationSeed),
  postComment: acknowledgeCommentMutation,
  resolveCommentThread: acknowledgeCommentMutation,
}

const viewport: ViewportMetrics = {
  scrollTop: 0,
  scrollLeft: 0,
  viewportHeight: 380,
  viewportWidth: 720,
  rowHeight: 24,
  colWidth: 120,
  rowCount: 100,
  colCount: 20,
  overscanRows: 2,
  overscanCols: 2,
}

const TEAMMATES = [
  { id: 'p-alice', displayName: 'Alice Kim', colorHint: '#e91e63', coord: { row: 1, col: 1 } },
  { id: 'p-ben', displayName: 'Ben Osei', colorHint: '#2f80ed', coord: { row: 3, col: 0 } },
  { id: 'p-carla', displayName: 'Carla Diaz', colorHint: '#f2994a', coord: { row: 5, col: 4 } },
] as const

// Ben "walks" his cursor across a few cells so the presence overlay reads
// as live rather than three static dots.
const BEN_WALK = [
  { row: 3, col: 0 },
  { row: 3, col: 2 },
  { row: 1, col: 4 },
  { row: 5, col: 1 },
]

const copy = {
  en: {
    tips: [
      'Click cell C3 ("Blocked") or D5 ("2026-08-06") — both already carry a comment thread.',
      'Select any other cell, then press the toolbar’s comment button to start a new thread.',
      'Reply and hit Post — the demo backend acknowledges it locally, so the thread closes.',
      'Watch the colored cursors: three teammates are simulated, and one keeps moving.',
    ],
  },
  zh: {
    tips: [
      '点击 C3（"Blocked"）或 D5（"2026-08-06"）——这两个单元格已经挂了批注线程。',
      '选中任意其他单元格，再点工具栏的批注按钮即可新建一个线程。',
      '输入回复并点击 Post——演示后端会在本地确认，线程随即关闭。',
      '留意彩色光标：三位队友是模拟出来的，其中一位会持续移动。',
    ],
  },
} as const

/**
 * The grid itself lives in a helper component (rather than inline in
 * `CollaborationDemo`) so it can call `useSpreadsheetUiStore`/`useAtomValue`
 * — those only resolve once mounted inside `SpreadsheetChrome`'s
 * `SpreadsheetUiProvider`, which happens via the `children` prop.
 */
function CollaborationGrid() {
  const store = useSpreadsheetUiStore()
  const workspace = useAtomValue(workspaceSessionAtom)
  const selection = useAtomValue(selectionAtom)
  const activeSheetId = () => workspace().activeSheetId

  // `SpreadsheetChrome` always mounts `SpreadsheetSheetTabs` with an empty
  // seed list, which resolves the real active sheet asynchronously from
  // `backend.listSheets()`. Once it lands, default the cursor to the first
  // commented cell (instead of A1, per Excel convention) so a thread is
  // already open when the demo finishes loading.
  createEffect(() => {
    const sheetId = activeSheetId()
    if (!sheetId) return
    if (store.getter(selectionAtom).sheetId) return
    const first = collaborationCommentSeeds[0]
    store.setter(selectCellAtom, { sheetId, coord: { row: first.row, col: first.col } })
  })

  // Whenever the active cell lands on a seeded coordinate, open its thread.
  createEffect(() => {
    const sel = selection()
    if (sel.kind !== 'cell') return
    const thread = collaborationCommentSeeds.find(
      (seed) => seed.row === sel.anchor.row && seed.col === sel.anchor.col,
    )
    if (!thread) return
    store.setter(openCommentSessionAtom, {
      sheetId: sel.sheetId,
      cell: { row: thread.row, col: thread.col },
      threadId: thread.threadId,
    })
  })

  // Fake presence: join three teammates once the sheet id is known, then
  // walk one cursor around on a timer. Guarded by `presenceSeeded` so an
  // unrelated `workspaceSessionAtom` update (e.g. a later sheet-tab change)
  // doesn't rejoin the teammates or restart the interval.
  let presenceSeeded = false
  createEffect(() => {
    const sheetId = activeSheetId()
    if (!sheetId || presenceSeeded) return
    presenceSeeded = true

    for (const teammate of TEAMMATES) {
      store.setter(applyPresenceUpdateAtom, {
        kind: 'join',
        participant: {
          id: teammate.id,
          displayName: teammate.displayName,
          colorHint: teammate.colorHint,
          lastSeenAt: Date.now(),
        },
      })
      store.setter(applyPresenceUpdateAtom, {
        kind: 'cursor',
        participantId: teammate.id,
        sheetId,
        selection: {
          kind: 'cell',
          sheetId,
          anchor: teammate.coord,
          focus: teammate.coord,
        },
      })
    }

    let step = 0
    const interval = setInterval(() => {
      step = (step + 1) % BEN_WALK.length
      const coord = BEN_WALK[step]
      store.setter(applyPresenceUpdateAtom, {
        kind: 'cursor',
        participantId: 'p-ben',
        sheetId,
        selection: { kind: 'cell', sheetId, anchor: coord, focus: coord },
      })
    }, 1500)
    onCleanup(() => clearInterval(interval))
  })

  return (
    <Show keyed when={activeSheetId()}>
      {(sheetId) => <SpreadsheetGrid sheetId={sheetId} viewport={viewport} />}
    </Show>
  )
}

export default function CollaborationDemo() {
  const t = useSiteT()
  const locale = useLocale()

  return (
    <div class="site-demo-basics">
      <aside class="site-demo-tips">
        <h2 class="site-demo-tips-heading">{t('site.demo.tryThis')}</h2>
        <ul class="site-demo-tips-list">
          <For each={copy[locale()].tips}>{(tip) => <li>{tip}</li>}</For>
        </ul>
      </aside>
      <SpreadsheetChrome backend={backend}>
        <CollaborationGrid />
      </SpreadsheetChrome>
    </div>
  )
}
