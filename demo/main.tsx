import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { AnkraOrb, ThinkingOrb } from '../src'
import type { AnkraState, OrbState } from '../src'

const STATES: AnkraState[] = ['idle', 'working', 'working-2', 'thinking', 'searching']
const SIZES = [20, 24, 32, 43, 64, 120]
const MORPHS: AnkraState[] = ['from-working', 'from-searching', 'from-weaving', 'from-shaping', 'from-solving']
const MORPH_SIZES = [32, 64, 120]
const EMOJI: AnkraState[] = ['emoji-happy', 'emoji-sad', 'emoji-confused', 'emoji-wink', 'emoji-euro']
const EMOJI_HEADS = ['happy', 'sad', 'confused', 'wink', '€ eyes']
const STOCK: OrbState[] = ['working', 'searching', 'solving', 'weaving', 'breathing', 'shaping']

function App() {
  const [dark, setDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  return (
    <div className={`page ${dark ? 'dark' : 'light'}`}>
      <div className="wrap">
        <header>
          <h1>ankra · thinking orbs</h1>
          <button className="toggle" onClick={() => setDark((d) => !d)}>
            {dark ? 'light' : 'dark'}
          </button>
        </header>

        <p className="intro">
          The Ankra mark drawn in dots, depth-shaded and alive, built on{' '}
          <a href="https://github.com/Jakubantalik/thinking-orbs">thinking-orbs</a>. One React component for the website
          and the product, from 20&nbsp;px loaders to hero moments.
        </p>

        <section className="hero">
          <Showreel size={260} />
        </section>

        <h2>states × sizes</h2>
        <p className="note">
          Dot density is re-tuned per size: a single dotted line per stroke when small, a halftone when large.
        </p>
        <div className="scroller">
          <div className="grid">
            <div className="head" />
            {STATES.map((s) => (
              <div key={s} className="head">
                {s.replace('-', ' ')}
              </div>
            ))}
            {SIZES.map((size) => (
              <Row key={size} size={size} />
            ))}
          </div>
        </div>

        <h2>stock orb → ankra</h2>
        <p className="note">The real thinking-orbs animation plays, then its dots stream into the mark and back out.</p>
        <div className="scroller">
          <div className="grid">
            <div className="head" />
            {MORPHS.map((s) => (
              <div key={s} className="head">
                {s.replace('from-', '')} → ankra
              </div>
            ))}
            {MORPH_SIZES.map((size) => (
              <Row key={size} size={size} states={MORPHS} />
            ))}
          </div>
        </div>

        <h2>emoji → ankra</h2>
        <p className="note">Five dotted expressions that hand off to the mark. Each has its own small motion.</p>
        <div className="scroller">
          <div className="grid">
            <div className="head" />
            {EMOJI_HEADS.map((s) => (
              <div key={s} className="head">
                {s}
              </div>
            ))}
            {MORPH_SIZES.map((size) => (
              <Row key={size} size={size} states={EMOJI} />
            ))}
          </div>
        </div>

        <h2>in the gui</h2>
        <p className="note">Loaders take the surrounding text color; the sidebar mark reacts to hover.</p>
        <div className="ui">
          <div className="sidebar">
            <AnkraOrb size={43} theme="dark" />
            <i />
            <i />
            <i />
          </div>
          <button className="btn">
            <AnkraOrb state="working" size={20} color="white" />
            Deploying cluster
          </button>
          <button className="btn ghost">
            <AnkraOrb state="working" size={20} color="currentColor" />
            Saving
          </button>
          <div className="toast">
            <AnkraOrb state="thinking" size={32} />
            <span>Agent is reviewing the manifest…</span>
          </div>
          <div className="toast">
            <AnkraOrb state="searching" size={24} color="#2b59ff" />
            <span>Indexing add-ons</span>
          </div>
        </div>

        <h2>stock thinking orbs, same import</h2>
        <p className="note">The original nine states ship alongside, from the same package.</p>
        <div className="stock">
          {STOCK.map((s) => (
            <ThinkingOrb key={s} state={s} size={32} />
          ))}
        </div>

        <footer>
          <a href="https://github.com/MisterHarrow/ankra-orb">source</a>
          <span>·</span>
          <span>
            orbs by <a href="https://github.com/Jakubantalik/thinking-orbs">Jakub Antalik</a>, MIT
          </span>
        </footer>
      </div>
    </div>
  )
}

// ---- showreel: every state in one loop ----------------------------------
//
// Each step starts and ends on the Ankra mark, so consecutive steps meet on
// the same shape and a short cross-fade joins them. The hand-off states
// (stock orb / emoji) start 3.3s into their 7.2s cycle, which is the mark's
// hold, and run exactly one cycle: mark → out to the orb/face → back in.

const HANDOFF_START = 3.3
const HANDOFF = 7.2

interface Step {
  state: AnkraState
  label: string
  startAt: number
  dur: number
}

const REEL: Step[] = [
  { state: 'idle', label: 'idle', startAt: 0, dur: 6 },
  { state: 'working', label: 'working', startAt: 0, dur: 4.8 },
  { state: 'working-2', label: 'working 2', startAt: 0, dur: 5.2 },
  { state: 'thinking', label: 'thinking', startAt: 0, dur: 6 },
  { state: 'searching', label: 'searching', startAt: 0, dur: 6.4 },
  ...(
    [
      'working',
      'searching',
      'solving',
      'listening',
      'connecting',
      'weaving',
      'composing',
      'breathing',
      'shaping',
    ] as const
  ).map((s): Step => ({ state: `from-${s}`, label: `${s} orb → ankra`, startAt: HANDOFF_START, dur: HANDOFF })),
  ...(
    [
      ['happy', 'happy'],
      ['sad', 'sad'],
      ['confused', 'confused'],
      ['wink', 'wink'],
      ['euro', '€ eyes'],
    ] as const
  ).map(([e, label]): Step => ({ state: `emoji-${e}`, label, startAt: HANDOFF_START, dur: HANDOFF })),
]

const INTRO_EXTRA = 3 // the first idle also plays the orb → mark settle
const FADE_MS = 600

function Showreel({ size }: { size: number }) {
  const [step, setStep] = useState(0)
  const [layers, setLayers] = useState([{ id: 0, step: 0 }])
  const [reduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)

  const go = (next: number) => {
    setStep(next)
    setLayers((ls) => [...ls.slice(-1), { id: ls[ls.length - 1].id + 1, step: next }])
  }

  // advance when the current step has played (not under reduced motion)
  const current = layers[layers.length - 1]
  useEffect(() => {
    if (reduced) return
    const extra = current.id === 0 ? INTRO_EXTRA : 0
    const timer = setTimeout(() => go((step + 1) % REEL.length), (REEL[step].dur + extra) * 1000)
    return () => clearTimeout(timer)
  }, [step, current.id, reduced])

  // drop the outgoing layer once it has faded
  useEffect(() => {
    if (layers.length < 2) return
    const timer = setTimeout(() => setLayers((ls) => ls.slice(-1)), FADE_MS + 50)
    return () => clearTimeout(timer)
  }, [layers])

  return (
    <div className="reel">
      <div className="reel-stage" style={{ width: size, height: size }}>
        {layers.map((l, i) => (
          <div key={l.id} className={`reel-layer ${i === layers.length - 1 ? 'in' : 'out'}`}>
            <AnkraOrb
              state={REEL[l.step].state}
              size={size}
              startAt={REEL[l.step].startAt}
              intro={l.id === 0}
              aria-label={`Ankra orb: ${REEL[l.step].label}`}
            />
          </div>
        ))}
      </div>
      <p className="reel-label" aria-live="polite">
        <span>{REEL[step].label}</span>
        <span className="reel-count">
          {String(step + 1).padStart(2, '0')} / {REEL.length}
        </span>
      </p>
      <div className="reel-dots">
        {REEL.map((r, i) => (
          <button
            key={r.label}
            type="button"
            aria-label={`Show ${r.label}`}
            aria-current={i === step}
            className={i === step ? 'on' : ''}
            onClick={() => go(i)}
          />
        ))}
      </div>
      <p className="reel-hint">hover · tap</p>
    </div>
  )
}

function Row({ size, states = STATES }: { size: number; states?: AnkraState[] }) {
  return (
    <>
      <div className="label">{size}px</div>
      {states.map((s) => (
        <div key={s}>
          <AnkraOrb state={s} size={size} />
        </div>
      ))}
    </>
  )
}

// reuse the root across hot reloads
const host = document.getElementById('root') as HTMLElement & { _root?: ReturnType<typeof createRoot> }
host._root ??= createRoot(host)
host._root.render(
  <StrictMode>
    <App />
  </StrictMode>
)
