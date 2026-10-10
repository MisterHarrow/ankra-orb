'use client'

// <AnkraOrb> — the Ankra mark as a thinking orb.
//
// Up to 64 px it IS a <ThinkingOrb>: the mark is handed to the library
// through its `frame` escape hatch, so painting, theme detection, tint,
// pause, offscreen and reduced-motion handling are all thinking-orbs'.
// Above 64 px (the library's largest tuned canvas) the same geometry is
// painted by a small canvas loop that mirrors those behaviours.

import { ThinkingOrb, resolvePreset } from 'thinking-orbs'
import type { ModeFrame, OrbFrame, OrbTheme } from 'thinking-orbs'
import type { CSSProperties, CanvasHTMLAttributes, PointerEvent as ReactPointerEvent } from 'react'
import { createElement, useEffect, useMemo, useRef, useState } from 'react'

import { RIPPLE_LIFE, ankraFrame, isEmojiState, isMorphState } from './frames'
import type { AnkraBaseState, AnkraInput, AnkraState } from './frames'

export interface AnkraOrbProps extends Omit<CanvasHTMLAttributes<HTMLCanvasElement>, 'style' | 'color'> {
  /** Which animation to show. @default 'idle' */
  state?: AnkraState
  /** Rendered size in CSS px; dot density is tuned to it. @default 64 */
  size?: number
  /** Theme mode; `auto` follows `.dark`/`data-theme` ancestors, then the OS. @default 'auto' */
  theme?: OrbTheme
  /** Ink tint: any CSS color, including `currentColor`. Omit for grayscale ink. */
  color?: string
  /** Speed multiplier. @default 1 */
  speed?: number
  /** Freeze on the current frame. @default false */
  paused?: boolean
  /** React to hover (tilt, lift, pieces drift apart) and taps (ripple). @default size >= 40 */
  interactive?: boolean
  /** Play the orb → mark settle once on mount. @default false */
  intro?: boolean
  /**
   * Run this instance on its own clock, starting this many seconds into the
   * state's cycle when it mounts, instead of the shared clock that keeps all
   * orbs in phase. Use it to begin a state at a chosen moment, e.g. on the
   * mark, for a showreel. Remount (change `key`) to restart.
   */
  startAt?: number
  style?: CSSProperties
}

const LABELS: Record<AnkraBaseState, string> = {
  idle: 'Ankra',
  working: 'Working…',
  'working-2': 'Working…',
  thinking: 'Thinking…',
  searching: 'Searching…',
}
const EMOJI_LABELS: Record<string, string> = {
  happy: 'Happy',
  sad: 'Sad',
  confused: 'Confused',
  wink: 'Winking',
  euro: 'Euro eyes',
}
const labelFor = (state: AnkraState) =>
  isEmojiState(state) ? EMOJI_LABELS[state.slice(6)] : isMorphState(state) ? 'Thinking…' : LABELS[state]

// Reduced motion gets one still frame; for the stock → mark states that
// frame should be the mark, not whichever orb happens to be on screen.
// Emoji keep their face: the expression is the content.
const stillState = (state: AnkraState): AnkraState =>
  isMorphState(state) && !isEmojiState(state) && prefersReducedMotion() ? 'idle' : state

// Any proxy state works: the library only uses it to pick a baked speed,
// which AnkraOrb divides back out so `speed` means real seconds.
const PROXY_STATE = 'breathing'
const LIB_SIZES = [20, 32, 64] as const

interface Live {
  over: boolean
  x: number
  y: number
  nx: number
  ny: number
  hover: number
  px: number
  py: number
  yaw: number
  tilt: number
  ripples: { x: number; y: number; t0: number }[]
  last: number
  mount: number
}

const now = () => (typeof performance !== 'undefined' ? performance.now() / 1000 : 0)

function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Seconds on an instance's own clock: `startAt` at mount, then real time (frozen under reduced motion). */
function ownClock(live: Live, startAt: number, speed: number): number {
  return prefersReducedMotion() ? startAt : (now() - live.mount) * speed + startAt
}

