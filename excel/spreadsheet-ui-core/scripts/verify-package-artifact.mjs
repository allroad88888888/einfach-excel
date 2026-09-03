#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const expectedRepository = {
  directory: 'excel/spreadsheet-ui-core',
  type: 'git',
  url: 'https://github.com/allroad88888888/einfach-excel.git',
}
const expectedHomepage =
  'https://github.com/allroad88888888/einfach-excel/tree/main/excel/spreadsheet-ui-core'
const expectedBugsUrl = 'https://github.com/allroad88888888/einfach-excel/issues'
const expectedFiles = ['esm', 'cjs', '@types', 'README.md']
const requiredPackageFiles = [
  'esm/index.mjs',
  'cjs/index.cjs',
  '@types/index.d.ts',
  'esm/rust-worker/index.mjs',
  'cjs/rust-worker/index.cjs',
  '@types/rust-worker/index.d.ts',
  'esm/rust-worker/runtime.mjs',
  'esm/rust-worker/runtime-core.mjs',
  'esm/rust-worker/runtime-full.mjs',
  '@types/rust-worker/runtime.d.ts',
  '@types/rust-worker/runtime-core.d.ts',
  '@types/rust-worker/runtime-full.d.ts',
  'esm/rust-worker/adapter/worker/backend.mjs',
  'cjs/rust-worker/adapter/worker/backend.cjs',
  '@types/rust-worker/adapter/worker/backend.d.ts',
  'README.md',
]
const forbiddenPackageDirectories = ['src', 'test', 'e2e', 'demos']

function fail(message) {
  throw new Error(`package artifact verification failed: ${message}`)
}

function assertEqual(actual, expected, label) {
  if (actual !== expected)
    fail(`${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

function assertArrayEqual(actual, expected, label) {
  if (!Array.isArray(actual) || actual.length !== expected.length)
    fail(`${label} must be ${JSON.stringify(expected)}`)
  actual.forEach((value, index) => assertEqual(value, expected[index], `${label}[${index}]`))
}

async function run(command, args, options) {
  try {
    return await execFileAsync(command, args, options)
  } catch (error) {
    const stderr = typeof error.stderr === 'string' ? `\n${error.stderr.trim()}` : ''
    fail(`${command} ${args.join(' ')} exited unsuccessfully${stderr}`)
  }
}

function readPackMetadata(stdout) {
  let metadata
  try {
    metadata = JSON.parse(stdout)
  } catch {
    fail('npm pack did not return JSON metadata')
  }
  if (!Array.isArray(metadata) || metadata.length !== 1)
    fail('npm pack must emit exactly one package')

  const filename = metadata[0]?.filename
  if (typeof filename !== 'string' || filename.length === 0 || basename(filename) !== filename)
    fail('npm pack metadata must contain a safe tarball filename')
  return filename
}

function verifyManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') fail('tarball package.json must be an object')

  const repository = manifest.repository
  if (!repository || typeof repository !== 'object') fail('manifest.repository must be an object')
  for (const [field, expected] of Object.entries(expectedRepository))
    assertEqual(repository[field], expected, `manifest.repository.${field}`)
  assertEqual(manifest.homepage, expectedHomepage, 'manifest.homepage')
  if (!manifest.bugs || typeof manifest.bugs !== 'object') fail('manifest.bugs must be an object')
  assertEqual(manifest.bugs.url, expectedBugsUrl, 'manifest.bugs.url')
  assertArrayEqual(manifest.files, expectedFiles, 'manifest.files')

  const rootExport = manifest.exports?.['.']
  if (!rootExport || typeof rootExport !== 'object') fail('manifest.exports["."] must be an object')
  assertEqual(rootExport.types, manifest.types, 'manifest.exports["."].types')
  assertEqual(rootExport.import, manifest.module, 'manifest.exports["."].import')
  assertEqual(rootExport.require, manifest.main, 'manifest.exports["."].require')

  const rustWorkerExport = manifest.exports?.['./rust-worker']
  if (!rustWorkerExport || typeof rustWorkerExport !== 'object')
    fail('manifest.exports["./rust-worker"] must be an object')
  assertEqual(rustWorkerExport.types, './@types/rust-worker/index.d.ts', 'rust worker types')
  assertEqual(rustWorkerExport.import, './esm/rust-worker/index.mjs', 'rust worker import')
  assertEqual(rustWorkerExport.require, './cjs/rust-worker/index.cjs', 'rust worker require')

  for (const entry of ['runtime', 'runtime-core', 'runtime-full']) {
    const workerExport = manifest.exports?.[`./rust-worker/${entry}`]
    if (!workerExport || typeof workerExport !== 'object')
      fail(`manifest.exports["./rust-worker/${entry}"] must be an object`)
    assertEqual(
      workerExport.types,
      `./@types/rust-worker/${entry}.d.ts`,
      `${entry} types`,
    )
    assertEqual(workerExport.import, `./esm/rust-worker/${entry}.mjs`, `${entry} import`)
  }

  const rustWorkerAdapterExport = manifest.exports?.['./rust-worker/adapter/*']
  if (!rustWorkerAdapterExport || typeof rustWorkerAdapterExport !== 'object')
    fail('manifest.exports["./rust-worker/adapter/*"] must be an object')
  assertEqual(
    rustWorkerAdapterExport.types,
    './@types/rust-worker/adapter/*.d.ts',
    'rust worker adapter types',
  )
  assertEqual(
    rustWorkerAdapterExport.import,
    './esm/rust-worker/adapter/*.mjs',
    'rust worker adapter import',
  )
  assertEqual(
    rustWorkerAdapterExport.require,
    './cjs/rust-worker/adapter/*.cjs',
    'rust worker adapter require',
  )
}

async function assertFile(path) {
  try {
    if (!(await stat(path)).isFile()) fail(`${path} must be a file`)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('package artifact verification failed:'))
      throw error
    fail(`tarball is missing ${path}`)
  }
}

async function assertAbsent(path) {
  try {
    await stat(path)
    fail(`tarball must not contain ${path}`)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('package artifact verification failed:'))
      throw error
    if (error?.code !== 'ENOENT') throw error
  }
}

async function verifyTarball(temporaryDirectory) {
  const { stdout } = await run(
    'npm',
    ['pack', '--json', '--pack-destination', temporaryDirectory, '--ignore-scripts', '--offline'],
    { cwd: packageDirectory },
  )
  const archive = join(temporaryDirectory, readPackMetadata(stdout))
  await assertFile(archive)

  const extractionDirectory = join(temporaryDirectory, 'unpacked')
  await mkdir(extractionDirectory)
  await run('tar', ['-xzf', archive, '-C', extractionDirectory])
  assertArrayEqual(await readdir(extractionDirectory), ['package'], 'tarball top-level layout')

  const packageRoot = join(extractionDirectory, 'package')
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  verifyManifest(manifest)
  await Promise.all(requiredPackageFiles.map((file) => assertFile(join(packageRoot, file))))
  await Promise.all(
    forbiddenPackageDirectories.map((directory) => assertAbsent(join(packageRoot, directory))),
  )

  return manifest.name
}

let temporaryDirectory
try {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'einfach-spreadsheet-ui-core-pack-'))
  const packageName = await verifyTarball(temporaryDirectory)
  process.stdout.write(
    `PASS ${packageName}: packed artifact layout and metadata verified offline\n`,
  )
} finally {
  if (temporaryDirectory) await rm(temporaryDirectory, { force: true, recursive: true })
}
