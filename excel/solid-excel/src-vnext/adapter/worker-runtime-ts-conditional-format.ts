// 一句话：TS worker runtime 的引擎拥有条件格式配置与持久化映射。

import type { ConditionalFormatRuleEntry } from '@einfach/spreadsheet-ui-core'
import { cloneConditionalFormatRuleEntry } from '@einfach/spreadsheet-ui-core'
import type {
  ConditionalFormatConfigSnapshotWire,
  RemoveConditionalFormatRuleWire,
  SetConditionalFormatRuleWire,
} from './worker-protocol'

export interface ConditionalFormatSheet {
  id: string
  idx: number
  name: string
}

export type TsConditionalFormatConfigs = Map<
  string,
  {
    revision: number
    rules: ConditionalFormatRuleEntry[]
  }
>

function rejection(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code })
}

function cloneRules(rules: readonly ConditionalFormatRuleEntry[]): ConditionalFormatRuleEntry[] {
  return rules.map(cloneConditionalFormatRuleEntry)
}

function currentFor(
  configs: TsConditionalFormatConfigs,
  sheet: ConditionalFormatSheet,
): { revision: number; rules: ConditionalFormatRuleEntry[] } {
  return configs.get(sheet.id) ?? { revision: 0, rules: [] }
}

function snapshotFor(
  configs: TsConditionalFormatConfigs,
  sheet: ConditionalFormatSheet,
): ConditionalFormatConfigSnapshotWire {
  const current = currentFor(configs, sheet)
  return { sheet: sheet.idx, revision: current.revision, rules: cloneRules(current.rules) }
}

function assertWitness(request: unknown): void {
  if (!request || typeof request !== 'object') {
    throw rejection('INVALID_CONDITIONAL_FORMAT_REQUEST', 'conditional-format mutation is required')
  }
  const witness = request as { requestId?: unknown; revision?: unknown }
  const requestId = witness.requestId
  if (typeof requestId !== 'number' || !Number.isSafeInteger(requestId) || requestId < 0) {
    throw rejection(
      'CONDITIONAL_FORMAT_REQUEST_ID_REQUIRED',
      'conditional-format mutations require a non-negative requestId',
    )
  }
  const revision = witness.revision
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
    throw rejection(
      'CONDITIONAL_FORMAT_REVISION_REQUIRED',
      'conditional-format mutations require a non-negative revision',
    )
  }
}

function assertExpectedRevision(current: number, expected: number): void {
  if (expected !== current) {
    throw rejection(
      'STALE_CONDITIONAL_FORMAT_REVISION',
      `stale conditional-format revision: expected ${current}, got ${expected}`,
    )
  }
  if (current >= Number.MAX_SAFE_INTEGER) {
    throw rejection(
      'CONDITIONAL_FORMAT_REVISION_EXHAUSTED',
      'conditional-format revision cannot advance further',
    )
  }
}

function assertEntry(entry: ConditionalFormatRuleEntry): void {
  const range = entry.scope?.range as
    | {
        rowStart?: unknown
        rowEnd?: unknown
        colStart?: unknown
        colEnd?: unknown
      }
    | undefined
  if (
    typeof entry.id !== 'string' ||
    entry.id.length === 0 ||
    !range ||
    typeof range.rowStart !== 'number' ||
    !Number.isSafeInteger(range.rowStart) ||
    typeof range.rowEnd !== 'number' ||
    !Number.isSafeInteger(range.rowEnd) ||
    typeof range.colStart !== 'number' ||
    !Number.isSafeInteger(range.colStart) ||
    typeof range.colEnd !== 'number' ||
    !Number.isSafeInteger(range.colEnd) ||
    range.rowStart < 0 ||
    range.colStart < 0 ||
    range.rowEnd < range.rowStart ||
    range.colEnd < range.colStart ||
    !Number.isSafeInteger(entry.priority) ||
    !entry.rule ||
    typeof entry.rule !== 'object'
  ) {
    throw rejection('INVALID_CONDITIONAL_FORMAT_REQUEST', 'conditional-format rule is invalid')
  }
}

function nextRuleId(rules: readonly ConditionalFormatRuleEntry[]): string {
  let suffix = rules.length + 1
  while (rules.some((entry) => entry.id === `conditional-format-${suffix}`)) suffix += 1
  return `conditional-format-${suffix}`
}

export function listTsWorkerConditionalFormats(
  configs: TsConditionalFormatConfigs,
  sheet: ConditionalFormatSheet,
): ConditionalFormatConfigSnapshotWire {
  return snapshotFor(configs, sheet)
}

