import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { brotliCompress, gzip, constants } from 'node:zlib'

const brotli = promisify(brotliCompress), deflate = promisify(gzip)
export async function compressAssets(root) {
  const files = []
  const walk = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile() && /\.(js|css|html|json|svg)$/.test(entry.name)) files.push(path)
    }
  }
  await walk(root)
  const sizes = await Promise.all(files.map(async path => {
    const source = await readFile(path)
    if (source.length < 512) return { raw: 0, br: 0, count: 0 }
    const [br, gz] = await Promise.all([brotli(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }), deflate(source, { level: 9 })])
    await Promise.all([writeFile(path + '.br', br), writeFile(path + '.gz', gz)])
    return { raw: source.length, br: br.length, count: 1 }
  }))
  return sizes.reduce((total, size) => ({ raw: total.raw + size.raw, br: total.br + size.br, count: total.count + size.count }), { raw: 0, br: 0, count: 0 })
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const size = await compressAssets(resolve('dist'))
  console.info(`Precompressed ${size.count} static files: ${(size.raw / 1024).toFixed(0)} KiB → ${(size.br / 1024).toFixed(0)} KiB Brotli`)
}
