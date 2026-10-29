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
import { useEffect, useMemo, type ReactNode } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { WorkbookPresentationProvider, type WorkbookPresentationProps } from './WorkbookPresentationProvider'
import { translateFeedback } from '../i18n/translate-feedback'
import { createDefaultWorkbookWorker } from '../worker/create-workbook-worker'

export interface WorkbookRuntimeProviderProps extends WorkbookPresentationProps {
  readonly children: ReactNode
  readonly definition: RustWorkbookDefinition
  readonly store?: Store
  readonly workerFactory?: () => WorkerLike
}

function WorkbookRuntimeMount({
  children,
  definition,
  workerFactory = createDefaultWorkbookWorker,
}: Omit<WorkbookRuntimeProviderProps, 'store'>): ReactNode {
  const { i18n } = useLingui()
  const state = useAtomValue(spreadsheetRuntimeAtom)
  const startRuntime = useSetAtom(startRustWorkbookRuntimeAtom)
  const disposeRuntime = useSetAtom(disposeRustWorkbookRuntimeAtom)

  useEffect(() => {
    void startRuntime({ definition, workerFactory })
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
  store,
  workerFactory,
  ...presentation
}: WorkbookRuntimeProviderProps): ReactNode {
  const runtimeStore = useMemo(() => store ?? createStore(), [store])

  return (
    <WorkbookPresentationProvider {...presentation}><AtomProvider store={runtimeStore}>
      <WorkbookRuntimeMount definition={definition} workerFactory={workerFactory}>
        {children}
      </WorkbookRuntimeMount>
    </AtomProvider></WorkbookPresentationProvider>
  )
}
