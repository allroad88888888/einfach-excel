import { createEffect, createMemo } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import {
  closeGoToAtom,
  confirmGoToAtom,
  goToErrorAtom,
  goToErrorMessageAtom,
  goToErrorParamsAtom,
  goToHistoryAtom,
  goToInputAtom,
  goToLocatorAtom,
  goToModeAtom,
  goToOpenAtom,
  goToSpecialCapabilityAtom,
  goToSpecialPendingAtom,
  goToSpecialWarningAtom,
  nameRegistryCacheAtom,
  parseGoToReference,
  runGoToSpecialScanAtom,
  selectionSnapshotAtom,
  setGoToErrorDetailsAtom,
  setGoToInputAtom,
  setGoToLocatorAtom,
  setGoToModeAtom,
  setGoToSpecialCapabilityAtom,
  setWorkspaceActiveSheetAtom,
  sheetTabsSheetsAtom,
  workspaceSessionAtom,
  type GoToLocatorKind,
  type GoToValueKindFilter,
} from '@einfach/spreadsheet-ui-core'
import { useT } from '../i18n'
import { useSpreadsheetBackend, useSpreadsheetUiStore } from '../provider/hooks'
import { useDialogInteractions } from '../find-replace/dialog-interactions'
import { locatorKindOf, locatorValueKind, makeLocator } from './go-to-dialog-locators'

type GoToMode = 'simple' | 'special'

export function useGoToDialogController() {
  const t = useT()
  const store = useSpreadsheetUiStore()
  const backend = useSpreadsheetBackend()
  const isOpen = useAtomValue(goToOpenAtom)
  const mode = useAtomValue(goToModeAtom)
  const inputValue = useAtomValue(goToInputAtom)
  const locator = useAtomValue(goToLocatorAtom)
  const history = useAtomValue(goToHistoryAtom)
  const errorCode = useAtomValue(goToErrorAtom)
  const errorParams = useAtomValue(goToErrorParamsAtom)
  const errorMessage = useAtomValue(goToErrorMessageAtom)
  const specialCapability = useAtomValue(goToSpecialCapabilityAtom)
  const specialPending = useAtomValue(goToSpecialPendingAtom)
  const specialWarning = useAtomValue(goToSpecialWarningAtom)
  let inputRef: HTMLInputElement | undefined

  createEffect(() => {
    store.setter(
      setGoToSpecialCapabilityAtom,
      typeof backend.readRangeProjection === 'function' ? 'available' : 'unavailable',
    )
  })

  const close = () => store.setter(closeGoToAtom)

  useDialogInteractions({
    isOpen,
    close,
    getInitialFocus: () => inputRef,
  })

  const errorText = createMemo(() => {
    const message = errorMessage()
    if (message) return message
    const code = errorCode()
    if (!code) return ''
    return t(code, errorParams() ?? {})
  })

  function setMode(next: GoToMode) {
    store.setter(setGoToModeAtom, next)
  }

  function setInputRef(element: HTMLInputElement) {
    inputRef = element
  }

  function setLocatorKind(kind: GoToLocatorKind) {
    store.setter(setGoToLocatorAtom, makeLocator(kind, locatorValueKind(locator())))
  }

  function setLocatorSubKind(valueKind: GoToValueKindFilter) {
    store.setter(setGoToLocatorAtom, makeLocator(locatorKindOf(locator()), valueKind))
  }

  function reportParseError(reason: 'invalid-address' | 'unknown-name' | 'empty', raw: string) {
    const code =
      reason === 'empty'
        ? 'goTo.error.empty'
        : reason === 'unknown-name'
          ? 'goTo.error.unknownName'
          : 'goTo.error.invalidAddress'
    store.setter(setGoToErrorDetailsAtom, { code, params: { input: raw }, message: null })
  }

  function runSimpleConfirm() {
    if (specialPending()) return
    const raw = inputValue().trim()
    if (raw.length === 0) {
      reportParseError('empty', raw)
      return
    }
    const sheets = store.getter(sheetTabsSheetsAtom)
    const snapshot = store.getter(selectionSnapshotAtom)
    const activeSheetId =
      snapshot.selection.sheetId ||
      store.getter(workspaceSessionAtom).activeSheetId ||
      sheets[0]?.id ||
      ''
    const parsed = parseGoToReference(raw, {
      activeSheetId,
      sheets,
      registry: store.getter(nameRegistryCacheAtom),
      activeCell: snapshot.activeCell,
    })
    if (!parsed.ok) {
      reportParseError(parsed.reason, raw)
      return
    }
    if (parsed.target.sheetId && parsed.target.sheetId !== activeSheetId) {
      store.setter(setWorkspaceActiveSheetAtom, { sheetId: parsed.target.sheetId })
    }
    store.setter(confirmGoToAtom, {
      kind: 'simple-target',
      target: parsed.target,
      historyEntry: raw,
    })
  }

  function runSpecialConfirm() {
    if (specialPending() || specialCapability() === 'unavailable') return
    void store.setter(runGoToSpecialScanAtom, { port: backend })
  }

  function onConfirm() {
    if (mode() === 'simple') runSimpleConfirm()
    else runSpecialConfirm()
  }

  function onHistoryClick(entry: string) {
    store.setter(setGoToInputAtom, entry)
    queueMicrotask(() => inputRef?.focus())
  }

  return {
    t,
    isOpen,
    mode,
    inputValue,
    locator,
    history,
    specialCapability,
    specialPending,
    specialWarning,
    errorText,
    close,
    setMode,
    setInputRef,
    setLocatorKind,
    setLocatorSubKind,
    setInput: (value: string) => store.setter(setGoToInputAtom, value),
    onConfirm,
    onHistoryClick,
  }
}
