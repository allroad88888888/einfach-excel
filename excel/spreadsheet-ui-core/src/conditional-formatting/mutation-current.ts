import { atom, type Getter } from '@einfach/core'
import type { ConditionalFormatMutationTicket } from './mutation-types'
import {
  conditionalFormatEditorStateAtom,
  conditionalFormatRulesCacheStateAtom,
} from './state'
import { resolveScopeTarget, resolveSheetTarget, resolvedTargetAuthorityIsCurrent } from './target-domain'
import type { ConditionalFormatEditorState, ConditionalFormatRulesState } from './types'
import { sameScope } from './value-domain'

export function matchesOwnedEditor(
  editor: ConditionalFormatEditorState,
  ticket: ConditionalFormatMutationTicket,
): boolean {
  return editor.open && editor.pending && editor.sessionId === ticket.sessionId && editor.requestId === ticket.requestId && editor.ruleId === ticket.ruleId && editor.selectedKind === ticket.selectedKind
}

export function targetIsCurrent(
  get: Getter,
  ticket: ConditionalFormatMutationTicket,
  expectedEditor?: ConditionalFormatEditorState,
  expectedCache?: ConditionalFormatRulesState,
): boolean {
  const editor = get(conditionalFormatEditorStateAtom)
  if (expectedEditor !== undefined ? editor !== expectedEditor : !matchesOwnedEditor(editor, ticket)) return false
  const cache = get(conditionalFormatRulesCacheStateAtom)
  if (expectedCache !== undefined && cache !== expectedCache) return false
  const sheetTarget = resolveSheetTarget(get, ticket.sheetTargetSource === 'explicit' ? ticket.sheetId : undefined, cache)
  if (sheetTarget === null || sheetTarget.sheetId !== ticket.sheetId || sheetTarget.source !== ticket.sheetTargetSource || sheetTarget.authorityWitness !== ticket.workspaceAuthorityWitness) return false
  const scopeTarget = resolveScopeTarget(get, ticket.scopeTargetSource === 'explicit' ? ticket.scope : undefined, ticket.scopeTargetSource === 'selection' ? { ...editor, draft: null } : editor)
  if (scopeTarget === null || scopeTarget.source !== ticket.scopeTargetSource || scopeTarget.authorityWitness !== ticket.selectionAuthorityWitness || !sameScope(scopeTarget.scope, ticket.scope) || !resolvedTargetAuthorityIsCurrent(get, sheetTarget, scopeTarget)) return false
  return get(conditionalFormatEditorStateAtom) === editor && get(conditionalFormatRulesCacheStateAtom) === cache && (expectedEditor !== undefined || matchesOwnedEditor(editor, ticket))
}

export const conditionalFormatCurrentTargetAtom = atom(
  null,
  (get, _set, ticket: ConditionalFormatMutationTicket): boolean => targetIsCurrent(get, ticket),
)
