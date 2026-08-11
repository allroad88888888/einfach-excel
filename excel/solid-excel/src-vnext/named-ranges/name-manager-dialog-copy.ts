import type {
  NameManagerKind,
  NamedRangeBackendCapabilities,
  NamedRangeScope,
  TableDiagnosticCode,
} from '@einfach/spreadsheet-ui-core'

export function scopeToString(scope: NamedRangeScope): string {
  return scope === 'workbook' ? 'workbook' : `sheet:${scope.sheetId}`
}

export function scopeKind(scope: string): 'workbook' | 'sheet' {
  return scope === 'workbook' ? 'workbook' : 'sheet'
}

export function bindingKind(
  kind: NameManagerKind,
): keyof NamedRangeBackendCapabilities['bindings'] {
  return kind === 'value' ? 'constant' : kind
}

const STATUS_COPY = {
  en: {
    capabilityUnavailable: 'Name operations are unavailable for this workbook.',
    confirmedNotApplied: 'The change was not applied. Your draft is kept.',
    deleteSelectionRequired: 'Select a name to delete.',
    invalidNameOrReference: 'The name or reference is invalid.',
    ledgerFull: 'The name operation history is full. Try again after it is resolved.',
    operationUnavailable: 'This name operation is currently unavailable.',
    operationUnsupported: 'This name operation is not supported.',
    outcomeUnknown: 'The operation result could not be confirmed. Your draft is kept.',
    projectionUnknown: 'The name list could not be confirmed. No change was sent.',
    refreshing: 'Refreshing the name list…',
    workbookContextChanged: 'The workbook context changed. Review the draft and try again.',
  },
  zh: {
    capabilityUnavailable: '当前工作簿暂不支持名称操作。',
    confirmedNotApplied: '本次更改未应用，草稿已保留。',
    deleteSelectionRequired: '请选择要删除的名称。',
    invalidNameOrReference: '名称或引用无效。',
    ledgerFull: '名称操作记录已满，请等待当前操作解决后重试。',
    operationUnavailable: '当前名称操作不可用。',
    operationUnsupported: '当前名称操作不受支持。',
    outcomeUnknown: '操作结果尚未确认，草稿已保留。',
    projectionUnknown: '名称列表尚未确认，未发送新的更改。',
    refreshing: '正在刷新名称列表…',
    workbookContextChanged: '工作簿上下文已变化，请检查草稿后重试。',
  },
} as const

type StatusCopyKey = keyof (typeof STATUS_COPY)['en']

const CORE_ERROR_COPY_KEY: Readonly<Record<string, StatusCopyKey>> = Object.freeze({
  名称能力不可用: 'capabilityUnavailable',
  名称列表正在刷新: 'refreshing',
  名称列表未确认: 'projectionUnknown',
  当前名称操作不可用: 'operationUnavailable',
  当前名称操作不受支持: 'operationUnsupported',
  名称操作记录已满: 'ledgerFull',
  工作簿上下文已变化: 'workbookContextChanged',
  请选择要删除的名称: 'deleteSelectionRequired',
  名称或引用无效: 'invalidNameOrReference',
  操作结果未确认: 'outcomeUnknown',
})

export function localizedCoreError(locale: 'en' | 'zh', error: string): string {
  const key = CORE_ERROR_COPY_KEY[error]
  return key === undefined ? error : STATUS_COPY[locale][key]
}

export function fallbackStatusCopy(locale: 'en' | 'zh', key: StatusCopyKey): string {
  return STATUS_COPY[locale][key]
}

export const TABLE_DIAGNOSTIC_COPY_KEY: Readonly<Partial<Record<TableDiagnosticCode, string>>> =
  Object.freeze({
    capability: 'nameManager.tables.error.capability',
    'invalid-name': 'nameManager.tables.error.invalidName',
    'name-like-cell-ref': 'nameManager.tables.error.nameLikeCellRef',
    'name-conflict': 'nameManager.tables.error.nameConflict',
    'reserved-name': 'nameManager.tables.error.reservedName',
    'name-unchanged': 'nameManager.tables.error.nameUnchanged',
    'not-found': 'nameManager.tables.error.notFound',
    'outcome-unknown': 'nameManager.tables.error.outcomeUnknown',
  })
