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
  'esm/rust-worker/transport.mjs',
  'cjs/rust-worker/transport.cjs',
  '@types/rust-worker/transport.d.ts',
  'esm/rust-runtime.mjs',
  '@types/rust-runtime.d.ts',
  'esm/rust-workbook/commands.mjs',
  'cjs/rust-workbook/commands.cjs',
  '@types/rust-workbook/commands.d.ts',
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

  const runtimeExport = manifest.exports?.['./rust-runtime']
  if (!runtimeExport || typeof runtimeExport !== 'object')
    fail('manifest.exports["./rust-runtime"] must be an object')
  assertEqual(runtimeExport.types, './@types/rust-runtime.d.ts', 'runtime types')
  assertEqual(runtimeExport.import, './esm/rust-runtime.mjs', 'runtime import')

  for (const removedExport of [
    './rust-worker/adapter/*',
    './rust-worker/backend/*',
    './rust-worker/runtime-core',
    './rust-worker/runtime-full',
    './rust-worker/runtime',
  ]) {
    if (manifest.exports?.[removedExport] !== undefined)
      fail(`removed export must not be published: ${removedExport}`)
  }
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
  await assertAbsent(join(packageRoot, 'esm/rust-worker/adapter'))
  await assertAbsent(join(packageRoot, 'cjs/rust-worker/adapter'))
  await assertAbsent(join(packageRoot, '@types/rust-worker/adapter'))
  await assertAbsent(join(packageRoot, 'esm/rust-worker/backend'))
  await assertAbsent(join(packageRoot, 'esm/rust-worker/runtime'))

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
