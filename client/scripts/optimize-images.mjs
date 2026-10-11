// `npm run images`: make responsive WebP versions of our own photos next to the source JPGs.
//   public/products[/dark]/<slug>.jpg   → <slug>-480/800/1200/1600.webp   (square product cards and pages)
//   public/categories[/dark]/<slug>.jpg → <slug>-400/800.webp             (4:5 category tiles)
//   public/banners/<name>.jpg           → <name>-960/1600.webp            (home hero)
//
// The AI-generated product and category photos fade into a smeared, out-of-focus strip along the bottom. For those
// sets the script measures edge detail row by row, trims that strip off (never more than MAX_TRIM of the height) and
// trims the sides by the same proportion, so the image keeps its shape (square / 4:5) and the product stays centred.
// The JPGs stay as the untouched originals; lib/images.js serves the WebP files. Re-run after replacing a photo
// (and bump the photo version in seed.js / lib/images.js as before).
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const PUBLIC = path.resolve(import.meta.dirname, '../public')
const MAX_TRIM = 0.22
const SETS = [
  // [folder, widths, trim the blurred bottom strip?]
  ['products', [480, 800, 1200, 1600], true],
  ['products/dark', [480, 800, 1200, 1600], true],
  ['categories', [400, 800], true],
  ['categories/dark', [400, 800], true],
  ['banners', [960, 1600], false],
]

/** Fraction of the height (from the top) that is in focus: where the last band clearly sharper than the bottom ends. */
async function sharpHeight(file) {
  const BANDS = 40
  const { data, info } = await sharp(file)
    .greyscale()
    .resize({ width: 600 })
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const edge = []
  for (let b = 0; b < BANDS; b++) {
    let sum = 0
    let n = 0
    for (let y = Math.floor((b * info.height) / BANDS); y < Math.floor(((b + 1) * info.height) / BANDS); y++) {
      for (let x = 0; x < info.width; x++, n++) sum += data[y * info.width + x]
    }
    edge.push(sum / n)
  }
  // The bottom bands are the smeared strip; content is wherever detail is clearly above that floor.
  const floor = Math.max(...edge.slice(-3))
  const peak = Math.max(...edge)
  const threshold = floor + Math.max(1, (peak - floor) * 0.18)
  let last = BANDS - 1
  while (last > 0 && edge[last] < threshold) last--
  const keep = Math.min(1, (last + 2) / BANDS) // one band of breathing room below the last sharp band
  return Math.max(1 - MAX_TRIM, keep)
}

let before = 0
let after = 0
const trims = []
for (const [dir, widths, trim] of SETS) {
  const abs = path.join(PUBLIC, dir)
  if (!fs.existsSync(abs)) continue
  for (const file of fs.readdirSync(abs).filter((f) => f.endsWith('.jpg'))) {
    const src = path.join(abs, file)
    before += fs.statSync(src).size
    const meta = await sharp(src).metadata()
    let region = { left: 0, top: 0, width: meta.width, height: meta.height }
    if (trim) {
      const keep = await sharpHeight(src)
      const height = Math.round(meta.height * keep)
      const width = Math.round(meta.width * keep) // same factor on both axes keeps the aspect ratio
      region = { left: Math.round((meta.width - width) / 2), top: 0, width, height }
      if (keep < 1) trims.push(`${dir}/${file}: bottom ${Math.round((1 - keep) * 100)}% trimmed`)
    }
    for (const w of widths) {
      const out = src.replace(/\.jpg$/, `-${w}.webp`)
      await sharp(src)
        .extract(region)
        // Exact advertised width, so srcset descriptors stay true after trimming (at most a 1.3x resample).
        .resize({ width: trim ? w : Math.min(w, region.width) })
        .webp({ quality: 86, effort: 5, smartSubsample: true })
        .toFile(out)
      if (w === widths.at(-1)) after += fs.statSync(out).size
    }
  }
}
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`
if (process.argv.includes('--report')) trims.forEach((t) => console.log(t))
console.log(`${trims.length} photos had a blurred bottom strip trimmed · source JPGs ${mb(before)} → largest WebP set ${mb(after)}`)
