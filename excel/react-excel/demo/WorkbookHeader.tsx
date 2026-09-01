/** Renders the lightweight workbook identity bar. */
export function WorkbookHeader() {
  return (
    <header className="workbook-header">
      <div className="univer-mark" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="workbook-identity">
        <div className="workbook-name">Sales Orders</div>
        <div className="workbook-subtitle">React spreadsheet demo</div>
      </div>
      <div className="header-spacer" />
      <span className="save-state">
        <span aria-hidden="true">✓</span> Saved locally
      </span>
      <span className="demo-badge">1,000 rows</span>
      <div className="header-actions">
        <button type="button" aria-label="More workbook options">•••</button>
      </div>
    </header>
  )
}
