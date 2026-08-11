import {
  isToolbarFormatCommandAvailable,
  type ToolbarCommandAvailability,
  type ToolbarFormatCommandInput,
} from '@einfach/spreadsheet-ui-core'

import type { CommandAvailability, ResolvedCommand } from './command-shell'

/**
 * Mirrors the UI-core toolbar intent gate as a read-only command resolution.
 * UI-core remains the source of truth for atom-backed dispatch and intent
 * publication; the surface can use this adapter for its enabled state.
 */
export function resolveToolbarFormatCommand(
  command: ToolbarFormatCommandInput,
  availabilitySnapshot: ToolbarCommandAvailability,
): ResolvedCommand<ToolbarFormatCommandInput> {
  const availability: CommandAvailability = isToolbarFormatCommandAvailable(
    command.command,
    availabilitySnapshot,
  )
    ? { status: 'ready' }
    : { status: 'disabled', reason: null }
  return { command, availability, presentation: undefined }
}
