// The Ankra mark as geometry. Three congruent pieces, each a hexagon
// side folding into a bar, arranged at 120° around one centre. Piece A is
// traced from the 1600×1600 master; B and C are exact rotations of it,
// which keeps the mark symmetric and lets a 120° turn loop seamlessly.
//
// Everything here is plain math (no DOM), normalised so the mark spans
// roughly [-0.86, 0.86] × [-0.96, 1.0] in a y-down space.

export type Pt = readonly [number, number]

export const TAU = Math.PI * 2

const MASTER_CENTRE: Pt = [812, 784]
const MASTER_SCALE = 800

const RAW_PIECE: Pt[] = [
  [754, 24],
  [124, 385],
  [124, 1137],
  [1204, 1137],
  [1132, 1009],
  [255, 1007],
  [254, 464],
  [636, 241],
]
// Centre line of the same piece: end cap → hexagon corner → corner → end cap.
const RAW_SPINE: Pt[] = [
  [695, 132.5],
  [189, 422.5],
  [189, 1072],
  [1168, 1073],
]

/** Half the stroke width, in normalised units. */
export const HALF_W = 0.0815

/** Share of the canvas the mark's unit radius occupies. Small marks sway less, so they fill more. */
export const scaleFor = (size: number) => (size < 40 ? 0.44 : 0.4)

const norm = ([x, y]: Pt): Pt => [(x - MASTER_CENTRE[0]) / MASTER_SCALE, (y - MASTER_CENTRE[1]) / MASTER_SCALE]

export function rotate([x, y]: Pt, a: number): Pt {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [x * c - y * s, x * s + y * c]
}

const PIECE_A = RAW_PIECE.map(norm)
const SPINE_A = RAW_SPINE.map(norm)

export const PIECES: Pt[][] = [0, 1, -1].map((n) => PIECE_A.map((p) => rotate(p, (n * TAU) / 3)))
const SPINES: Pt[][] = [0, 1, -1].map((n) => SPINE_A.map((p) => rotate(p, (n * TAU) / 3)))

/** Unit vector from the centre toward each piece's centroid. */
export const PIECE_DIR: Pt[] = PIECES.map((poly) => {
  let x = 0
  let y = 0
  for (const p of poly) {
    x += p[0]
    y += p[1]
  }
  const l = Math.hypot(x, y) || 1
  return [x / l, y / l]
})

function inside(px: number, py: number, poly: Pt[]): boolean {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

/** Signed distance to a polygon's outline: positive inside. */
function signedDist(px: number, py: number, poly: Pt[]): number {
  let m = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j]
    const [bx, by] = poly[i]
    const dx = bx - ax
    const dy = by - ay
    const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    m = Math.min(m, Math.hypot(px - ax - dx * t, py - ay - dy * t))
  }
  return inside(px, py, poly) ? m : -m
}

/** Offset a polyline sideways by `o` with mitred joins; ends are pushed out by `ext`. */
function offsetLine(line: Pt[], o: number, ext: number): Pt[] {
  const n = line.length
  const dirs: Pt[] = []
  for (let i = 0; i < n - 1; i++) {
    const dx = line[i + 1][0] - line[i][0]
    const dy = line[i + 1][1] - line[i][1]
    const l = Math.hypot(dx, dy)
    dirs.push([dx / l, dy / l])
  }
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = dirs[Math.max(0, i - 1)]
    const b = dirs[Math.min(n - 2, i)]
    const na: Pt = [-a[1], a[0]]
    const nb: Pt = [-b[1], b[0]]
    let mx = na[0] + nb[0]
    let my = na[1] + nb[1]
    const ml = Math.hypot(mx, my) || 1
    mx /= ml
    my /= ml
    const k = o / Math.max(0.35, mx * nb[0] + my * nb[1])
    let x = line[i][0] + mx * k
    let y = line[i][1] + my * k
    if (i === 0) {
      x -= a[0] * ext
      y -= a[1] * ext
    }
    if (i === n - 1) {
      x += b[0] * ext
      y += b[1] * ext
    }
    out.push([x, y])
  }
  return out
}

function hash(a: number, b: number): number {
  const h = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453
  return h - Math.floor(h)
}

