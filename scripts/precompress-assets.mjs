import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib'
import { promisify } from 'node:util'

const brotli = promisify(brotliCompress)
const gzipAsync = promisify(gzip)
const clientRoot = new URL('../dist/client/', import.meta.url)
const compressibleExtensions = new Set(['.css', '.html', '.js', '.json', '.svg', '.txt'])

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else yield path
  }
}

let fileCount = 0
let sourceBytes = 0
let compressedBytes = 0

for await (const file of walk(clientRoot.pathname)) {
  if (!compressibleExtensions.has(extname(file).toLowerCase())) continue
  const input = await readFile(file)
  const [br, gz] = await Promise.all([
    brotli(input, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 9 } }),
    gzipAsync(input, { level: 9 }),
  ])
  await Promise.all([writeFile(`${file}.br`, br), writeFile(`${file}.gz`, gz)])
  fileCount += 1
  sourceBytes += (await stat(file)).size
  compressedBytes += br.length + gz.length
}

console.log(`precompressed ${fileCount} assets (${Math.round(sourceBytes / 1024)} KiB source, ${Math.round(compressedBytes / 1024)} KiB br+gz)`)
