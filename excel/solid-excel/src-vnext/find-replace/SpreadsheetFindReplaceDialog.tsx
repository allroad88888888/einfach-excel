import { Show, createEffect } from 'solid-js'
import { useAtomValue, useSetAtom } from '@einfach/solid'
import type { ReplaceMatchesRequest, ReplaceMatchesResult } from '@einfach/spreadsheet-ui-core'
import {
  captureFindReplaceCapabilityAtom,
  closeFindReplaceAtom,
  findReplaceCapabilityProjectionAtom,
  findReplaceCursorAtom,
  findReplaceErrorAtom,
  findReplaceFormAtom,
  findReplaceMutationBlockedAtom,
  findReplaceOpenAtom,
  findReplacePendingAtom,
  findReplaceRefreshRecoveryAtom,
  replaceAllCappedAtom,
  runFindReplaceMutationAtom,
  runFindReplaceRefreshRecoveryAtom,
  runFindReplaceSearchAtom,
  selectionSnapshotAtom,
  stepFindReplaceAtom,
  syncFindReplaceTargetAtom,
  updateFindReplaceFormAtom,
  workspaceSessionAtom,
} from '@einfach/spreadsheet-ui-core'
import { useT } from '../../src/i18n'
import { useSpreadsheetBackend, useSpreadsheetUiStore } from '../provider/hooks'
import { createHistoryEntryRecorder } from '../provider/history-entry-recorder'
import { refreshVisibleProjection } from '../provider/projection-refresh'
import { FindReplaceDialogContent } from './FindReplaceDialogContent'
import { useDialogInteractions } from './dialog-interactions'
import './find-replace-dialog.css'

export interface SpreadsheetFindReplaceDialogProps {
  class?: string
  'data-testid'?: string
}

export function SpreadsheetFindReplaceDialog(props: SpreadsheetFindReplaceDialogProps) {
  const t = useT()
  const store = useSpreadsheetUiStore()
  const backend = useSpreadsheetBackend()
  const searchRange = backend.searchRange?.bind(backend)
  const replaceMatches = backend.replaceMatches?.bind(backend)
  const historyEntryRecorder = createHistoryEntryRecorder(backend)
  const capability = useAtomValue(findReplaceCapabilityProjectionAtom)
  const isOpen = useAtomValue(findReplaceOpenAtom)
  const cursor = useAtomValue(findReplaceCursorAtom)
  const error = useAtomValue(findReplaceErrorAtom)
  const form = useAtomValue(findReplaceFormAtom)
  const mutationBlocked = useAtomValue(findReplaceMutationBlockedAtom)
  const pending = useAtomValue(findReplacePendingAtom)
  const refreshRecovery = useAtomValue(findReplaceRefreshRecoveryAtom)
  const replaceAllCapped = useAtomValue(replaceAllCappedAtom)
  const selectionSnapshot = useAtomValue(selectionSnapshotAtom)
  const workspaceSession = useAtomValue(workspaceSessionAtom)
  const closeDialog = useSetAtom(closeFindReplaceAtom)
  const runMutation = useSetAtom(runFindReplaceMutationAtom)
  const runRefreshRecovery = useSetAtom(runFindReplaceRefreshRecoveryAtom)
  const runSearchCommand = useSetAtom(runFindReplaceSearchAtom)
  const step = useSetAtom(stepFindReplaceAtom)
  const syncTarget = useSetAtom(syncFindReplaceTargetAtom)
  const updateForm = useSetAtom(updateFindReplaceFormAtom)
  let needleRef: HTMLInputElement | undefined

  createEffect(() => {
    store.setter(captureFindReplaceCapabilityAtom, backend)
  })

  createEffect(() => {
    if (!isOpen()) return
    workspaceSession()
    selectionSnapshot()
    syncTarget()
  })

  useDialogInteractions({
    isOpen,
    close: closeDialog,
    getInitialFocus: () => needleRef,
  })

  function runSearch() {
    if (!capability().findEnabled) return
    return runSearchCommand({ searchRange })
  }

  function handleFindStep(direction: 1 | -1) {
    if (!capability().findEnabled) return
    return step({ direction, searchRange })
  }

  function acceptAcknowledgedResult(_result: ReplaceMatchesResult, request: ReplaceMatchesRequest) {
    const sheetId = request.coords[0]?.sheetId
    if (sheetId === undefined) return
    return refreshVisibleProjection(store, backend, sheetId)
  }

  function handleReplace(action: 'replace-current' | 'replace-all') {
    if (!capability().replaceEnabled) return
    return runMutation({
      action,
      historyEntryRecorder,
      replaceMatches,
      searchRange,
      acceptAcknowledgedResult,
    })
  }

  function handleRefreshRecovery() {
    if (!capability().findEnabled) return
    return runRefreshRecovery({ searchRange, acceptAcknowledgedResult })
  }

  function statusText() {
    const currentCursor = cursor()
    if (currentCursor.status === 'idle') return ''
    if (currentCursor.status === 'searching') return t('findReplace.status.searching')
    if (currentCursor.status === 'error') return t('findReplace.status.failed')
    if (currentCursor.totalCount === 0) return t('findReplace.status.noMatches')
    return t('findReplace.status.count', {
      current: currentCursor.currentIndex + 1,
      total: currentCursor.totalCount,
    })
  }

  return (
    <Show when={isOpen()}>
      <FindReplaceDialogContent
        {...props}
        capability={capability}
        form={form}
        mutationBlocked={mutationBlocked}
        pending={pending}
        refreshRecovery={refreshRecovery}
        replaceAllCapped={replaceAllCapped}
        statusText={statusText}
        errorText={() => error()?.message ?? ''}
        setNeedleRef={(element) => {
          needleRef = element
        }}
        closeDialog={closeDialog}
        runSearch={runSearch}
        handleFindStep={handleFindStep}
        handleReplace={handleReplace}
        handleRefreshRecovery={handleRefreshRecovery}
        updateForm={updateForm}
      />
    </Show>
  )
}
