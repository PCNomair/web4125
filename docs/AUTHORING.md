# Writing HTML that renders deterministically

A renderer captures **1500 separate frames** of your page and stitches them into a 25 s
video. Frames are captured *out of order*, *in parallel* (several tabs at once) and *as
fast as the CPU allows*. Your page therefore has to be a **pure function of time**: given
`t = frame / 60`, the pixels must be identical every time.

This page explains exactly what the render engine does and how to work with it.

---

## 1. The canvas contract

| | |
| --- | --- |
| Viewport | `1080 × 1920` px, no scrollbars, no device pixel ratio scaling |
| Frames | 1500 (60 fps × 25 s), frame `N` = `N / 60` seconds |
| Background | `#000000` unless your HTML paints something |

Set the size explicitly so the layout never depends on the viewport:

```css
html, body { width: 1080px; height: 1920px; margin: 0; overflow: hidden; }
```

Optional but recommended `meta`: `<meta charset="utf-8" />` and
`-webkit-font-smoothing: antialiased` for cleaner type.

---

## 2. What the engine does on every frame

1. Injects a stylesheet that pauses `animation-play-state`, zeroes
   `transition-duration`, hides scrollbars and disables `caret-color`.
2. Waits for `document.fonts.ready` and every `<img>` to load (once, before frame 0).
3. Sets `document.documentElement` CSS variables:
   * `--remotion-time` — e.g. `4.516s`
   * `--t` — same value (short alias)
   * `--remotion-progress` — `0 → 1` across the whole video
4. Calls `.pause()` then sets `currentTime` on **every** `document.getAnimations()` entry —
   that covers CSS animations, `::before`/`::after` pseudo-element animations, WAAPI
   animations (`element.animate()`), and CSS transitions.
5. Pauses every `<video>`/`<audio>`, mutes it and seeks it to the matching time.
6. Calls `window.__seek(t, { progress, duration })` if you defined it.
7. Dispatches a `remotion-seek` DOM event with `detail = { time, progress, duration }`.

Then the frame is screenshotted and the next frame begins.

---

## 3. Recommended: CSS timeline

Because every CSS animation is driven by the engine, the simplest approach is one
25-second keyframe timeline per element:

```css
.title {
  animation: intro 25s cubic-bezier(.16,.9,.28,1) both;
  animation-delay: -1.2s;             /* start 1.2 s into the video */
}
@keyframes intro {
  0%   { opacity: 0; transform: translateY(60px); }
  6%   { opacity: 1; transform: translateY(0); }   /* 1.5 s in  */
  94%  { opacity: 1; }
  100% { opacity: 1; }
}
```

`animation-duration: 25s` + percentage keyframes = you're editing the video timeline.
Negative `animation-delay` lets elements enter at any point. `both` keeps the end state.

If you prefer real seconds, use `animation-timeline`-free math: percentage = `seconds / 25`.

### Loops

A 2 s looping animation inside a 25 s video:

```css
.spinner { animation: spin 2s linear infinite; }
```

`infinite` loops are fine — the engine seeks to an absolute time, so a 2 s loop shows the
right phase at every frame. For scene-level loops (e.g. a 5 s HTML animation repeated 5
times) set `"loopSeconds": 5` in `video.config.json` instead.

### Time-driven values

```css
.clock::after { content: var(--remotion-time, "0s"); }
.bar { width: calc(var(--remotion-progress) * 100%); }
```

Or with CSS math on the custom property (registered so it animates numerically):

```css
@property --t-num { syntax: "<number>"; inherits: true; initial-value: 0; }
html { --t-num: 0; } /* set per frame via --remotion-progress if you need numbers */
```

---

## 4. Canvas / WebGL / JS scenes

Draw the frame yourself. **No** timers, **no** `requestAnimationFrame` loops that keep
state — just a function of `t`:

```js
const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');

function draw(t, progress) {
  ctx.clearRect(0, 0, 1080, 1920);
  // … draw using only `t` and `progress` …
}

window.__seek = (t, meta = {}) => draw(t, meta.progress ?? 0);
window.__ready = Promise.all(images.map(load));  // optional gate for frame 0
draw(0, 0);
```

Full working example: `templates/canvas-example.html`.

### Deterministic randomness

Replace `Math.random()` with a hash of the index — every capture must agree:

```js
const rand = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
```

---

## 5. Assets, fonts, media

* Keep files next to your HTML inside `public/scenes/` (or anywhere in `public/`) and
  reference them relatively: `<img src="logo.png">`, `<link rel="stylesheet" href="style.css">`.
* Prefer local fonts (`@font-face` with a `.woff2` beside the HTML). Google Fonts works but
  adds a network round-trip per render tab and can silently fall back if the request fails.
* `<video>` and `<audio>` elements are paused and seeked to `t`, so they can be used as
  in-scene footage — but their durations must be ≥ the visible window, and they render muted
  (audio in the video comes from `public/audio/`).
* External URLs (CDNs, APIs) are unreliable in CI. If you must, make sure the page still
  looks right when they fail.
* Heavy assets slow every frame: a 4K image decoded once is fine, 200 animated DOM nodes
  with `blur()` filters is not. `filter: blur(90px)` on large elements is GPU work; prefer
  pre-blurred PNGs if renders feel slow.

---

## 6. Anti-patterns (these break the render)

| Don't | Why | Do instead |
| --- | --- | --- |
| `setTimeout`/`setInterval` toggling classes | timers fire at unpredictable moments in each tab | CSS animations / `__seek` |
| `Date.now()` / `performance.now()` in draw code | each frame sees a different clock | pass `t` from `__seek` |
| `Math.random()` at draw time | differs per capture, causes flicker | hashed pseudo-random |
| `requestAnimationFrame` animation loop | collides with the engine's seeking | drive from `__seek(t)` |
| Lottie / heavy JS libraries with their own clock | same problem | `lottie.goToAndStop(frame, true)` inside `__seek` |
| `position: fixed` + scroll tricks | scrollbars are hidden and scroll position is not part of the timeline | layout with flex/grid |
| Web fonts loaded over the network only | flaky fallback mid-render | embed `.woff2` locally |

---

## 7. Iterating quickly

* `npm run studio` — Remotion Studio with a timeline scrubber: every frame is rendered by
  the same engine CI uses, so what you scrub is what you get.
* `ONLY=scene-my-file npm run render` — render just your scene locally.
* Tune `durationInSeconds` in `video.config.json` to `2` while iterating, then set it back
  to `25` before pushing (CI always uses the committed config).
