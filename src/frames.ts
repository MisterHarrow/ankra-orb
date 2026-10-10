// Ankra states as thinking-orbs geometry. `ankraFrame` honours the
// library's ModeFrame contract: given a size and a time it returns a
// finished, z-sorted list of dots with ink values, so <ThinkingOrb frame>
// can paint it with its own painter, theme and tint. The depth language is
// the library's too: projected through `makeProj`, near dots larger and
// heavier, far dots finer and lighter.

import { MODE_FRAMES, angleDelta, finalizeFrame, makeProj, resolvePreset, scaleCounts, scaleRadii } from 'thinking-orbs'
import type { Dot, Line, OrbFrame, OrbState } from 'thinking-orbs'

import { INK, STILL, clamp01, ease, easeOut, pointerField } from './core'
import type { AnkraInput, Ink } from './core'
import { emojiDots } from './emoji'
import type { AnkraEmoji } from './emoji'
import { PIECE_DIR, TAU, rotate, sampleMark } from './geometry'

export { STILL, RIPPLE_LIFE } from './core'
export type { AnkraInput, AnkraRipple } from './core'

/**
 * - `idle`      the mark breathing, its three pieces floating on separate planes
 * - `working`   the pieces turn a third around the centre and lock back in place
 * - `working-2` the mark breathes in to a single point, glows there, and breathes back out
 * - `thinking`  the mark dissolves into a dotted orb, turns, and reforms
 * - `searching` a scan band sweeps the mark, lifting what it passes
 */
export type AnkraBaseState = 'idle' | 'working' | 'working-2' | 'thinking' | 'searching'

/**
 * `from-<stock state>`: the real thinking-orbs animation plays, then its
 * dots stream into the Ankra mark, hold, and stream back out into the orb.
 * Works for every stock state, e.g. `from-searching`, `from-weaving`.
 */
export type AnkraMorphState = `from-${OrbState}`

/**
 * `emoji-<expression>`: a dotted emoji face streams into the Ankra mark and
 * back. `happy` bounces, `sad` cries a tear, `confused` wobbles, `wink`
 * winks, `euro` has € eyes that ka-ching.
 */
export type AnkraEmojiState = `emoji-${AnkraEmoji}`

export type AnkraState = AnkraBaseState | AnkraMorphState | AnkraEmojiState

export type { AnkraEmoji } from './emoji'

export const isEmojiState = (state: AnkraState): state is AnkraEmojiState => state.startsWith('emoji-')
/** Any state that hands off between another shape and the mark. */
export const isMorphState = (state: AnkraState): state is AnkraMorphState | AnkraEmojiState =>
  state.startsWith('from-') || isEmojiState(state)

// working-2 breath: hold open, breathe in to a point, glow, breathe out.
const PULSE = 2.6
const POINT = 0.015

function pulseScale(tc: number): number {
  if (tc < 0.3) return 1
  if (tc < 1.1) return 1 - ease((tc - 0.3) / 0.8) * (1 - POINT)
  if (tc < 1.4) return POINT
  if (tc < 2.3) return POINT + ease((tc - 1.4) / 0.9) * (1 - POINT)
  return 1
}

/** The same field applied to a dot that has no lift term of its own (stock orb dots). */
function lensDot(d: Dot, input: AnkraInput, size: number, ink: Ink, weight: number): void {
  if (weight <= 0 || (input.hover <= 0.001 && input.ripples.length === 0)) return
  const [ox, oy, lift] = pointerField(d.x, d.y, input, size)
  d.x += ox * weight
  d.y += oy * weight
  d.r *= 1 + 0.32 * lift * weight
  d.white -= ink.lift * lift * weight
}

/**
 * The mark's dots for one instant, in sample order (index i is always the
 * same dot), in `size` px. Dots too small to draw come back with `a: 0`
 * rather than being dropped, so the order stays stable.
 */
