// Dotted emoji faces in the thinking-orbs idiom: a slightly domed disc,
// projected and depth-shaded like the mark, every stroke laid out as
// evenly spaced dots. Each expression has one small motion of its own.
// Geometry lives in the mark's normalised, y-down space so the two can be
// paired dot for dot when one streams into the other.

import { makeProj } from 'thinking-orbs'
import type { Dot } from 'thinking-orbs'

import { ease, easeOut, pointerField } from './core'
import type { AnkraInput, Ink } from './core'
import { TAU, scaleFor } from './geometry'
import type { Pt } from './geometry'

export type AnkraEmoji = 'happy' | 'sad' | 'confused' | 'wink' | 'euro'

type Part = 'face' | 'eyeL' | 'eyeR' | 'browL' | 'browR' | 'mouth' | 'tear'

interface Feature {
  part: Part
  /**
   * `line`: dots along a polyline. `fill`: a solid dotted ellipse.
   * `wink`: an eye that is a solid ellipse (`c`, `rx`, `ry`) when open and
   * the curve `pts` when shut; the same dots travel between the two.
   */
  kind: 'line' | 'fill' | 'wink'
  pts?: Pt[]
  closed?: boolean
  c?: Pt
  rx?: number
  ry?: number
  /** Dot radius multiplier. */
  w: number
}

const R = 0.84 // face radius

const rad = (deg: number) => (deg * Math.PI) / 180
function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 48): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / n)
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry])
  }
  return pts
}
const line = (part: Part, pts: Pt[], w = 1): Feature => ({ part, kind: 'line', pts, w })

const fill = (part: Part, c: Pt, rx: number, ry: number, w = 1): Feature => ({ part, kind: 'fill', c, rx, ry, w })

const FACE: Feature = { part: 'face', kind: 'line', pts: arc(0, 0, R, R, -90, 270, 96), closed: true, w: 1.15 }

/** € as an eye: a C opening right, crossed by two bars. */
function euro(part: Part, cx: number, cy: number, s: number): Feature[] {
  return [
    line(part, arc(cx, cy, s, s * 1.08, 45, 315, 36), 1.05),
    line(
      part,
      [
        [cx - s * 1.45, cy - s * 0.24],
        [cx + s * 0.35, cy - s * 0.24],
      ],
      1.05
    ),
    line(
      part,
      [
        [cx - s * 1.45, cy + s * 0.26],
        [cx + s * 0.25, cy + s * 0.26],
      ],
      1.05
    ),
  ]
}

// y-down: angles 0..180 sweep the lower half (a smile), 180..360 the upper (a frown).
const FACES: Record<AnkraEmoji, Feature[]> = {
  happy: [
    FACE,
    fill('eyeL', [-0.3, -0.2], 0.075, 0.12),
    fill('eyeR', [0.3, -0.2], 0.075, 0.12),
    line('mouth', arc(0, 0.04, 0.5, 0.46, 22, 158), 1.1),
  ],
  sad: [
    FACE,
    fill('eyeL', [-0.3, -0.14], 0.07, 0.1),
    fill('eyeR', [0.3, -0.14], 0.07, 0.1),
    line('browL', [
      [-0.46, -0.3],
      [-0.18, -0.42],
    ]),
    line('browR', [
      [0.46, -0.3],
      [0.18, -0.42],
    ]),
    line('mouth', arc(0, 0.74, 0.4, 0.34, 205, 335), 1.1),
    fill('tear', [-0.33, 0.04], 0.045, 0.065, 1.1),
  ],
  confused: [
    FACE,
    fill('eyeL', [-0.3, -0.16], 0.065, 0.1),
    fill('eyeR', [0.3, -0.2], 0.085, 0.13),
    line('browL', [
      [-0.44, -0.33],
      [-0.17, -0.3],
    ]),
    line('browR', arc(0.3, -0.3, 0.17, 0.12, 200, 340, 20)),
    line(
      'mouth',
      Array.from({ length: 33 }, (_, i): Pt => {
        const x = -0.32 + (0.64 * i) / 32
        return [x, 0.38 + 0.06 * x + 0.05 * Math.sin(x * 15)]
      }),
      1.1
    ),
  ],
  wink: [
    FACE,
    fill('eyeL', [-0.3, -0.2], 0.075, 0.12),
    // open: an oval like the other eye; shut: a curve bowed upward
    {
      part: 'eyeR',
      kind: 'wink',
      c: [0.3, -0.2],
      rx: 0.075,
      ry: 0.12,
      pts: arc(0.3, -0.11, 0.14, 0.1, 200, 340, 20),
      w: 1,
    },
    // a lopsided smile, higher on the winking side
    line('mouth', arc(0.03, 0.02, 0.48, 0.44, 24, 152), 1.1),
  ],
  euro: [
    FACE,
    ...euro('eyeL', -0.3, -0.2, 0.14),
    ...euro('eyeR', 0.34, -0.2, 0.14),
    // a wide open grin: an arc closed by a straight top lip
    line('mouth', arc(0, 0.12, 0.5, 0.42, 12, 168), 1.1),
    line(
      'mouth',
      [
        [-0.49, 0.22],
        [0.49, 0.22],
      ],
      1.1
    ),
  ],
}

