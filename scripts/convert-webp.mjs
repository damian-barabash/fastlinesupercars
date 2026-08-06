// Convert scraped raw assets to WebP into public/img/
// Usage: node scripts/convert-webp.mjs <src-dir>
import sharp from 'sharp'
import { readdirSync, mkdirSync, copyFileSync, statSync } from 'fs'
import { join, extname, basename } from 'path'

const SRC = process.argv[2]
const OUT = 'public/img'
mkdirSync(OUT, { recursive: true })

const files = readdirSync(SRC).filter(f => !f.startsWith('.'))
let done = 0
for (const f of files) {
  const ext = extname(f).toLowerCase()
  const src = join(SRC, f)
  const clean = basename(f, ext)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').toLowerCase()
  try {
    if (ext === '.svg' || ext === '.mp4' || ext === '.webm' || ext === '.gif') {
      copyFileSync(src, join(OUT, clean + ext))
    } else if (ext === '.webp') {
      const meta = await sharp(src).metadata()
      if (meta.width > 1920) {
        await sharp(src).resize({ width: 1920 }).webp({ quality: 82 }).toFile(join(OUT, clean + '.webp'))
      } else {
        copyFileSync(src, join(OUT, clean + '.webp'))
      }
    } else if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
      const img = sharp(src)
      const meta = await img.metadata()
      const hasAlpha = meta.hasAlpha
      const w = Math.min(meta.width || 1920, 1920)
      await img.resize({ width: w, withoutEnlargement: true })
        .webp({ quality: hasAlpha ? 90 : 82 })
        .toFile(join(OUT, clean + '.webp'))
    } else {
      continue
    }
    done++
  } catch (e) {
    console.error('FAIL', f, e.message)
  }
}
console.log(`converted ${done}/${files.length} -> ${OUT}`)
