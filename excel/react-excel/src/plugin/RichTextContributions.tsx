import { useSpreadsheetPlugins } from './plugin-context'

/** Mount optional character tools inside the shared dialog's disabled/focus boundary. */
export function RichTextContributions({ restoreSelection }: {
  readonly restoreSelection: () => void
}) {
  const plugins = useSpreadsheetPlugins()
  return plugins.flatMap(plugin => (plugin.richTextTools ?? []).map(({ id, Item }) =>
    <Item key={`${plugin.id}:${id}`} restoreSelection={restoreSelection} />))
}