function markDots(state: AnkraBaseState, size: number, t: number, input: AnkraInput, ink: Ink): Dot[] {
  const mark = sampleMark(size)
  const c = size / 2
  const h = input.hover

  let yaw = 0
  let tilt = 0
  let scaleMul = 1
  let rMul = 1
  // small marks: gentler sway and a shallower ink ramp keep them legible
  const amp = size < 40 ? 0.55 : 1
  const depthInk = size < 40 ? 0.1 : 0.2

  if (state === 'idle') {
    const breath = 0.5 - 0.5 * Math.cos((TAU * t) / 10)
    scaleMul = 1 + 0.018 * breath
    rMul = 0.93 + 0.11 * breath
    yaw = 0.3 * amp * Math.sin((TAU * t) / 26)
    tilt = (0.08 + 0.12 * Math.sin((TAU * t) / 37 + 1.1)) * amp
  } else if (state === 'working') {
    yaw = 0.16 * amp * Math.sin((TAU * t) / 7)
    tilt = 0.34 * amp
  } else if (state === 'working-2') {
    yaw = 0.14 * amp * Math.sin((TAU * t) / 9)
    tilt = 0.22 * amp
  } else if (state === 'thinking') {
    yaw = 0.22 * amp * Math.sin((TAU * t) / 12)
    tilt = 0.22 * amp
  } else {
    yaw = 0.22 * amp * Math.sin((TAU * t) / 3.2)
    tilt = 0.12 * amp
  }
  yaw = yaw * (1 - h) + input.yaw * h
  tilt = tilt * (1 - h) + input.tilt * h
  scaleMul *= 1 + 0.02 * h

  const proj = makeProj(yaw, tilt, c, c, mark.scale * scaleMul)
  const scan = (TAU * t) / 18
  const workT = t % 2.4
  const pulseT = t % PULSE
  const inhale = pulseScale(pulseT)
  // only lights up once it has nearly reached the point
  const lit = Math.pow(1 - inhale, 4)
  const thinkT = t % 6
  const band = 0.95 * Math.sin((TAU * t) / 3.2)
  const intro = input.introAge
  const dots: Dot[] = []

  for (const d of mark.dots) {
    let x = d.x
    let y = d.y
    let z = 0
    let cover = d.cover
    let lift = 0
    let glow = 0
    let dim = 0
    let rDot = 1

    if (state === 'idle') {
      z = 0.045 * Math.sin((TAU * t) / 14 + (d.k * TAU) / 3) + 0.018 * Math.sin(d.x * 3.1 - d.y * 2.3 + t * 0.5 + d.k)
      glow = Math.exp(-Math.pow(angleDelta(d.ang, scan) / 0.55, 2)) * 0.6
      rDot += 0.04 * Math.sin(t * 0.9 + d.phase)
    } else if (state === 'working') {
      const u = ease(clamp01((workT - 0.25 - 0.14 * d.k) / 1.25))
      const arc = Math.sin(Math.PI * u)
      ;[x, y] = rotate([x * (1 + 0.06 * arc), y * (1 + 0.06 * arc)], (u * TAU) / 3)
      z = 0.2 * arc
      lift = 0.45 * arc
    } else if (state === 'working-2') {
      x *= inhale
      y *= inhale
      lift = 0.6 * lit
      // dots shrink with the mark so it stays a dotted drawing on the way in,
      // then the gathered point swells a little as it lights
      rDot = Math.sqrt(Math.max(inhale, 0.4)) * (1 + 1.4 * lit)
    } else if (state === 'thinking') {
      let m = 0
      if (thinkT >= 4.4) m = 1 - ease(clamp01((thinkT - 4.4 - d.stag) / 1.1))
      else if (thinkT >= 3) m = 1
      else if (thinkT >= 1.4) m = ease(clamp01((thinkT - 1.4 - d.stag) / 1.1))
      if (m > 0) {
        const spin = t * 0.7
        const ox = d.ox * Math.cos(spin) + d.oz * Math.sin(spin)
        const oz = -d.ox * Math.sin(spin) + d.oz * Math.cos(spin)
        const swirl = Math.sin(Math.PI * m) * 0.18 * (Math.sin(d.phase) - 0.2)
        x += (ox - x) * m
        y += (d.oy - y) * m
        z += (oz - z) * m + swirl
        cover += (1 - cover) * m
      }
    } else {
      const b = Math.exp(-Math.pow((d.x - band) / 0.17, 2))
      z = 0.14 * b
      lift = 0.6 * b
      dim = 0.26 * ink.dim * (1 - b)
      rDot = 0.86 + 0.28 * b
    }

    if (h > 0) {
      x += PIECE_DIR[d.k][0] * 0.06 * h
      y += PIECE_DIR[d.k][1] * 0.06 * h
      z += (d.k - 1) * 0.07 * h
    }

    if (intro !== null) {
      const p = clamp01((intro - d.delay) / 2)
      if (p < 1) {
        const e = ease(p)
        const spin = intro * 0.5
        const ox = d.ox * Math.cos(spin) + d.oz * Math.sin(spin)
        const oz = -d.ox * Math.sin(spin) + d.oz * Math.cos(spin)
        x = ox + (x - ox) * e
        y = d.oy + (y - d.oy) * e
        z = oz + (z - oz) * e
        cover = 0.55 + (cover - 0.55) * p
      }
    }

    // makeProj is y-up; the mark is y-down.
    const [x2, y2, sz] = proj(x, -y, z)
    const zf = Math.max(-1, Math.min(1, sz / 0.45))
    const [ox, oy, pl] = pointerField(x2, y2, input, size)
    lift += pl

    const rad = mark.r * rMul * rDot * cover * (1 + 0.22 * zf + 0.08 * glow + 0.32 * lift)
    dots.push({
      x: x2 + ox,
      y: y2 + oy,
      z: sz,
      r: rad,
      a: rad < 0.2 ? 0 : 1,
      white: Math.max(
        0.02,
        Math.min(0.92, ink.base - depthInk * ink.depth * zf - ink.glow * glow - ink.lift * lift + dim)
      ),
    })
  }
  return dots
}

