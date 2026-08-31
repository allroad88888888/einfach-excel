/**
 * @jest-environment node
 */

import { execFile } from 'node:child_process'
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from '@jest/globals'

const PACKAGE_ROOT = join(__dirname, '..')
const runCommand = promisify(execFile)

describe('@einfach/solid-excel stylesheet aliases', () => {
  it.each(['styles.css', 'vnext-styles.css'])(
    'keeps %s in a production tree-shaken build',
    async (stylesheet) => {
    const consumerDirectory = await mkdtemp(join(PACKAGE_ROOT, '.ad122-css-consumer-'))
    const entryFile = join(consumerDirectory, 'main.ts')
    const outputDirectory = join(consumerDirectory, 'dist')

    try {
      // This verifies workspace-source exports only; packed, published, and tarball checks are AD-124.
      await writeFile(entryFile, `import '@einfach/solid-excel/${stylesheet}'\n`)
      await writeFile(
        join(consumerDirectory, 'index.html'),
        '<script type="module" src="/main.ts"></script>\n',
      )
      await runCommand(
        process.execPath,
        [
          join(PACKAGE_ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
          'build',
          consumerDirectory,
          '--emptyOutDir',
          '--logLevel',
          'error',
          '--outDir',
          outputDirectory,
        ],
        { cwd: PACKAGE_ROOT },
      )

      const emittedFiles = await readdir(outputDirectory, { recursive: true })
      const cssAssetSizes = await Promise.all(
        emittedFiles
          .filter((file) => file.endsWith('.css'))
          .map(async (file) => stat(join(outputDirectory, file))),
      )

      expect(cssAssetSizes.some(({ size }) => size > 0)).toBe(true)
    } finally {
      await rm(consumerDirectory, { force: true, recursive: true })
    }
    },
    30_000,
  )
})
