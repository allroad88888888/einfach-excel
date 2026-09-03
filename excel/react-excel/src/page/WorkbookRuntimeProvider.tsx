import { createStore, type Store } from '@einfach/core'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { Provider as AtomProvider } from '@einfach/react'
import {
  disposeRustWorkbookRuntimeAtom,
  spreadsheetRuntimeAtom,
  startRustWorkbookRuntimeAtom,
  type RustWorkbookDefinition,
} from '@einfach/spreadsheet-ui-core'
import RustWorkbookWorker from '@einfach/spreadsheet-ui-core/rust-runtime?worker'
import { useEffect, useMemo, type ReactNode } from 'react'

export interface WorkbookRuntimeProviderProps {
  readonly children: ReactNode
  readonly definition: RustWorkbookDefinition
  readonly store?: Store
}

function WorkbookRuntimeMount({
  children,
  definition,
}: Omit<WorkbookRuntimeProviderProps, 'store'>): ReactNode {
  const state = useAtomValue(spreadsheetRuntimeAtom)
  const startRuntime = useSetAtom(startRustWorkbookRuntimeAtom)
  const disposeRuntime = useSetAtom(disposeRustWorkbookRuntimeAtom)

  useEffect(() => {
    void startRuntime({ definition, workerFactory: () => new RustWorkbookWorker() })
    return () => disposeRuntime()
  }, [definition, disposeRuntime, startRuntime])

  if (state.status === 'loading') {
    return <div role="status">Loading Rust/WASM workbook…</div>
  }
  if (state.status === 'error') {
    return (
      <section role="alert">
        <h1>Workbook failed to open</h1>
        <p>{state.message}</p>
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
}: WorkbookRuntimeProviderProps): ReactNode {
  const runtimeStore = useMemo(() => store ?? createStore(), [store])

  return (
    <AtomProvider store={runtimeStore}>
      <WorkbookRuntimeMount definition={definition}>{children}</WorkbookRuntimeMount>
    </AtomProvider>
  )
}
