/** 汇总各独立 feature 已拥有的公开命令数据类型。 */
export type {
  CreateTableRequest,
  CreateTableResult,
  DeleteTableRequest,
  GetTableRequest,
  GetTableResult,
  ListTablesRequest,
  ListTablesResult,
  RenameTableColumnRequest,
  RenameTableRequest,
  SetTableTotalFunctionRequest,
  SetTableTotalsRowRequest,
  TableMutationResult,
  TableTotalsFunction,
} from '../tables/types'
export type {
  ClearNoteRequest,
  DeleteCommentRequest,
  PostCommentRequest,
  ResolveCommentThreadRequest,
  SetNoteRequest,
} from '../comments/types'
export type {
  ClearValidationRuleRequest,
  SetValidationRuleRequest,
  ValidationOutcome,
} from '../data-validation/types'
export type {
  ConditionalFormatRulesResult,
  ListConditionalFormatRulesRequest,
  RemoveConditionalFormatRuleRequest,
  SetConditionalFormatRuleRequest,
} from '../conditional-formatting/types'
export type {
  FindRangeRequest,
  FindRangeResult,
  ReplaceMatchesRequest,
  ReplaceMatchesResult,
  SearchRangeRequest,
  SearchRangeResult,
} from '../find-replace/types'
export type {
  ReadPrintConfigRequest,
  ReadPrintConfigResult,
  SetPrintConfigRequest,
  SetPrintConfigResult,
} from '../print/types'
export type {
  ReadSheetProtectionRequest,
  ReadSheetProtectionResult,
  SetRangeLockRequest,
  SetSheetProtectionRequest,
} from '../protection/types'
export type { PasteRangeRequest, PasteRangeResult } from '../paste-special/types'
export type { SpillRegionRequest, SpillRegionResult } from '../spill/types'
