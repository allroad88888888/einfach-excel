// 一句话：投影 revision 见证值的推进。

import type { ProjectionRevision } from '@einfach/spreadsheet-ui-core'

export function bumpRevision(revision: ProjectionRevision): ProjectionRevision {
  if (typeof revision === 'number' && Number.isFinite(revision)) {
    return revision + 1
  }
  return revision
}

export function nextRevisionOrThrow(revision: ProjectionRevision): ProjectionRevision {
  const nextRevision = bumpRevision(revision)
  if (Object.is(nextRevision, revision)) {
    throw new Error(`cannot advance projection revision ${String(revision)}`)
  }
  return nextRevision
}