// ---- stock orb → mark ----------------------------------------------------

/**
 * A real thinking-orbs frame for `stock` at mark-time `t`, in `size` px.
 * Uses the library's own preset (speed, counts, radii) for the nearest tuned
 * size; above 64 px the 64 tuning is scaled up with denser counts and
 * sub-linear radii, the same way the library sizes its own presets.
 */
function stockFrame(stock: OrbState, size: number, t: number): { dots: Dot[]; lines: Line[] } {
  const preset = size <= 20 ? 20 : size <= 32 ? 32 : 64
  const { mode, speed, opts: base } = resolvePreset(stock, preset)
  const f = size / preset
  let opts = base
  // denser, not proportionally: the stock tunings read best a little sparse
  if (f > 1) opts = scaleRadii(scaleCounts(base, Math.min(2.5, Math.sqrt(f))), Math.pow(f, -0.45))
  const frame = MODE_FRAMES[mode](preset, t * speed, opts)
  return {
    dots: frame.dots.map((d) => ({ x: d.x * f, y: d.y * f, z: d.z, r: d.r * f, white: d.white, a: d.a })),
    lines: frame.lines.map((l) => ({ ...l, x1: l.x1 * f, y1: l.y1 * f, x2: l.x2 * f, y2: l.y2 * f, w: l.w * f })),
  }
}

interface Snapshot {
  dots: Dot[]
  lines: Line[]
}
const snapshots = new Map<string, Snapshot>()

type SourceState = AnkraMorphState | AnkraEmojiState

/** The shape a morph state hands off with: a live stock orb or an emoji face. */
function sourceFrame(
  state: SourceState,
  size: number,
  t: number,
  input: AnkraInput,
  ink: Ink,
  pointer: boolean
): { dots: Dot[]; lines: Line[] } {
  if (isEmojiState(state)) {
    const face = emojiDots(state.slice(6) as AnkraEmoji, size, t, pointer ? input : { ...STILL, dark: input.dark }, ink)
    return { dots: face, lines: [] }
  }
  const live = stockFrame(state.slice(5) as OrbState, size, t)
  if (pointer) for (const d of live.dots) lensDot(d, input, size, ink, 1)
  return live
}

/** The source shape at one fixed instant, its dots ordered by angle (a sweep). Cached. */
function sourceSnapshot(state: SourceState, size: number, t: number, input: AnkraInput, ink: Ink): Snapshot {
  const key = `${state}|${size}|${t.toFixed(3)}|${input.dark === false ? 'light' : 'dark'}`
  const hit = snapshots.get(key)
  if (hit) return hit
  const { dots, lines } = sourceFrame(state, size, t, input, ink, false)
  const c = size / 2
  const visible = dots.filter((d) => (d.a ?? 1) >= 0.02)
  const ang = (d: Dot) => Math.atan2(d.y - c, d.x - c)
  visible.sort((a, b) => ang(a) - ang(b))
  const snap = { dots: visible, lines }
  if (snapshots.size > 24) snapshots.clear()
  snapshots.set(key, snap)
  return snap
}

// Timeline, in mark seconds: stock orb → stream in → mark → stream out → stock orb.
const M_STOCK = 2
const M_IN = 1.3
const M_MARK = 2
const M_OUT = 1.3
const M_TAIL = 0.6
const M_PERIOD = M_STOCK + M_IN + M_MARK + M_OUT + M_TAIL

