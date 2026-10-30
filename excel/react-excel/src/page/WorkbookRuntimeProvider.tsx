import { createStore, type Store } from '@einfach/core'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { Provider as AtomProvider } from '@einfach/react'
import {
  disposeRustWorkbookRuntimeAtom,
  spreadsheetRuntimeAtom,
  startRustWorkbookRuntimeAtom,
  type RustWorkbookDefinition,
} from '@einfach-excel/spreadsheet-ui-core'
import type { WorkerLike } from '@einfach-excel/spreadsheet-ui-core/rust-worker'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { WorkbookPresentationProvider, type WorkbookPresentationProps } from './WorkbookPresentationProvider'
import { translateFeedback } from '../i18n/translate-feedback'
import { createDefaultWorkbookWorker } from '../worker/create-workbook-worker'

export interface WorkbookRuntimeProviderProps extends WorkbookPresentationProps {
  readonly children: ReactNode
  readonly definition: RustWorkbookDefinition
  /**
   * 宿主上次保存的原生快照（`exportWorkbookSnapshotAtom` 的结果）。只在首次挂载时读取：
   * 给出时从快照恢复，打不开则退回 definition，错误见 `workbookReplacementErrorAtom`。
   */
  readonly initialSnapshot?: string
  readonly store?: Store
  readonly workerFactory?: () => WorkerLike
}

function WorkbookRuntimeMount({
  children,
  definition,
  initialSnapshot,
  workerFactory = createDefaultWorkbookWorker,
}: Omit<WorkbookRuntimeProviderProps, 'store'>): ReactNode {
  const { i18n } = useLingui()
  const state = useAtomValue(spreadsheetRuntimeAtom)
  const startRuntime = useSetAtom(startRustWorkbookRuntimeAtom)
  const disposeRuntime = useSetAtom(disposeRustWorkbookRuntimeAtom)
  // 非渲染身份：快照只配挂载时的那份 definition，宿主之后换 definition 就按新定义启动。
  const mounted = useRef({ definition, initialSnapshot })

  useEffect(() => {
    const snapshot = definition === mounted.current.definition
      ? mounted.current.initialSnapshot : undefined
    void startRuntime({
      definition, workerFactory, ...(snapshot === undefined ? {} : { snapshot }),
    })
    // Core 统一清理成功、失败及初始化中的 runtime，React 不重复终止 Worker。
    return () => disposeRuntime()
  }, [definition, disposeRuntime, startRuntime, workerFactory])

  if (state.status === 'loading') {
    return <div role="status"><Trans>Loading Rust/WASM workbook…</Trans></div>
  }
  if (state.status === 'error') {
    return (
      <section role="alert">
        <h1><Trans>Workbook failed to open</Trans></h1>
        <p>{translateFeedback(i18n, state.message)}</p>
      </section>
    )
  }

  return children
}

/** Mounts one UI-core-owned Rust workbook runtime in an isolated store. */
export function WorkbookRuntimeProvider({
  children,
  definition,
  initialSnapshot,
  store,
  workerFactory,
  ...presentation
}: WorkbookRuntimeProviderProps): ReactNode {
  const runtimeStore = useMemo(() => store ?? createStore(), [store])

  return (
    <WorkbookPresentationProvider {...presentation}><AtomProvider store={runtimeStore}>
      <WorkbookRuntimeMount definition={definition} initialSnapshot={initialSnapshot}
        workerFactory={workerFactory}>
        {children}
      </WorkbookRuntimeMount>
    </AtomProvider></WorkbookPresentationProvider>
  )
}
