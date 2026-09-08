import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  coordToA1,
  findReplacePanelAtom,
  runFindReplaceAtom,
  workbookDocumentAtom,
} from '@einfach/spreadsheet-ui-core'

/** 展示原生结果页；翻页和定位都回到同一个查找命令，不缓存第二份选区。 */
export function FindResults() {
  const state = useAtomValue(findReplacePanelAtom)
  const workbook = useAtomValue(workbookDocumentAtom)
  const run = useSetAtom(runFindReplaceAtom)
  const result = state.result
  const page = result?.page
  if (!page || !result || !page.matches.length) return null
  const last = Math.floor((result.total - 1) / 100) * 100
  const busy = state.busy !== null
  return (
    <section className="find-results" aria-label="All search results">
      <p role="status">
        Results {page.offset + 1}–{page.offset + page.matches.length} of {result.total}
      </p>
      <div className="find-results-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Sheet / cell</th>
              <th>Position</th>
            </tr>
          </thead>
          <tbody>
            {page.matches.map((match, index) => {
              const position = page.offset + index
              const sheet = workbook.sheets.find((item) => item.id === match.sheetId)
              const address = `${sheet?.name ?? match.sheetId}!${coordToA1(match)}`
              return (
                <tr key={position} aria-selected={result.index === position}>
                  <td>{position + 1}</td>
                  <td>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Go to ${address}, match ${position + 1}`}
                      onClick={() => void run({ match: position })}
                    >
                      {address}
                    </button>
                  </td>
                  <td>
                    {match.start + 1}–{match.end}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <nav className="find-actions" aria-label="Search result pages">
        <button
          type="button"
          disabled={busy || page.offset === 0}
          onClick={() => void run({ page: 0 })}
        >
          First page
        </button>
        <button
          type="button"
          disabled={busy || page.offset === 0}
          onClick={() => void run({ page: Math.max(0, page.offset - 100) })}
        >
          Previous page
        </button>
        <button
          type="button"
          disabled={busy || page.offset >= last}
          onClick={() => void run({ page: page.offset + 100 })}
        >
          Next page
        </button>
        <button
          type="button"
          disabled={busy || page.offset >= last}
          onClick={() => void run({ page: last })}
        >
          Last page
        </button>
      </nav>
    </section>
  )
}
