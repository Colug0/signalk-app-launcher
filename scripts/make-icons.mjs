// Writes the app icon as SVG and as the PNG sizes phones want for a home
// screen icon (iOS ignores SVG there). Run with: node scripts/make-icons.mjs
// Plain Node, no image library: the design is a 3x3 grid of rounded tiles.
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BG = [0x0b, 0x22, 0x39]
const TILE = [0xff, 0xff, 0xff]
const ACCENT = [0x5a, 0xa9, 0xe6]
const OUT = new URL('../static/', import.meta.url)

// Geometry in a 100x100 box. The grid fills the central 60%, inside the safe
// zone of Android's maskable icons.
const GRID = 60
const GAP = 6
const CELL = (GRID - 2 * GAP) / 3
const START = (100 - GRID) / 2
const RADIUS = 4
const cells = []
for (let row = 0; row < 3; row++) {
  for (let col = 0; col < 3; col++) {
    cells.push({
      x: START + col * (CELL + GAP),
      y: START + row * (CELL + GAP),
      color: row === 0 && col === 0 ? ACCENT : TILE
    })
  }
}

const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`

function svg() {
  const rects = cells
    .map(
      (c) =>
        `  <rect x="${c.x.toFixed(2)}" y="${c.y.toFixed(2)}" width="${CELL.toFixed(2)}" height="${CELL.toFixed(2)}" rx="${RADIUS}" fill="${hex(c.color)}"/>`
    )
    .join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="${hex(BG)}"/>
${rects}
</svg>
`
}

// Coverage of a rounded rectangle at (px, py), 4x4 supersampled.
function inRounded(px, py, x, y, w, h, r) {
  if (px < x || py < y || px > x + w || py > y + h) return false
  const cx = Math.min(Math.max(px, x + r), x + w - r)
  const cy = Math.min(Math.max(py, y + r), y + h - r)
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

// Full-bleed background: iOS and Android mask the corners themselves.
function png(size) {
  const S = 4
  const scale = 100 / size
  const raw = Buffer.alloc(size * (size * 3 + 1))
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 3 + 1)
    raw[rowStart] = 0
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0]
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const px = (x + (sx + 0.5) / S) * scale
          const py = (y + (sy + 0.5) / S) * scale
          const hit = cells.find((c) => inRounded(px, py, c.x, c.y, CELL, CELL, RADIUS))
          const color = hit ? hit.color : BG
          for (let i = 0; i < 3; i++) acc[i] += color[i]
        }
      }
      for (let i = 0; i < 3; i++) raw[rowStart + 1 + x * 3 + i] = Math.round(acc[i] / (S * S))
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

writeFileSync(new URL('icon.svg', OUT), svg())
for (const size of [180, 192, 512]) {
  writeFileSync(new URL(`icon-${size}.png`, OUT), png(size))
}
console.log('icons written to static/')