interface EmojiDot {
  x: number
  y: number
  part: Part
  w: number
  /** Centre of the feature the dot belongs to (for scaling eyes about themselves). */
  cx: number
  cy: number
  /** Where a winking eye's dot sits, and how big it is, when the eye is shut. */
  shut?: { x: number; y: number; w: number }
}

interface EmojiSample {
  dots: EmojiDot[]
  scale: number
  r: number
}

const cache = new Map<string, EmojiSample>()

/** Lay each feature out as dots, spaced for the rendered size. Cached per (emoji, size). */
function sampleEmoji(emoji: AnkraEmoji, size: number): EmojiSample {
  const key = `${emoji}|${Math.round(size)}`
  const hit = cache.get(key)
  if (hit) return hit

  const scale = size * scaleFor(size)
  const pitchPx = Math.max(2.4, size * 0.034)
  const pitch = pitchPx / scale
  const r = Math.max(0.75, pitchPx * 0.36)
  const dots: EmojiDot[] = []

  for (const f of FACES[emoji]) {
    if (f.kind === 'wink' && f.c && f.rx && f.ry && f.pts) {
      // one dot per position along the shut curve; open, the same dots stack
      // into the oval's column, each as wide as the oval
      let arcLen = 0
      for (let i = 0; i < f.pts.length - 1; i++) {
        arcLen += Math.hypot(f.pts[i + 1][0] - f.pts[i][0], f.pts[i + 1][1] - f.pts[i][1])
      }
      const n = Math.max(3, Math.round(arcLen / pitch) + 1)
      const len = Math.max(0, f.ry - f.rx) * 2
      const wOpen = f.w * Math.max(1.4, (f.rx * scale) / r)
      for (let k = 0; k < n; k++) {
        const u = k / (n - 1)
        const p = f.pts[Math.round(u * (f.pts.length - 1))]
        dots.push({
          x: f.c[0],
          y: f.c[1] - len / 2 + len * u,
          part: f.part,
          w: wOpen,
          cx: f.c[0],
          cy: f.c[1],
          shut: { x: p[0], y: p[1], w: f.w * 1.05 },
        })
      }
      continue
    }
    const out: Pt[] = []
    if (f.kind === 'line' && f.pts) {
      const pts = f.closed ? [...f.pts, f.pts[0]] : f.pts
      let total = 0
      for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
      // even spacing that lands exactly on both ends (or wraps cleanly when closed)
      const n = Math.max(2, Math.round(total / pitch) + (f.closed ? 0 : 1))
      const step = total / (f.closed ? n : n - 1)
      let seg = 0
      let acc = 0
      for (let k = 0; k < n; k++) {
        const target = k * step
        while (seg < pts.length - 2) {
          const l = Math.hypot(pts[seg + 1][0] - pts[seg][0], pts[seg + 1][1] - pts[seg][1])
          if (acc + l >= target) break
          acc += l
          seg++
        }
        const [ax, ay] = pts[seg]
        const [bx, by] = pts[seg + 1]
        const l = Math.hypot(bx - ax, by - ay) || 1
        const u = Math.min(1, Math.max(0, (target - acc) / l))
        out.push([ax + (bx - ax) * u, ay + (by - ay) * u])
      }
    } else if (f.c && f.rx && f.ry) {
      // a solid oval: a short column of overlapping dots, each as wide as the
      // oval, so it reads as one filled shape rather than a scatter
      const len = Math.max(0, f.ry - f.rx) * 2
      const n = Math.max(1, Math.round(len / (f.rx * 0.5)) + 1)
      for (let k = 0; k < n; k++) out.push([f.c[0], f.c[1] - len / 2 + (n === 1 ? len / 2 : (len * k) / (n - 1))])
    }
    let cx = 0
    let cy = 0
    for (const [x, y] of out) {
      cx += x
      cy += y
    }
    cx /= out.length
    cy /= out.length
    // filled dots are as wide as the oval (never thinner than a heavy stroke dot)
    const w = f.kind === 'fill' && f.rx ? f.w * Math.max(1.4, (f.rx * scale) / r) : f.w
    for (const [x, y] of out) dots.push({ x, y, part: f.part, w, cx, cy })
  }

  const sample = { dots, scale, r }
  cache.set(key, sample)
  return sample
}