export function setTsWorkerConditionalFormatRule(
  configs: TsConditionalFormatConfigs,
  sheet: ConditionalFormatSheet,
  request: SetConditionalFormatRuleWire,
): ConditionalFormatConfigSnapshotWire {
  assertWitness(request)
  const current = currentFor(configs, sheet)
  assertExpectedRevision(current.revision, request.revision)
  const matchingIndex = request.ruleId
    ? current.rules.findIndex((entry) => entry.id === request.ruleId)
    : -1
  const entry: ConditionalFormatRuleEntry = {
    id:
      matchingIndex >= 0
        ? current.rules[matchingIndex].id
        : (request.ruleId ?? nextRuleId(current.rules)),
    scope: request.scope,
    priority:
      request.priority ??
      (matchingIndex >= 0 ? current.rules[matchingIndex].priority : current.rules.length),
    rule: request.rule,
  }
  assertEntry(entry)
  const rules =
    matchingIndex >= 0
      ? current.rules.map((rule, index) => (index === matchingIndex ? entry : rule))
      : [...current.rules, entry]
  configs.set(sheet.id, { revision: current.revision + 1, rules: cloneRules(rules) })
  return snapshotFor(configs, sheet)
}

export function removeTsWorkerConditionalFormatRule(
  configs: TsConditionalFormatConfigs,
  sheet: ConditionalFormatSheet,
  request: RemoveConditionalFormatRuleWire,
): ConditionalFormatConfigSnapshotWire {
  assertWitness(request)
  if (typeof request.ruleId !== 'string' || request.ruleId.length === 0) {
    throw rejection('INVALID_CONDITIONAL_FORMAT_REQUEST', 'conditional-format ruleId is required')
  }
  const current = currentFor(configs, sheet)
  assertExpectedRevision(current.revision, request.revision)
  configs.set(sheet.id, {
    revision: current.revision + 1,
    rules: cloneRules(current.rules.filter((entry) => entry.id !== request.ruleId)),
  })
  return snapshotFor(configs, sheet)
}

export function snapshotTsWorkerConditionalFormats(
  configs: TsConditionalFormatConfigs,
  sheets: readonly ConditionalFormatSheet[],
): ConditionalFormatConfigSnapshotWire[] {
  return sheets
    .map((sheet) => snapshotFor(configs, sheet))
    .filter((snapshot) => snapshot.revision > 0 || snapshot.rules.length > 0)
}

export function restoreTsWorkerConditionalFormats(
  sheets: readonly ConditionalFormatSheet[],
  snapshots: readonly ConditionalFormatConfigSnapshotWire[] | undefined,
): TsConditionalFormatConfigs {
  const restored: TsConditionalFormatConfigs = new Map()
  const seenSheets = new Set<number>()
  for (const snapshot of snapshots ?? []) {
    const sheet = sheets[snapshot.sheet]
    if (
      !sheet ||
      !Number.isSafeInteger(snapshot.sheet) ||
      !Number.isSafeInteger(snapshot.revision) ||
      snapshot.revision < 0 ||
      seenSheets.has(snapshot.sheet)
    ) {
      throw rejection(
        'INVALID_CONDITIONAL_FORMAT_SNAPSHOT',
        'conditional-format snapshot is invalid',
      )
    }
    seenSheets.add(snapshot.sheet)
    if (!Array.isArray(snapshot.rules)) {
      throw rejection(
        'INVALID_CONDITIONAL_FORMAT_SNAPSHOT',
        'conditional-format rules must be an array',
      )
    }
    const rules = cloneRules(snapshot.rules)
    const ids = new Set<string>()
    for (const rule of rules) {
      assertEntry(rule)
      if (ids.has(rule.id)) {
        throw rejection(
          'INVALID_CONDITIONAL_FORMAT_SNAPSHOT',
          'conditional-format rule ids must be unique',
        )
      }
      ids.add(rule.id)
    }
    restored.set(sheet.id, { revision: snapshot.revision, rules })
  }
  return restored
}

/** Transfers config through TS runtime sheet rebuilds without an adapter mirror. */
export function preserveTsWorkerConditionalFormats(
  configs: TsConditionalFormatConfigs,
  previousSheets: readonly ConditionalFormatSheet[],
  nextSheets: readonly ConditionalFormatSheet[],
  removedIdx?: number,
): TsConditionalFormatConfigs {
  const priorByName = new Map(previousSheets.map((sheet) => [sheet.name, sheet]))
  const preserved: TsConditionalFormatConfigs = new Map()
  for (const next of nextSheets) {
    const source = priorByName.get(next.name) ?? previousSheets[next.idx]
    if (!source || source.idx === removedIdx) continue
    const config = configs.get(source.id)
    if (config)
      preserved.set(next.id, { revision: config.revision, rules: cloneRules(config.rules) })
  }
  return preserved
}