export interface MarkDot {
  /** Rest position, normalised, y-down. */
  x: number
  y: number
  /** Piece index 0..2. */
  k: number
  /** 0..1 — shrinks dots that sit near a slanted end cap. */
  cover: number
  /** Polar angle around the centre. */
  ang: number
  /** Per-dot random phase. */
  phase: number
  /** 0..0.5 — sweep-ordered stagger for dissolve/reform. */
  stag: number
  /** 0.2..1.6 — settle delay for the intro. */
  delay: number
  /** Home on the dotted orb (Fibonacci sphere). */
  ox: number
  oy: number
  oz: number
}

export interface MarkSample {
  dots: MarkDot[]
  /** CSS px per normalised unit. */
  scale: number
  /** Resting dot radius in CSS px. */
  r: number
  /** Dot indices ordered by angle around the centre (a sweep). */
  byAngle: number[]
}

const cache = new Map<number, MarkSample>()

export const ORB_RADIUS = 0.62

/**
 * Lay dots along each piece in parallel rails, tuned to the rendered size.
 * Tiny marks get one rail per stroke (a dotted line drawing of the logo);
 * large ones get a staggered halftone. Cached per size.
 */
export function sampleMark(size: number): MarkSample {
  const key = Math.round(size)
  const hit = cache.get(key)
  if (hit) return hit

  const scale = key * scaleFor(key)
  const pitchPx = key < 40 ? 2.3 : Math.max(2.5, key * 0.0125)
  const strokePx = 2 * HALF_W * scale
  const rows = Math.min(8, Math.max(1, Math.round(strokePx / pitchPx)))
  const pitch = pitchPx / scale
  const gap = Math.min((2 * HALF_W) / rows, pitch)
  // small marks need bolder dots to stay legible as a logo
  const floor = key < 40 ? 0.82 : key < 80 ? 0.7 : 0.55
  const r = Math.max(floor, Math.min(pitchPx * 0.42, (strokePx / rows) * 0.48))

  const dots: MarkDot[] = []
  for (let k = 0; k < 3; k++) {
    for (let j = 0; j < rows; j++) {
      const o = ((j + 0.5) / rows - 0.5) * 2 * HALF_W
      const line = offsetLine(SPINES[k], o, HALF_W * 1.6)
      let s = (j % 2) * pitch * 0.5
      let acc = 0
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, ay] = line[i]
        const [bx, by] = line[i + 1]
        const len = Math.hypot(bx - ax, by - ay)
        while (s <= acc + len) {
          const f = (s - acc) / len
          const x = ax + (bx - ax) * f
          const y = ay + (by - ay) * f
          const d = signedDist(x, y, PIECES[k])
          if (d > -0.12 * gap) {
            const c = Math.min(1, Math.max(0, (d + 0.15 * gap) / (0.65 * gap)))
            dots.push({
              x,
              y,
              k,
              cover: c * c * (3 - 2 * c),
              ang: Math.atan2(y, x),
              phase: hash(x * 41, y * 17) * TAU,
              stag: 0,
              delay: 0,
              ox: 0,
              oy: 0,
              oz: 0,
            })
          }
          s += pitch
        }
        acc += len
      }
    }
  }

  // Orb homes: walk the Fibonacci sphere in the same angular order as the
  // mark, so dissolving reads as a sweep rather than noise.
  const n = dots.length
  const golden = Math.PI * (3 - Math.sqrt(5))
  const order = dots.map((_, i) => i).sort((a, b) => dots[a].ang - dots[b].ang)
  order.forEach((idx, i) => {
    const y = 1 - (2 * (i + 0.5)) / n
    const rad = Math.sqrt(1 - y * y)
    const a = i * golden
    const d = dots[idx]
    d.ox = rad * Math.cos(a) * ORB_RADIUS
    d.oy = y * ORB_RADIUS
    d.oz = rad * Math.sin(a) * ORB_RADIUS
    d.stag = (i / n) * 0.5
    d.delay = 0.2 + hash(d.x * 97, d.y * 131) * 0.8 + Math.hypot(d.x, d.y) * 0.5
  })

  const sample = { dots, scale, r, byAngle: order }
  cache.set(key, sample)
  return sample
}
