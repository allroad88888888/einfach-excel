#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { basename, extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const COMPONENT_KINDS = Object.freeze(['wasm', 'js_glue', 'worker', 'ui'])
const UI_EXTENSIONS = new Set(['.css', '.html', '.js'])

const USAGE = `Usage: node scripts/measure-ad512-size-composition.mjs --candidate <directory> --build-command <command>

Records raw and gzip bytes for known resources in an already-built candidate directory.
This command does not build or publish anything. Output is a candidate-build record on stdout.`

const repositoryPath = (path, cwd) => relative(cwd, path).split(sep).join('/') || '.'

const readCommand = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`)
  return `${result.stdout}${result.stderr}`.trim()
}

const isGlueFile = (path) => /^einfach_wasm(?:[-_].+)?\.js$/.test(basename(path))

export const classifyCandidatePath = (path) => {
  const extension = extname(path)
  if (extension === '.wasm') return 'wasm'
  if (extension === '.js' && isGlueFile(path)) return 'js_glue'
  if (extension === '.js' && /worker/i.test(basename(path))) return 'worker'
  return UI_EXTENSIONS.has(extension) ? 'ui' : null
}

const listFiles = (directory) => {
  const files = []

  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...listFiles(path))
    else if (entry.isFile()) files.push(path)
  }

  return files
}

const gzipByteLength = (path) => execFileSync('gzip', ['-n', '-9', '-c', path]).byteLength

export const measureCandidateComponents = (candidatePath, { cwd = process.cwd() } = {}) => {
  const candidateDirectory = resolve(cwd, candidatePath)
  if (!statSync(candidateDirectory).isDirectory()) {
    throw new Error(`--candidate must name a directory: ${candidatePath}`)
  }

  const components = Object.fromEntries(COMPONENT_KINDS.map((kind) => [kind, []]))
  const excludedPaths = []

  for (const path of listFiles(candidateDirectory)) {
    const kind = classifyCandidatePath(path)
    const displayPath = repositoryPath(path, cwd)
    if (!kind) {
      excludedPaths.push(displayPath)
      continue
    }
    components[kind].push({
      gzip_bytes: gzipByteLength(path),
      path: displayPath,
      raw_bytes: statSync(path).size,
    })
  }

  return {
    candidate_path: repositoryPath(candidateDirectory, cwd),
    components,
    excluded_paths: excludedPaths,
  }
}

export const parseMeasurementOptions = (args) => {
  let buildCommand
  let candidate

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index]
    if (option === '--help') return { help: true }
    if (option !== '--build-command' && option !== '--candidate') {
      throw new Error(`unknown option: ${option}`)
    }
    const value = args[index + 1]
    if (!value) throw new Error(`${option} requires a value`)
    if (option === '--build-command') buildCommand = value
    else candidate = value
    index += 1
  }

  if (!candidate) throw new Error('--candidate requires a value')
  if (!buildCommand) throw new Error('--build-command requires a value')
  return { buildCommand, candidate }
}

const firstLine = (text) => text.split('\n')[0]

export const captureMeasurementProvenance = ({ buildCommand, candidate }) => {
  const worktreeStatus = readCommand('git', ['status', '--short'])
  return {
    build_command: buildCommand,
    captured_at_utc: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    gzip_command: 'gzip -n -9 -c <resource>',
    revision: readCommand('git', ['rev-parse', 'HEAD']),
    tool_versions: {
      gzip: firstLine(readCommand('gzip', ['--version'])),
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
    },
    worktree: worktreeStatus
      ? { clean: false, status: worktreeStatus.split('\n') }
      : { clean: true },
    ...measureCandidateComponents(candidate),
  }
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (isMainModule) {
  try {
    const options = parseMeasurementOptions(process.argv.slice(2))
    if (options.help) process.stdout.write(`${USAGE}\n`)
    else process.stdout.write(`${JSON.stringify(captureMeasurementProvenance(options), null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`${error.message}\n${USAGE}\n`)
    process.exitCode = 1
  }
}
