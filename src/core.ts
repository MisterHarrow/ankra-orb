// Shared by every Ankra geometry: the host input contract, theme-aware
// ink, easing, and the pointer lens / tap ripple field.

export interface AnkraRipple {
  x: number
  y: number
  age: number
}

/** Live input from the host: pointer, eased hover and the intro clock. */
export interface AnkraInput {
  /** Eased 0..1 hover amount. */
  hover: number
  /** Smoothed pointer position in CSS px inside the canvas. */
  px: number
  py: number
  /** Pointer-driven view, blended in by `hover`. */
  yaw: number
  tilt: number
  ripples: AnkraRipple[]
  /** Seconds since mount when the orb → mark intro should play, else null. */
  introAge: number | null
  /**
   * The substrate the frame will be painted on. Light paper gets its own,
   * heavier ink ramp so the mark never reads washed out. @default true
   */
  dark?: boolean
}

export const STILL: AnkraInput = { hover: 0, px: 0, py: 0, yaw: 0, tilt: 0, ripples: [], introAge: null }

// Ink values are paper-convention (0 = full ink); thinking-orbs mirrors them
// on dark substrates. Dark paper keeps a wide depth ramp; light paper sits
// much nearer full ink, with a shallower ramp, so depth never fades the mark.
export const INK = {
  dark: { base: 0.34, depth: 1, glow: 0.16, lift: 0.16, dim: 1 },
  light: { base: 0.12, depth: 0.6, glow: 0.1, lift: 0.1, dim: 0.85 },
}
export type Ink = (typeof INK)['dark']

export const RIPPLE_LIFE = 3.2

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
export const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3)

/** Screen-space pointer lens and tap ripples: displacement plus a 0..n lift. */
export function pointerField(sx: number, sy: number, input: AnkraInput, size: number): [number, number, number] {
  let ox = 0
  let oy = 0
  let lift = 0
  const h = input.hover
  if (h > 0.001) {
    const sigma = size * 0.12
    const dx = sx - input.px
    const dy = sy - input.py
    const dist = Math.hypot(dx, dy) || 1
    const g = Math.exp(-(dist * dist) / (2 * sigma * sigma)) * h
    // a lens, not a hole: no push at the centre, most at one sigma
    const push = g * Math.min(1, dist / sigma) * size * 0.022
    ox += (dx / dist) * push
    oy += (dy / dist) * push
    lift += g
  }
  for (const r of input.ripples) {
    const R = r.age * size * 0.32
    const dx = sx - r.x
    const dy = sy - r.y
    const dist = Math.hypot(dx, dy) || 1
    const ring = Math.exp(-Math.pow((dist - R) / (size * 0.045), 2)) * Math.pow(1 - r.age / RIPPLE_LIFE, 2)
    const fade = Math.min(1, dist / (size * 0.04))
    ox += (dx / dist) * ring * fade * size * 0.01
    oy += (dy / dist) * ring * fade * size * 0.01
    lift += ring * 0.6
  }
  return [ox, oy, lift]
}
