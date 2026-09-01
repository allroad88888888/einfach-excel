interface ToolButtonProps {
  readonly icon: string
  readonly label: string
}

const TABS = ['Start', 'Insert', 'Formulas', 'Data', 'View']

function ToolButton({ icon, label }: ToolButtonProps) {
  return (
    <button className="tool-button" type="button" aria-label={label} title={label}>
      <span aria-hidden="true">{icon}</span>
    </button>
  )
}

/** Renders a Univer-inspired collapsed spreadsheet toolbar. */
export function WorkbookRibbon() {
  return (
    <div className="ribbon-shell">
      <div className="ribbon-tabs" role="tablist" aria-label="Workbook commands">
        {TABS.map((tab) => (
          <button
            aria-selected={tab === 'Start'}
            className={tab === 'Start' ? 'ribbon-tab active' : 'ribbon-tab'}
            key={tab}
            role="tab"
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>
      <span className="toolbar-divider" aria-hidden="true" />
      <div className="ribbon-tools" role="toolbar" aria-label="Start tools">
        <ToolButton icon="▣" label="Paste" />
        <ToolButton icon="✂" label="Cut" />
        <ToolButton icon="▤" label="Copy" />
        <span className="tool-separator" aria-hidden="true" />
        <button className="tool-select font-family-select" type="button">Arial <span>⌄</span></button>
        <button className="tool-select font-size-select" type="button">10 <span>⌄</span></button>
        <ToolButton icon="B" label="Bold" />
        <ToolButton icon="𝐼" label="Italic" />
        <ToolButton icon="U̲" label="Underline" />
        <ToolButton icon="▦" label="Borders" />
        <ToolButton icon="▰" label="Fill color" />
        <ToolButton icon="A̲" label="Text color" />
        <span className="tool-separator" aria-hidden="true" />
        <ToolButton icon="☷" label="Horizontal alignment" />
        <ToolButton icon="↵" label="Wrap text" />
        <ToolButton icon="⊞" label="Merge cells" />
        <span className="tool-separator" aria-hidden="true" />
        <button className="tool-select number-format-select" type="button">
          General <span>⌄</span>
        </button>
        <ToolButton icon="%" label="Percent format" />
        <ToolButton icon="Σ" label="Auto sum" />
        <div className="toolbar-spacer" />
        <ToolButton icon="⌕" label="Find" />
        <ToolButton icon="⋮" label="More tools" />
      </div>
    </div>
  )
}
