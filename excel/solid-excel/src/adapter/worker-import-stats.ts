import type { ImportCellIssueWire, WorkbookImportStatsWire } from './worker-protocol'

/** 导入统计（accepted / formulas / errors / issues …）的合并规则。 */

export function emptyImportStats(): WorkbookImportStatsWire {
  return {
    accepted: 0,
    formulas: 0,
    rejectedFormulas: 0,
    cleared: 0,
    errors: 0,
  }
}

export function mergeImportStats(
  a: WorkbookImportStatsWire,
  b: WorkbookImportStatsWire,
): WorkbookImportStatsWire {
  const issues = [...(a.issues ?? []), ...(b.issues ?? [])]
  return {
    accepted: a.accepted + b.accepted,
    formulas: a.formulas + b.formulas,
    rejectedFormulas: a.rejectedFormulas + b.rejectedFormulas,
    cleared: a.cleared + b.cleared,
    errors: a.errors + b.errors,
    ...(issues.length > 0 ? { issues } : {}),
  }
}

export function mergeImportStatsIssues(
  stats: WorkbookImportStatsWire,
  issues: ImportCellIssueWire[],
): WorkbookImportStatsWire {
  const mergedIssues = [...(stats.issues ?? []), ...issues]
  return mergedIssues.length > 0
    ? { ...stats, errors: stats.errors + issues.length, issues: mergedIssues }
    : stats
}

/**
 * 提交时把"重放到活工作簿"那一轮的统计并回会话统计：被引擎拒掉的公式要从
 * 乐观计入的 accepted 里扣回来。
 */
export function mergeFinalCommitStats(
  sessionStats: WorkbookImportStatsWire,
  finalStats: WorkbookImportStatsWire,
): WorkbookImportStatsWire {
  const issues = [...(sessionStats.issues ?? []), ...(finalStats.issues ?? [])]
  const rejectedFormulas = sessionStats.rejectedFormulas + finalStats.rejectedFormulas
  return {
    ...sessionStats,
    accepted: Math.max(0, sessionStats.accepted - finalStats.rejectedFormulas),
    rejectedFormulas,
    errors: sessionStats.errors + finalStats.errors,
    ...(issues.length > 0 ? { issues } : {}),
  }
}