/** 0 = open, 1 = shut: a quick close, a held wink, a slower reopen, every 3.6s. */
function winkAmount(t: number): number {
  const u = t % 3.6
  if (u < 0.8) return 0
  if (u < 0.92) return easeOut((u - 0.8) / 0.12)
  if (u < 1.45) return 1
  if (u < 1.65) return 1 - ease((u - 1.45) / 0.2)
  return 0
}

/**
 * One instant of an emoji face, in `size` px, dots in a stable order.
 * Pointer lens and ripples are included, as for the mark.
 */
export function emojiDots(emoji: AnkraEmoji, size: number, t: number, input: AnkraInput, ink: Ink): Dot[] {
  const em = sampleEmoji(emoji, size)
  const c = size / 2
  const h = input.hover
  const amp = size < 40 ? 0.55 : 1
  const depthInk = size < 40 ? 0.1 : 0.2

  const breath = 0.5 - 0.5 * Math.cos((TAU * t) / 6)
  let yaw = 0.22 * amp * Math.sin((TAU * t) / 11)
  let tilt = (0.1 + 0.08 * Math.sin((TAU * t) / 15 + 0.7)) * amp
  yaw = yaw * (1 - h) + input.yaw * h
  tilt = tilt * (1 - h) + input.tilt * h
  const proj = makeProj(yaw, tilt, c, c, em.scale * (1 + 0.012 * breath + 0.02 * h))

  // expression beats
  const bounce = emoji === 'happy' ? -0.03 * Math.abs(Math.sin((Math.PI * t) / 1.1)) : 0
  const shut = emoji === 'wink' ? winkAmount(t) : 0
  // confused wobbles; the wink comes with a small knowing tilt of the head
  const roll = emoji === 'confused' ? 0.13 * Math.sin((TAU * t) / 3.4) : -0.07 * shut
  const tearU = (t % 2.6) / 2.6
  const kaching = emoji === 'euro' ? Math.pow(Math.max(0, Math.sin((TAU * t) / 1.8)), 8) : 0
  const cr = Math.cos(roll)
  const sr = Math.sin(roll)

  const dots: Dot[] = []
  for (const d of em.dots) {
    let x = d.x
    let y = d.y + bounce
    let w = d.w
    let a = 1
    let lift = 0

    if (emoji === 'happy' && d.part === 'mouth') {
      x *= 1 + 0.05 * Math.abs(Math.sin((Math.PI * t) / 1.1))
    } else if (emoji === 'sad' && d.part === 'tear') {
      // the tear rolls down the cheek, thins and fades, then wells up again
      y += 0.42 * ease(tearU)
      w *= 1 - 0.35 * tearU
      a = tearU < 0.08 ? tearU / 0.08 : tearU > 0.78 ? Math.max(0, (1 - tearU) / 0.22) : 1
    } else if (emoji === 'confused' && d.part === 'mouth') {
      y += 0.025 * Math.sin(d.x * 12 - t * 4)
    } else if (emoji === 'wink') {
      if (d.shut) {
        x += (d.shut.x - x) * shut
        y += (d.shut.y - y) * shut
        w += (d.shut.w - w) * shut
      } else if (d.part === 'mouth' && d.x > 0) {
        // the cheek on the winking side pushes that end of the smile up
        y -= 0.05 * shut * (d.x / 0.5)
      }
    } else if (emoji === 'euro' && (d.part === 'eyeL' || d.part === 'eyeR')) {
      // ka-ching: the € eyes pop and flare
      const s = 1 + 0.16 * kaching
      x = d.cx + (x - d.cx) * s
      y = d.cy + bounce + (y - d.cy - bounce) * s
      lift = 0.6 * kaching
    }

    if (roll) {
      const rx = x * cr - y * sr
      y = x * sr + y * cr
      x = rx
    }
    // a gently domed face, so the sway reads in depth
    const z = 0.16 * Math.max(0, 1 - (x * x + y * y) / (R * R)) + (d.part === 'face' ? 0 : 0.02)

    const [sx, sy, sz] = proj(x, -y, z)
    const zf = Math.max(-1, Math.min(1, sz / 0.45))
    const [ox, oy, pl] = pointerField(sx, sy, input, size)
    lift += pl
    const r = em.r * w * (0.96 + 0.06 * breath) * (1 + 0.22 * zf + 0.32 * lift)
    dots.push({
      x: sx + ox,
      y: sy + oy,
      z: sz,
      r,
      a: r < 0.2 ? 0 : a,
      white: Math.max(0.02, Math.min(0.92, ink.base - depthInk * ink.depth * zf - ink.lift * lift)),
    })
  }
  return dots
}
