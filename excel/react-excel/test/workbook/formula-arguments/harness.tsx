import { render } from '@testing-library/react'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { InsertFunctionTools } from '../../../src/workbook/chrome/ribbon/InsertFunctionTools'
import { FormulaBar } from '../../../src/workbook/chrome/formula-bar/FormulaBar'
import { setupArguments } from '../../../../spreadsheet-ui-core/test/formula-arguments/fixtures'

export function showArguments(): ReturnType<typeof setupArguments> {
  const fixture = setupArguments()
  render(<WorkbookStoreProvider store={fixture.store} connection={fixture.connection}>
    <InsertFunctionTools /><FormulaBar />
  </WorkbookStoreProvider>)
  return fixture
}
