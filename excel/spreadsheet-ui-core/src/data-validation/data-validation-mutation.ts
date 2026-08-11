import { atom } from '@einfach/core'
import type { DataValidationOperationAttempt, RunDataValidationMutationInput } from './types'
import { snapshotAcknowledgement } from './data-validation-acknowledgement'
import { freezeForm, validationRuleFromForm } from './data-validation-form'
import { freezeEditorFacade, freezeLedgerFacade } from './data-validation-facade'
import {
  nextDataValidationRequestId,
  nextDataValidationSessionId,
} from './data-validation-identity'
import { snapshotMutationInput } from './data-validation-input'
import {
  dataValidationMutationReservationAtom,
  dataValidationOperationAttemptLedgerStateAtom,
  dataValidationRequestSequenceAtom,
  dataValidationTransportLaunchSequenceAtom,
  reserveAttemptSlot,
  settleAttempt,
} from './data-validation-mutation-ledger'
import { createDataValidationMutationOwnership } from './data-validation-mutation-ownership'
import { captureDataValidationTargetAuthority } from './data-validation-target-authority'
import { copyRange, copyRule, errorMessage, freezeRange, freezeRule } from './data-validation-value'
import {
  planClosedEditorState,
  unavailableSessionEditorState,
  validationRuleEditorStateAtom,
} from './validation-rule-editor-state'

/**
 * Dispatches a validation mutation from core-owned form and target snapshots.
 * This compact protocol state machine records an outcome before stale UI checks.
 */
