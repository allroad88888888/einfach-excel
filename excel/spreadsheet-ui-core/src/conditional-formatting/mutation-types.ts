import type {
  SelectionAuthorityWitness,
} from '../selection'
import type { WorkspaceActiveSheetAuthorityWitness } from '../workspace'
import type {
  ConditionalFormatEditorState,
  ConditionalFormatOperationAttempt,
  ConditionalFormatRuleKind,
  ConditionalFormatRulesState,
  ConditionalFormatScope,
  RemoveConditionalFormatRuleRequest,
  RunConditionalFormatMutationInput,
  SetConditionalFormatRuleRequest,
} from './types'

export type SheetTargetSource = 'explicit' | 'workspace-or-cache'
export type ScopeTargetSource = 'explicit' | 'draft' | 'selection'

export interface ConditionalFormatMutationInputSnapshot {
  readonly action: RunConditionalFormatMutationInput['action']
  readonly sheetId: string | undefined
  readonly scope: ConditionalFormatScope | undefined
  readonly setRule: RunConditionalFormatMutationInput['setRule']
  readonly removeRule: RunConditionalFormatMutationInput['removeRule']
  readonly listRules: RunConditionalFormatMutationInput['listRules']
  readonly acceptAcknowledgedResult: RunConditionalFormatMutationInput['acceptAcknowledgedResult']
}

export interface ConditionalFormatMutationCapture {
  readonly kind: 'capture'
  readonly editor: ConditionalFormatEditorState
}

export interface ConditionalFormatMutationTicket {
  readonly sessionId: number
  readonly requestId: number
  readonly sheetId: string
  readonly sheetTargetSource: SheetTargetSource
  readonly workspaceAuthorityWitness: WorkspaceActiveSheetAuthorityWitness | null
  readonly scope: ConditionalFormatScope
  readonly scopeTargetSource: ScopeTargetSource
  readonly selectionAuthorityWitness: SelectionAuthorityWitness | null
  readonly ruleId: string | null
  readonly selectedKind: ConditionalFormatRuleKind
  readonly operationId: string
}

export interface ConditionalFormatMutationReservation {
  readonly kind: 'reservation'
  readonly editor: ConditionalFormatEditorState
  readonly cache: ConditionalFormatRulesState
  readonly expectedSequence: number
  readonly ticket: ConditionalFormatMutationTicket
  readonly input: ConditionalFormatMutationInputSnapshot
  readonly request: SetConditionalFormatRuleRequest | RemoveConditionalFormatRuleRequest
  readonly attempt: ConditionalFormatOperationAttempt
}

export type ConditionalFormatMutationLaunchState =
  | ConditionalFormatMutationCapture
  | ConditionalFormatMutationReservation
  | null

export interface AcknowledgementSnapshot {
  readonly acknowledgement: import('./types').ConditionalFormatMutationAcknowledgement | null
  readonly error: string | null
}

export interface RulesResultSnapshot {
  readonly result: import('./types').ConditionalFormatRulesResult | null
  readonly error: string | null
}
