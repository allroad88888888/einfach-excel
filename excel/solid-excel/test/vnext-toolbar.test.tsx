/** @jsxImportSource solid-js */

import { afterEach, describe } from 'vitest'
import { cleanup } from '@solidjs/testing-library'
import { setLocale } from '../src/i18n'
import { registerActionsScenarios } from './vnext-toolbar-actions.scenarios'
import { registerAvailabilityScenarios } from './vnext-toolbar-availability.scenarios'
import { registerFormatCellsScenarios } from './vnext-toolbar-format-cells.scenarios'
import { registerMergeScenarios } from './vnext-toolbar-merge.scenarios'
import { registerMutationScenarios } from './vnext-toolbar-mutation.scenarios'
import { registerNumberFormatScenarios } from './vnext-toolbar-number-format.scenarios'
import { registerRecoveryScenarios } from './vnext-toolbar-recovery.scenarios'
import { registerTextStyleScenarios } from './vnext-toolbar-text-style.scenarios'

afterEach(() => {
  cleanup()
  setLocale('en')
})

setLocale('en')

describe('vNext SpreadsheetToolbar', () => {
  registerAvailabilityScenarios()
  registerMutationScenarios()
  registerRecoveryScenarios()
  registerNumberFormatScenarios()
  registerFormatCellsScenarios()
  registerMergeScenarios()
  registerActionsScenarios()
  registerTextStyleScenarios()
})
