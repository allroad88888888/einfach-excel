import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from '@jest/globals'

import { createStaticSpreadsheetBackend } from '../../src-vnext/adapter/static-backend'
import { mountVanillaEditingPoc } from '../../vanilla-editing-poc'

const POC_SOURCE_DIR = join(process.cwd(), 'excel/solid-excel/vanilla-editing-poc')
const SHEET_ID = 'sheet-1'

function sourceFiles(): string[] {
  return readdirSync(POC_SOURCE_DIR)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => readFileSync(join(POC_SOURCE_DIR, name), 'utf8'))
}

async function waitForCommit(
  poc: Awaited<ReturnType<typeof mountVanillaEditingPoc>>,
): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (poc.state().status === 'idle') return
    await Promise.resolve()
  }
  throw new Error('Expected the editing command to settle.')
}

describe('Vanilla editing POC', () => {
  it('starts a controlled draft, commits through Core, then displays the refreshed projection', async () => {
    const root = document.createElement('div')
    const backend = createStaticSpreadsheetBackend([['before']])
    const poc = await mountVanillaEditingPoc(root, { backend, sheetId: SHEET_ID })
    const input = root.querySelector<HTMLInputElement>('[data-testid="vanilla-editing-input"]')
    const commit = root.querySelector<HTMLButtonElement>('[data-testid="vanilla-editing-commit"]')

    input?.dispatchEvent(new FocusEvent('focus'))
    expect(poc.state()).toMatchObject({ status: 'drafting', draft: 'before' })

    if (!input) throw new Error('Expected the controlled editing input.')
    input.value = 'after'
    input.dispatchEvent(new Event('input'))
    expect(poc.state()).toMatchObject({ status: 'drafting', draft: 'after' })

    commit?.click()
    await waitForCommit(poc)
    expect(root.querySelector('[data-testid="vanilla-editing-cell"]')?.textContent).toBe('after')
    expect(poc.state().status).toBe('idle')
    poc.destroy()
  })

  it('has no framework imports and releases its DOM listeners without allocating observers', async () => {
    expect(sourceFiles().join('\n')).not.toMatch(
      /from\s+['"](?:solid-js|react|vue)(?:\/[^'"]*)?['"]/,
    )

    const root = document.createElement('div')
    const backend = createStaticSpreadsheetBackend([['before']])
    const poc = await mountVanillaEditingPoc(root, { backend, sheetId: SHEET_ID })
    const input = root.querySelector<HTMLInputElement>('[data-testid="vanilla-editing-input"]')
    const beforeDestroy = poc.state()

    poc.destroy()
    if (!input) throw new Error('Expected the controlled editing input.')
    input.value = 'ignored'
    input.dispatchEvent(new Event('input'))

    expect(poc.state()).toEqual(beforeDestroy)
    expect(sourceFiles().join('\n')).not.toContain('ResizeObserver')
  })
})