/** Advance the eased pointer state by wall-clock time and build the frame input. */
function step(live: Live, interactive: boolean, intro: boolean, dark: boolean): AnkraInput {
  const t = now()
  const dt = Math.min(0.05, live.last ? t - live.last : 0.016)
  live.last = t
  const target = interactive && live.over ? 1 : 0
  live.hover += (target - live.hover) * (1 - Math.exp(-dt / (target ? 0.55 : 1.3)))
  const kp = 1 - Math.exp(-dt / 0.18)
  live.px += (live.x - live.px) * kp
  live.py += (live.y - live.py) * kp
  const kv = 1 - Math.exp(-dt / 0.7)
  live.yaw += (live.nx * 0.5 - live.yaw) * kv
  live.tilt += (-live.ny * 0.38 - live.tilt) * kv
  live.ripples = live.ripples.filter((r) => t - r.t0 < RIPPLE_LIFE)
  const introAge = intro && !prefersReducedMotion() ? t - live.mount : null
  return {
    hover: live.hover,
    px: live.px,
    py: live.py,
    yaw: live.yaw,
    tilt: live.tilt,
    ripples: live.ripples.map((r) => ({ x: r.x, y: r.y, age: t - r.t0 })),
    introAge: introAge !== null && introAge < 4 ? introAge : null,
    dark,
  }
}

/** Normalise any CSS color (named, hsl, currentColor…) to the `rgb()` form the painter accepts. */
function useResolvedColor(color: string | undefined, ref: { current: Element | null }) {
  const [resolved, setResolved] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (!color) {
      setResolved(undefined)
      return
    }
    const el = ref.current
    if (!el || typeof getComputedStyle === 'undefined') return
    const probe = document.createElement('span')
    const resolve = () => {
      probe.style.color = color
      probe.style.display = 'none'
      el.appendChild(probe)
      const value = getComputedStyle(probe).color
      probe.remove()
      setResolved(value || undefined)
    }
    resolve()
    const mo = new MutationObserver(resolve)
    // theme switches can land on any ancestor (html, body, an app shell)
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
      subtree: true,
    })
    return () => mo.disconnect()
  }, [color, ref])
  return resolved
}

function useResolvedDark(theme: OrbTheme, ref: { current: Element | null }) {
  const [dark, setDark] = useState(true)
  useEffect(() => {
    if (theme !== 'auto') {
      setDark(theme === 'dark')
      return
    }
    const resolve = () => {
      let node: Element | null = ref.current
      while (node) {
        const attr = node.getAttribute('data-theme')
        if (attr === 'dark' || node.classList.contains('dark')) return setDark(true)
        if (attr === 'light' || node.classList.contains('light')) return setDark(false)
        node = node.parentElement
      }
      setDark(typeof matchMedia === 'undefined' || matchMedia('(prefers-color-scheme: dark)').matches)
    }
    resolve()
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', resolve)
    const mo = new MutationObserver(resolve)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'], subtree: true })
    return () => {
      mq.removeEventListener('change', resolve)
      mo.disconnect()
    }
  }, [theme, ref])
  return dark
}

function parseRgb(color: string | undefined) {
  const m = color?.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i)
  return m ? { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) } : undefined
}

/** Same ink ramp as thinking-orbs' painter, so large and small marks match. */
function paintLarge(
  ctx: CanvasRenderingContext2D,
  frame: OrbFrame,
  dark: boolean,
  tint?: { r: number; g: number; b: number }
) {
  for (const d of frame.dots) {
    const w = Math.min(1, Math.max(0, d.white))
    if (tint) {
      const ramp = (c: number) => Math.round(dark ? c * (1 - w) : c + (255 - c) * w)
      ctx.fillStyle = `rgb(${ramp(tint.r)},${ramp(tint.g)},${ramp(tint.b)})`
    } else {
      const g = Math.round((dark ? 1 - w : w) * 255)
      ctx.fillStyle = `rgb(${g},${g},${g})`
    }
    ctx.beginPath()
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
    ctx.fill()
  }
}

