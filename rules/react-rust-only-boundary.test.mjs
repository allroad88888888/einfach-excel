import assert from 'node:assert/strict'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const FORBIDDEN_TOKENS = Object.freeze([
  '@einfach/solid-excel',
  '@einfach/excel-core-ts',
  'worker-runtime-ts',
  'worker-entry-ts',
  'defaultExcelCoreTsWorkerFactory',
  'solid-js',
  '@einfach/solid',
])

const SOURCE_DIRECTORIES = Object.freeze([
  'excel/react-excel/src',
  'excel/react-excel/demo',
  'excel/react-excel/e2e',
  'excel/excel-worker',
])

const REACT_MANIFEST = 'excel/react-excel/package.json'
const DEPENDENCY_FIELDS = Object.freeze(['dependencies', 'peerDependencies'])
const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url))

function toRepositoryPath(root, filePath) {
  return relative(root, filePath).split(sep).join('/')
}

function listFiles(directory) {
  if (!existsSync(directory)) return []

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) return listFiles(entryPath)
    return entry.isFile() ? [entryPath] : []
  })
}

function findToken(content) {
  return FORBIDDEN_TOKENS.find((token) => content.includes(token))
}

function scanSourceFile(root, filePath) {
  const content = readFileSync(filePath)
  if (content.includes(0)) return []

  const token = findToken(content.toString('utf8'))
  return token ? [{ path: toRepositoryPath(root, filePath), token }] : []
}

function scanReactManifest(root) {
  const manifestPath = join(root, REACT_MANIFEST)
  if (!existsSync(manifestPath)) return []

  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    throw new Error(`${REACT_MANIFEST}: invalid JSON`, { cause: error })
  }

  return DEPENDENCY_FIELDS.flatMap((field) =>
    Object.entries(manifest[field] ?? {}).flatMap(([name, version]) => {
      const token = findToken(`${name}\n${String(version)}`)
      return token ? [{ path: REACT_MANIFEST, token, field }] : []
    }),
  )
}

export function scanRustOnlyBoundary(root = REPOSITORY_ROOT) {
  const sourceViolations = SOURCE_DIRECTORIES.flatMap((directory) =>
    listFiles(join(root, directory)).flatMap((filePath) => scanSourceFile(root, filePath)),
  )

  return [...sourceViolations, ...scanReactManifest(root)]
}

export function assertRustOnlyBoundary(root = REPOSITORY_ROOT) {
  const violations = scanRustOnlyBoundary(root)
  if (violations.length === 0) return

  const details = violations
    .map(({ path, token, field }) => `- ${path}${field ? ` (${field})` : ''}: ${token}`)
    .join('\n')
  throw new Error(`React Rust-only boundary violations:\n${details}`)
}

function createFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'react-rust-boundary-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}

function writeFixture(root, repositoryPath, content) {
  const filePath = join(root, repositoryPath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content)
}

function captureBoundaryError(root) {
  try {
    assertRustOnlyBoundary(root)
  } catch (error) {
    assert.ok(error instanceof Error)
    return error
  }
  assert.fail('expected the boundary scanner to reject the fixture')
}

test('current React and private worker paths are Rust-only', () => {
  assertRustOnlyBoundary()
})

test('every forbidden token fails a source fixture and reports its path', async (t) => {
  for (const [index, token] of FORBIDDEN_TOKENS.entries()) {
    await t.test(token, (tokenTest) => {
      const root = createFixture(tokenTest)
      const path = `excel/react-excel/src/forbidden-${index}.ts`
      writeFixture(root, path, `import ${JSON.stringify(token)}\n`)

      const error = captureBoundaryError(root)
      assert.match(error.message, new RegExp(path.replaceAll('/', '\\/')))
      assert.ok(error.message.includes(token))
    })
  }
})

test('dependency and peer dependency declarations are scanned', (t) => {
  const root = createFixture(t)
  writeFixture(
    root,
    REACT_MANIFEST,
    JSON.stringify({
      dependencies: { '@einfach/excel-core-ts': 'workspace:*' },
      peerDependencies: { 'solid-js': '^1.0.0' },
    }),
  )

  const error = captureBoundaryError(root)
  assert.ok(error.message.includes(`${REACT_MANIFEST} (dependencies)`))
  assert.ok(error.message.includes(`${REACT_MANIFEST} (peerDependencies)`))
})

test('worker URL tokens are scanned in the private worker package', (t) => {
  const root = createFixture(t)
  const path = 'excel/excel-worker/src/create-worker.ts'
  writeFixture(root, path, "new URL('./worker-entry-ts.ts', import.meta.url)\n")

  const error = captureBoundaryError(root)
  assert.ok(error.message.includes(path))
  assert.ok(error.message.includes('worker-entry-ts'))
})