function morphDots(
  state: SourceState,
  size: number,
  t: number,
  input: AnkraInput,
  ink: Ink
): { dots: Dot[]; lines: Line[] } {
  const tc = ((t % M_PERIOD) + M_PERIOD) % M_PERIOD
  const cycle = t - tc
  const inStart = M_STOCK
  const markStart = inStart + M_IN
  const outStart = markStart + M_MARK
  const outEnd = outStart + M_OUT

  if (tc < inStart || tc >= outEnd) return sourceFrame(state, size, t, input, ink, true)
  if (tc >= markStart && tc < outStart) return { dots: markDots('idle', size, t, input, ink), lines: [] }

  // Hand-off. Pair the orb's dots with the mark's, both walked around the
  // centre in angular order; when counts differ, dots split or merge.
  // Streaming in, every dot leaves the orb at once (from exactly where the
  // live orb was) and they land in a sweep. Streaming out, they leave the
  // mark in a sweep and all land together exactly where the live orb resumes.
  const streamingIn = tc < markStart
  const snap = sourceSnapshot(state, size, cycle + (streamingIn ? inStart : outEnd), input, ink)
  const mark = sampleMark(size)
  const A = markDots('idle', size, t, input, ink)
  const S = snap.dots
  if (S.length === 0) return { dots: A, lines: [] }
  const nS = S.length
  const nA = A.length
  const n = Math.max(nS, nA)
  const local = streamingIn ? tc - inStart : tc - outStart
  const dots: Dot[] = []

  for (let i = 0; i < n; i++) {
    const rank = i / n
    const s = S[Math.floor((i * nS) / n)]
    const a = A[mark.byAngle[Math.floor((i * nA) / n)]]
    let e: number
    if (streamingIn) {
      e = easeOut(clamp01(local / (M_IN * (0.62 + 0.38 * rank))))
    } else {
      const start = M_OUT * 0.38 * rank
      e = 1 - ease(clamp01((local - start) / (M_OUT - start)))
    }
    // e: 0 = orb, 1 = mark. A gentle arc so streams curve rather than slide.
    const dx = a.x - s.x
    const dy = a.y - s.y
    const len = Math.hypot(dx, dy) || 1
    const bend = Math.sin(Math.PI * e) * len * 0.36 * (((i * 0.618034) % 1) - 0.5)
    const d: Dot = {
      x: s.x + dx * e - (dy / len) * bend,
      y: s.y + dy * e + (dx / len) * bend,
      z: s.z + (a.z - s.z) * e,
      r: s.r + (a.r - s.r) * e,
      white: s.white + (a.white - s.white) * e,
      a: (s.a ?? 1) + ((a.a ?? 1) - (s.a ?? 1)) * e,
    }
    // the mark's dots already carry the pointer; the orb's share gets it here
    lensDot(d, input, size, ink, 1 - e)
    dots.push(d)
  }

  const lineAlpha = streamingIn ? 1 - clamp01(local / 0.3) : clamp01((local - (M_OUT - 0.3)) / 0.3)
  const lines = lineAlpha > 0 ? snap.lines.map((l) => ({ ...l, a: (l.a ?? 1) * lineAlpha })) : []
  return { dots, lines }
}

/**
 * One instant of an Ankra state.
 *
 * @param size    the size the mark is designed for (CSS px) — sets dot density
 * @param t       seconds on the shared clock
 * @param input   pointer / intro state (defaults to a still, untouched mark)
 * @param outSize the canvas size to emit coordinates in; defaults to `size`
 */
export function ankraFrame(
  state: AnkraState,
  size: number,
  t: number,
  input: AnkraInput = STILL,
  outSize: number = size
): OrbFrame {
  const ink = input.dark === false ? INK.light : INK.dark
  const { dots, lines } = isMorphState(state)
    ? morphDots(state, size, t, input, ink)
    : { dots: markDots(state, size, t, input, ink), lines: [] as Line[] }

  const k = outSize / size
  if (k !== 1) {
    for (const d of dots) {
      d.x *= k
      d.y *= k
      d.r *= k
    }
    for (const l of lines) {
      l.x1 *= k
      l.y1 *= k
      l.x2 *= k
      l.y2 *= k
      l.w *= k
    }
  }
  return finalizeFrame(dots, lines, 0.3 * k)
}