export function AnkraOrb({
  state = 'idle',
  size = 64,
  theme = 'auto',
  color,
  speed = 1,
  paused = false,
  interactive,
  intro = false,
  startAt,
  style,
  'aria-label': ariaLabel,
  onPointerEnter,
  onPointerMove,
  onPointerLeave,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  ...rest
}: AnkraOrbProps) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const host = useRef<HTMLSpanElement | null>(null)
  const isInteractive = interactive ?? size >= 40
  const live = useRef<Live>({
    over: false,
    x: size / 2,
    y: size / 2,
    nx: 0,
    ny: 0,
    hover: 0,
    px: size / 2,
    py: size / 2,
    yaw: 0,
    tilt: 0,
    ripples: [],
    last: 0,
    mount: now(),
  })
  const tint = useResolvedColor(color, host)
  const large = size > 64
  const libSize = LIB_SIZES.find((s) => s >= size) ?? 64

  // Kick the large loop back to life when the pointer arrives.
  const wake = useRef<() => void>(() => {})

  const track = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const l = live.current
    l.x = ((e.clientX - r.left) / r.width) * size
    l.y = ((e.clientY - r.top) / r.height) * size
    l.nx = Math.max(-1, Math.min(1, (l.x / size) * 2 - 1))
    l.ny = Math.max(-1, Math.min(1, (l.y / size) * 2 - 1))
  }
  const handlers = isInteractive
    ? {
        onPointerEnter: (e: ReactPointerEvent<HTMLCanvasElement>) => {
          track(e)
          if (!live.current.over) {
            live.current.px = live.current.x
            live.current.py = live.current.y
          }
          live.current.over = true
          wake.current()
          onPointerEnter?.(e)
        },
        onPointerMove: (e: ReactPointerEvent<HTMLCanvasElement>) => {
          track(e)
          live.current.over = true
          wake.current()
          onPointerMove?.(e)
        },
        onPointerLeave: (e: ReactPointerEvent<HTMLCanvasElement>) => {
          live.current.over = false
          onPointerLeave?.(e)
        },
        onPointerCancel: (e: ReactPointerEvent<HTMLCanvasElement>) => {
          live.current.over = false
          onPointerCancel?.(e)
        },
        onPointerUp: (e: ReactPointerEvent<HTMLCanvasElement>) => {
          if (e.pointerType !== 'mouse') live.current.over = false
          onPointerUp?.(e)
        },
        onPointerDown: (e: ReactPointerEvent<HTMLCanvasElement>) => {
          track(e)
          live.current.over = true
          live.current.ripples = [
            ...live.current.ripples.slice(-3),
            { x: live.current.x, y: live.current.y, t0: now() },
          ]
          wake.current()
          onPointerDown?.(e)
        },
      }
    : { onPointerEnter, onPointerMove, onPointerLeave, onPointerDown, onPointerUp, onPointerCancel }

  // Resolved the same way thinking-orbs does it, so the ink ramp chosen
  // here always matches the substrate the library paints on.
  const dark = useResolvedDark(theme, host)

  // The ModeFrame handed to <ThinkingOrb>. Stable across renders so the
  // library's effect only restarts when the look actually changes.
  const frame = useMemo<ModeFrame>(
    () => (outSize, t) =>
      ankraFrame(
        stillState(state),
        size,
        startAt === undefined ? t : ownClock(live.current, startAt, speed),
        step(live.current, isInteractive, intro, dark),
        outSize
      ),
    [state, size, isInteractive, intro, dark, startAt, speed]
  )

  // ---- large path: same geometry, our own loop -------------------------
  useEffect(() => {
    if (!large) return
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = Math.min(2, (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1)
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)
    const rgb = parseRgb(tint)
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size, size)
      const input = step(live.current, isInteractive, intro, dark)
      // reduced motion: a fixed instant (inside the emoji's hold, before any hand-off)
      const t =
        startAt !== undefined ? ownClock(live.current, startAt, speed) : prefersReducedMotion() ? 0.6 : now() * speed
      paintLarge(ctx, ankraFrame(stillState(state), size, t, input), dark, rgb)
    }
    if (prefersReducedMotion()) {
      draw()
      return
    }
    let raf = 0
    let running = false
    let visible = true
    const loop = () => {
      draw()
      if (running) raf = requestAnimationFrame(loop)
    }
    const start = () => {
      if (running || !visible || document.visibilityState === 'hidden') return
      if (paused && live.current.hover < 0.002 && !live.current.over) return
      running = true
      raf = requestAnimationFrame(loop)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(raf)
    }
    wake.current = start
    draw()
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting
            if (visible) start()
            else stop()
          })
        : null
    io?.observe(canvas)
    const onVis = () => (document.visibilityState === 'hidden' ? stop() : start())
    document.addEventListener('visibilitychange', onVis)
    if (!io) start()
    return () => {
      stop()
      wake.current = () => {}
      io?.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [large, state, size, dark, tint, speed, paused, isInteractive, intro, startAt])

  // The span hosts color/theme resolution (it inherits `currentColor`).
  const { className, ...canvasProps } = rest
  return createElement(
    'span',
    {
      ref: host,
      className,
      style: { display: 'inline-block', width: size, height: size, lineHeight: 0, verticalAlign: 'middle', ...style },
    },
    large
      ? createElement('canvas', {
          ...canvasProps,
          ...handlers,
          ref,
          role: 'img',
          'aria-label': ariaLabel ?? labelFor(state),
          style: { width: size, height: size, display: 'block', touchAction: 'manipulation' },
        })
      : createElement(ThinkingOrb, {
          ...canvasProps,
          ...handlers,
          size: libSize,
          theme,
          color: tint,
          paused,
          speed: speed / resolvePreset(PROXY_STATE, libSize).speed,
          frame,
          'aria-label': ariaLabel ?? labelFor(state),
          style: { width: size, height: size, touchAction: 'manipulation' },
        })
  )
}
