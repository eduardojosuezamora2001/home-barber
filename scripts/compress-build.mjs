import { readdir, readFile, writeFile } from "node:fs/promises"
import { promisify } from "node:util"
import { brotliCompress, constants, gzip } from "node:zlib"
import { fileURLToPath } from "node:url"
import { join } from "node:path"

const root = fileURLToPath(new URL("../apps/web/dist/", import.meta.url))
const gzipAsync = promisify(gzip)
const brotliAsync = promisify(brotliCompress)
let count = 0

async function compressDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await compressDirectory(path)
    else if (entry.isFile() && /\.(?:js|css|html|svg|json)$/.test(entry.name)) {
      const source = await readFile(path)
      if (source.length < 1024) continue
      const [gz, br] = await Promise.all([
        gzipAsync(source, { level: 9 }),
        brotliAsync(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }),
      ])
      await Promise.all([writeFile(`${path}.gz`, gz), writeFile(`${path}.br`, br)])
      count += 1
    }
  }
}

await compressDirectory(root)
console.log(`Precompressed ${count} static files with gzip and Brotli.`)
