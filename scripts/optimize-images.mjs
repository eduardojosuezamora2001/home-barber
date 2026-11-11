import { readdir } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

const imageDirectory = path.resolve("apps/web/public/images")
const widths = { "home-hero": 1536, "home-interior": 1200, "home-ritual": 900, "home-finish": 900 }

for (const file of await readdir(imageDirectory)) {
  if (!file.endsWith(".png")) continue
  const name = path.basename(file, ".png")
  const output = path.join(imageDirectory, `${name}.webp`)
  const { size } = await sharp(path.join(imageDirectory, file))
    .resize({ width: widths[name] ?? 1200, withoutEnlargement: true })
    .webp({ quality: 78, effort: 6 })
    .toFile(output)
  process.stdout.write(`${file}: ${Math.round(size / 1024)} KiB WebP\n`)
}