export const runDataValidationMutationAtom = atom(
  null,
  async (get, set, input: RunDataValidationMutationInput): Promise<void> => {
    const editor = get(validationRuleEditorStateAtom)
    if (editor.status !== 'editing' || editor.pending || get(dataValidationMutationReservationAtom))
      return
    if (nextDataValidationSessionId(editor.sessionId) === null) {
      set(validationRuleEditorStateAtom, freezeEditorFacade(unavailableSessionEditorState(editor)))
      return
    }
    const reservation = Object.freeze({ sessionId: editor.sessionId })
    set(dataValidationMutationReservationAtom, reservation)
    try {
      const reject = (message: string): void => {
        if (get(validationRuleEditorStateAtom) === editor) {
          set(validationRuleEditorStateAtom, freezeEditorFacade({ ...editor, error: message }))
        }
      }
      if (
        get(dataValidationOperationAttemptLedgerStateAtom).some(
          (item) => item.status === 'outcome-unknown',
        )
      ) {
        reject('Data validation is blocked by an operation with an unknown outcome')
        return
      }
      const inputSnapshot = snapshotMutationInput(input)
      if (inputSnapshot === null) {
        reject('Data validation mutation input is invalid')
        return
      }
      if (
        get(validationRuleEditorStateAtom) !== editor ||
        get(dataValidationMutationReservationAtom) !== reservation
      )
        return
      const execute =
        inputSnapshot.action === 'save' ? inputSnapshot.setRule : inputSnapshot.clearRule
      if (!execute) return reject(`Data validation ${inputSnapshot.action} is unavailable`)
      if (!editor.range) return reject('Data validation requires a target range')
      const targetAuthority = captureDataValidationTargetAuthority(get, inputSnapshot.sheetId)
      if (
        get(validationRuleEditorStateAtom) !== editor ||
        get(dataValidationMutationReservationAtom) !== reservation
      )
        return
      if (targetAuthority === null) return reject('Data validation requires an active sheet')
      const reservedLedger = reserveAttemptSlot(get(dataValidationOperationAttemptLedgerStateAtom))
      if (reservedLedger === null)
        return reject('Data validation operation journal is full of unresolved attempts')
      const requestId = nextDataValidationRequestId(get(dataValidationRequestSequenceAtom))
      if (requestId === null) return reject('Data validation request ticket space is exhausted')

      const sheetId = targetAuthority.sheetId
      const targetRange = freezeRange(editor.range)
      const form = freezeForm(editor.form)
      const rule = freezeRule(validationRuleFromForm(form))
      const authority = Object.freeze({ sheetId, requestId, range: targetRange })
      const operationId = `data-validation-${requestId}`
      const attempt: DataValidationOperationAttempt = Object.freeze({
        operationId,
        requestId,
        sessionId: editor.sessionId,
        action: inputSnapshot.action,
        sheetId,
        range: freezeRange(targetRange),
        baseRevision: null,
        status: 'pending',
      })
      set(dataValidationRequestSequenceAtom, requestId)
      set(
        dataValidationOperationAttemptLedgerStateAtom,
        freezeLedgerFacade([...reservedLedger, attempt]),
      )
      set(
        validationRuleEditorStateAtom,
        freezeEditorFacade({
          ...editor,
          requestId,
          targetSheetId: sheetId,
          pending: true,
          error: null,
        }),
      )

      const ownership = createDataValidationMutationOwnership({
        get,
        reservation,
        sessionId: editor.sessionId,
        requestId,
        sheetId,
        range: targetRange,
        targetAuthority,
      })
      await Promise.resolve()
      if (!ownership.isCurrentTarget()) {
        const ledger = get(dataValidationOperationAttemptLedgerStateAtom)
        const nextLedger = ledger.filter(
          (item) => item.operationId !== operationId || item.status !== 'pending',
        )
        if (nextLedger.length !== ledger.length) {
          set(dataValidationOperationAttemptLedgerStateAtom, freezeLedgerFacade(nextLedger))
        }
        const current = ownership.readOwnedEditor()
        if (current !== null && ownership.readOwnedEditor() === current) {
          set(
            validationRuleEditorStateAtom,
            freezeEditorFacade({
              ...current,
              pending: false,
              error: 'Data validation target changed before transport dispatch',
            }),
          )
        }
        return
      }
      set(dataValidationTransportLaunchSequenceAtom, requestId)

      let acknowledgementValue: unknown
      try {
        acknowledgementValue =
          inputSnapshot.action === 'save'
            ? await inputSnapshot.setRule!({
                kind: 'set-validation-rule',
                sheetId,
                range: copyRange(targetRange),
                rule: copyRule(rule),
                mode: form.mode,
                requestId,
              })
            : await inputSnapshot.clearRule!({
                kind: 'clear-validation-rule',
                sheetId,
                range: copyRange(targetRange),
                requestId,
              })
      } catch (error) {
        const message = errorMessage(error)
        set(
          dataValidationOperationAttemptLedgerStateAtom,
          freezeLedgerFacade(
            settleAttempt(
              get(dataValidationOperationAttemptLedgerStateAtom),
              operationId,
              'outcome-unknown',
              { error: message },
            ),
          ),
        )
        if (ownership.isCurrentTarget()) {
          const current = get(validationRuleEditorStateAtom)
          set(
            validationRuleEditorStateAtom,
            freezeEditorFacade({ ...current, pending: false, error: message }),
          )
        }
        return
      }

      const { acknowledgement, error } = snapshotAcknowledgement(acknowledgementValue, authority)
      if (acknowledgement === null) {
        const message = error ?? 'Data validation acknowledgement was invalid'
        set(
          dataValidationOperationAttemptLedgerStateAtom,
          freezeLedgerFacade(
            settleAttempt(
              get(dataValidationOperationAttemptLedgerStateAtom),
              operationId,
              'outcome-unknown',
              { error: message },
            ),
          ),
        )
        if (ownership.isCurrentTarget()) {
          const current = get(validationRuleEditorStateAtom)
          set(
            validationRuleEditorStateAtom,
            freezeEditorFacade({ ...current, pending: false, error: message }),
          )
        }
        return
      }
      set(
        dataValidationOperationAttemptLedgerStateAtom,
        freezeLedgerFacade(
          settleAttempt(
            get(dataValidationOperationAttemptLedgerStateAtom),
            operationId,
            'acknowledged',
            { resultRevision: acknowledgement.revision },
          ),
        ),
      )
      if (!ownership.isCurrentTarget()) return
      let acceptanceError: string | null = null
      if (inputSnapshot.acceptAcknowledgedResult) {
        try {
          await inputSnapshot.acceptAcknowledgedResult(acknowledgement)
        } catch (acceptanceFailure) {
          acceptanceError = errorMessage(acceptanceFailure)
        }
      }
      if (!ownership.isCurrentTarget()) return
      const current = get(validationRuleEditorStateAtom)
      if (acceptanceError !== null) {
        set(
          validationRuleEditorStateAtom,
          freezeEditorFacade({
            ...current,
            pending: false,
            error: `Mutation acknowledged; result acceptance failed: ${acceptanceError}`,
          }),
        )
        return
      }
      set(
        validationRuleEditorStateAtom,
        freezeEditorFacade(
          planClosedEditorState(current) ?? unavailableSessionEditorState(current, false),
        ),
      )
    } finally {
      if (get(dataValidationMutationReservationAtom) === reservation) {
        set(dataValidationMutationReservationAtom, null)
      }
    }
  },
)
runDataValidationMutationAtom.debugLabel = 'spreadsheet.validation.runMutation'
