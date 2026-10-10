# ankra-orb

The Ankra mark as a [thinking orb](https://github.com/Jakubantalik/thinking-orbs): drawn in dots, depth-shaded, monochrome, alive.

**Live demo: https://misterharrow.github.io/ankra-orb/**

```tsx
import { AnkraOrb, ThinkingOrb } from '@/components/ankra-orb' // website
import { AnkraOrb } from '@/implementations/elements/ankra-orb' // portal

<AnkraOrb />                                         // idle, 64px, hover-reactive
<AnkraOrb state="working" size={20} color="white" /> // loader in a button
<AnkraOrb state="thinking" size={32} />              // agent / AI activity
<AnkraOrb state="from-searching" size={32} />        // stock globe → Ankra mark → globe
<AnkraOrb state="emoji-euro" size={64} />            // € eyes → Ankra mark → € eyes
<AnkraOrb size={220} intro />                        // hero: orb settles into the mark
<ThinkingOrb state="searching" size={20} />          // the stock orbs ship alongside
```

## States

| state       | motion                                                                  | use                              |
| ----------- | ----------------------------------------------------------------------- | -------------------------------- |
| `idle`      | breathes on a 10s cycle; the three pieces float on separate planes       | logo, hero, brand moments        |
| `working`   | the pieces turn a third around the centre and lock back in place         | loaders, pending operations      |
| `working-2` | breathes in to a single point, glows there, breathes back out to full size | loaders where turning feels busy |
| `thinking`  | the mark dissolves into a dotted orb, turns, and reforms                 | agent / AI reasoning             |
| `searching` | a scan band sweeps the mark, lifting the dots it passes                  | indexing, lookups, filtering     |
| `emoji-<face>` | a dotted emoji streams into the mark and back (see below) | reactions, feedback, playful moments |
| `from-<stock>` | a real thinking-orbs state plays, its dots stream into the mark, hold, and stream back out | AI / agent activity with the brand in it |

### Emoji → Ankra

| state            | face                                                         |
| ---------------- | ------------------------------------------------------------ |
| `emoji-happy`    | smile; bounces and the grin widens on each beat               |
| `emoji-sad`      | inner brows raised, frown; a tear rolls down the cheek        |
| `emoji-confused` | one brow up, mismatched eyes, wavy mouth; the head wobbles    |
| `emoji-wink`     | lopsided smile; one eye snaps shut, holds, reopens, head tilts |
| `emoji-euro`     | € eyes and an open grin; the € eyes pop on a ka-ching beat    |

Same 7.2s hand-off as the stock states: face for 2s → streams into the mark → mark for 2s → streams back out. The faces are drawn in dots on a slightly domed disc, so they sway and depth-shade like the mark. Under reduced motion they show the still face.

### Stock orb → Ankra

`from-working`, `from-searching`, `from-solving`, `from-listening`, `from-connecting`, `from-weaving`, `from-composing`, `from-breathing`, `from-shaping` — one for every stock state.

The orb part is the library's own geometry at its own tuned speed (`MODE_FRAMES` + `resolvePreset`), not a lookalike. Every 7.2s: orb for 2s → its dots stream into the mark (1.3s) → mark for 2s → the mark streams back out (1.3s) → orb. Dots are paired by walking both shapes around the centre, so the hand-off reads as a sweep; when the counts differ, dots split or merge. Leaving the orb, every dot departs from exactly where the live orb was; returning, every dot lands exactly where the live orb resumes. Under reduced motion these states show the still mark.

## Props

| prop          | default           |                                                                           |
| ------------- | ----------------- | ------------------------------------------------------------------------- |
| `state`       | `'idle'`          | any state above                                                       |
| `size`        | `64`              | CSS px. Dot density is re-tuned per size: one dotted rail per stroke at 20–43px, a halftone at hero sizes |
| `theme`       | `'auto'`          | `auto` follows a `.dark` / `data-theme` ancestor, then the OS              |
| `color`       | grayscale         | any CSS color incl. `currentColor`; the depth ramp is kept on the tint     |
| `speed`       | `1`               | multiplier                                                                |
| `paused`      | `false`           |                                                                           |
| `interactive` | `size >= 40`      | hover tilts toward the pointer, lifts the dots under it, lets the pieces drift apart; a tap sends a ripple |
| `intro`       | `false`           | play the orb → mark settle once on mount                                  |

All other `<canvas>` props pass through.

## How it plugs into thinking-orbs

`ankraFrame(state, size, t, input)` implements thinking-orbs' `ModeFrame` contract: pure geometry in, a finished z-sorted dot list out. Up to 64px, `<AnkraOrb>` simply renders `<ThinkingOrb frame={…}>`, so the library owns painting, theme detection, tint, offscreen pausing and reduced-motion. Above 64px (the library's largest canvas) a small loop paints the same frames with the same ink ramp and the same lifecycle rules.

The mark is three congruent pieces at 120°. Piece A is traced from the master logo; B and C are exact rotations, which is what lets `working` loop seamlessly.

## Editing

`src/` here is the source. `sh sync.sh` copies it into:

- `ankra-website/src/components/ankra-orb/`
- `portal/src/implementations/elements/ankra-orb/`

Both apps depend on `thinking-orbs@^0.3.2`.

```sh
npm install
npm run dev        # gallery of every state × size at http://localhost:5288
npm run typecheck
npm run deploy     # build the gallery and publish it to GitHub Pages (gh-pages branch)
```

Orb rendering: [thinking-orbs](https://github.com/Jakubantalik/thinking-orbs) by Jakub Antalik (MIT).
