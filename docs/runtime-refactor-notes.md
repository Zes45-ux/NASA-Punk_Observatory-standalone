# NASA-Punk Observatory Runtime Refactor Notes

## Scope

This note focuses on the current planet runtime layer:

- `scripts/planets/*.js`
- historical legacy `js/*.js` planet scripts

The goal is to identify safe extraction opportunities without changing the visual or interaction result established by
the latest committed version.

## Current state

### 1. Planet entry files now host the runtime implementation

The planet pages now execute their runtime directly from `scripts/planets/`.

Migrated files:

- `scripts/planets/sun.js`
- `scripts/planets/mercury.js`
- `scripts/planets/venus.js`
- `scripts/planets/earth.js`
- `scripts/planets/mars.js`
- `scripts/planets/jupiter.js`
- `scripts/planets/saturn.js`
- `scripts/planets/uranus.js`
- `scripts/planets/neptune.js`

The corresponding legacy files under `js/` have been removed.

### 2. Shared systems already extracted

These cross-cutting pieces are already extracted and in active use:

- Topography renderer entry: `createTopoBackground(...)`
- Interaction system: `initInteraction(...)`, `updateInteraction(...)`
- Telemetry update: `updatePlanetTelemetry(...)`
- Transition system
- Shared page UI shell and config

### 3. Background duplication has already been removed from planet runtimes

The old per-file canvas background implementation has been removed from the migrated planet runtimes.

Planet pages now rely on:

- `createTopoBackground(...)`
- `sharedTopoBackground.resize()`

## Safe extraction candidates

These are the best next refactor targets under the non-regression constraint.

### A. Keep topography rendering centralized

Reason:

- The shared background module is already mounted in each page.
- The duplicated local canvas renderer has already been removed from the migrated runtimes.
- Future planet work should continue using the shared background module only.

Risk level:

- Low.

Recommended method:

1. Compare each legacy file's `drawTopo()` customizations against `createTopoBackground(...)` options already passed in
   that file.
2. Only remove the duplicated local functions after confirming the shared call expresses the same tint/offset.
3. Refactor one planet at a time and verify no background drift.

### B. Extract common scene bootstrap helper

Repeated patterns across most planet files:

- `const scene = new THREE.Scene()`
- `const camera = new THREE.PerspectiveCamera(...)`
- initial zoom setup
- `const renderer = new THREE.WebGLRenderer(...)`
- `renderer.setSize(...)`
- `renderer.setPixelRatio(...)`
- mount to `#canvas-container`
- `const group = new THREE.Group(); scene.add(group);`

Risk level:

- Medium to high.

Why:

- Even small ordering differences in Three.js initialization can produce subtle rendering regressions.
- Some planets use different initial zoom distances and slightly different grouping semantics.

Recommendation:

- Do not extract this yet until the dead background duplication is removed first.

### C. Extract common animation-loop tail

Repeated patterns:

- `requestAnimationFrame(animate)`
- rotation or scene updates
- `renderer.render(scene, camera)`
- `updateInteraction(group, camera)`
- `updatePlanetTelemetry(...)`

Risk level:

- High.

Why:

- Per-planet animation order often matters.
- Telemetry targets differ.
- Some bodies use sign adjustments or different spin groups.

Recommendation:

- Keep per-planet animation loops local for now.

## Unsafe or premature extraction targets

These should stay planet-specific until the runtime layer is more stable.

### Planet mesh generation and procedural geometry

Reason:

- This is the most identity-defining part of each page.
- Similarity at a glance does not mean the parameterization is safely shared.

### Spin group and telemetry target wiring

Examples:

- Earth uses `earthSystemGroup`
- Jupiter uses `jupiterSpinGroup`
- Uranus uses `uranusSpinGroup` with sign inversion
- Venus uses `cloudGroup` with a custom telemetry sign factor

Reason:

- These are semantically different and affect the output directly.

## Recommended next implementation order

1. Keep planet runtime code in `scripts/planets/{planet}.js`.
2. Confirm shared background options reproduce that planet's exact tint and noise behavior.
3. Evaluate whether scene bootstrap code should stay local or be extracted carefully.
4. Re-evaluate whether any shared scene bootstrap should be extracted further.

## Definition of success for runtime refactor

A runtime refactor is safe when:

- The rendered scene looks identical to the prior committed version.
- The background tint/noise behavior is unchanged.
- Camera zoom and drag behavior remain unchanged.
- Telemetry updates remain attached to the same target group with the same sign behavior.
- The legacy file becomes shorter because dead duplicate infrastructure was removed, not because planet-specific logic
  was hidden behind an unstable abstraction.

## Million-particle runtime contract

The current planet runtime keeps a preallocated typed-array surface layer and
uses a smaller dynamic overlay for clouds, storms, coronae, tails, eruptions,
rings, and satellite motion. `ParticleBuilder.build(...)` fills the surface in
idle batches (with a `requestAnimationFrame` fallback), updates the geometry
draw range, reports integer progress, and calls `onReady` after roughly 30% of
the surface is built (at least 25,000 particles).
`ParticleBuilder.markReady(detail)` dispatches the shared
`observatory:ready` event consumed by the transition curtain.

Public builder methods:

- `allocate([high, balanced, low, recovery], factory)` selects the first
  allocatable typed-array tier.
- `visibleCount(maxCount, profile)` returns the draw count for `high` (100%),
  `balanced` (75%), `low` (50%), or `recovery` (25% of the budget).
- `build(options)` returns `cancel()` and accepts `writeBatch`, draw-range,
  progress, ready, completion, and error callbacks.
- `markAttributeRange(attribute, offset, count)` merges pending typed-array
  upload ranges until Three.js resets the range after a render.
- `selectInitialProfile(signals)` and
  `createFrameSampler({geometry, maxCount, setDynamicStride, signals})` use
  deterministic hardware hints before the first visible draw, then lower
  dynamic update cadence before lowering static draw range; profiles only move
  down.

Active builds and frame sampling pause on `observatory:navigate-start` or a
persisted `pagehide`, then resume on a persisted `pageshow` without losing
progress or quality controls. A non-persisted `pagehide` cancels builds and
clears samplers. The transition curtain also resets on cached-page restore.

Approved high-profile surface budgets and dynamic-layer ceilings. Surface
budgets were rescaled on 2026-09-06 from the original million-particle baseline
and are coverage-normalized: each value targets ~2.5-3.2x particle coverage of
the visible disk at the planet's default zoom and point size, the
empirically best-looking band on a 1080p display:

| Body | Surface | Dynamic |
| --- | ---: | ---: |
| Sun | 150,000 | 80,000 |
| Mercury | 160,000 | 30,000 |
| Venus | 150,000 | 60,000 |
| Earth | 210,000 | 50,000 |
| Mars | 180,000 | 40,000 |
| Jupiter | 200,000 | 80,000 |
| Saturn | 160,000 | 60,000 |
| Uranus | 130,000 | 40,000 |
| Neptune | 170,000 | 60,000 |

Self-rotation pacing: rates are compressed into a demo-friendly band while
keeping the real relative ordering. The slowest bodies (Mercury, Venus, Sun)
run at ~4-7 minutes per revolution (Venus slowest, then Mercury, then the
Sun); the rocky planets sit near ~90 seconds per revolution; the gas giants
run ~45-70 seconds per revolution with Jupiter visibly fastest. True sidereal
ratios are noted in the per-planet source comments. Every per-frame animation
increment is scaled by a clamped delta-time factor (60 fps calibration base),
so the calibrated pacing holds on 120 Hz+ displays and during frame drops.

Rings are independent auxiliary geometry. Static surfaces are not updated per
frame; only dynamic overlays upload changing attributes. When frame sampling
finds sustained slowdown, the runtime first changes dynamic updates to every
second frame, then selects `balanced`, `low`, or `recovery`. It never raises a
profile automatically during the same page session. Dynamic layers accumulate
the clamped delta of skipped frames and consume it at their next update, so
lower update cadence preserves motion speed. Solar eruption probability is
scaled by elapsed time as well.

The heavy dynamic layers compute their noise on the GPU: the Sun photosphere
pulsation, the Sun corona outflow, and the Venus cloud flow run in vertex
shaders (GLSL simplex noise shared from `planetScene.js`), so the CPU only
updates time uniforms instead of per-particle buffers. The solar eruption
layer stays CPU-side and keeps the adaptive stride gate. The telemetry HUD
throttles DOM writes to 10 Hz with identical-content suppression, and the
topography background coalesces resize events to at most one full redraw per
frame.

Shared planet runtime kit (`scripts/core/planetScene.js`): `createPlanetScene`
wires scene, camera, renderer (pixel ratio clamped to 2), resize handling and
the topography background for every planet page; `createFrameDelta` provides
the delta-time factor described above.

Quality is user-overridable: the QUALITY control on planet pages cycles
auto / high / balanced / low and persists the choice in localStorage. A
manual profile locks the adaptive profile ladder (dynamic-stride automation
keeps running) until switched back to auto; samplers created after the
override inherit it. Interaction runs on Pointer Events: a single pointer
drags rotation, a two-pointer pinch zooms, click-to-focus ignores multi-touch
gestures, and Mac trackpad pinch gestures use ctrl+wheel (or Safari's
`gesture*` events). The canvas opts out of browser touch gestures via
`touch-action: none`.

Surface builds open with a convergence reveal: while the progressive build
runs, drawn particles rest on a scattered shell around the body at ~20%
opacity, gently breathing via a `uTime` term, and once `observatory:ready`
fires each particle eases into its final position staggered by a per-particle
hash. The scattered endpoint also rotates around the body's Y axis by an
angle that decays with the reveal, so particles spiral in instead of falling
straight radially, and a `vConvReveal` varying fades each particle from 20%
to full opacity as it settles. All of it happens inside the vertex and
fragment shaders via `onBeforeCompile` (`createSurfaceConvergence` in
`planetScene.js`), so the CPU cost stays two uniform writes per frame; a
6-second fallback starts the reveal even if the ready event is missed. When
a material's fragment shader lacks the `color_fragment` anchor the patch
degrades to a vertex-only effect, keeping both shaders consistent.

Surface point materials also pass through a shared appearance patch. It gives
each point a deterministic size variation and clips the point sprite to a
soft circular edge, so dense surfaces read as layered volume rather than a
grid of square pixels. The shader patches are chained in registration order,
which lets convergence, quality, and appearance enhancements coexist on one
material. Shader program cache keys include the original material key plus
the ordered patch types and GLSL parameters; equivalent programs can share a
cache entry, while convergence and size-jitter variants remain separate.

The system-select page adds a separate `system-particle-canvas` orbital dust
layer. It draws a small seeded set of moving dust sprites with a capped device
pixel ratio and its own lightweight frame loop; the topographic canvas remains
static between resize events. The overview selects 320, 240, 170, or 110 dust
sprites from the same initial hardware profile ladder, and the CSS node
breathing is disabled naturally when reduced motion is requested by the
browser.

Sun corona motion is driven by the same clamped 60 Hz delta factor as the
other demo animations instead of raw frame count, keeping radial outflow speed
consistent across 60 Hz, 120 Hz, and frame drops.

The Sun scene intentionally has no independent asteroid-belt layer. Orbital
dust is reserved for the lightweight UI map below, where it remains visually
separate from the main solar particle scene.

The system monitor is the entry to a two-state navigation flow. Its compact
map is a dedicated canvas particle layer: evenly distributed orbital dust,
moving planet markers, a selected-body reticle, and a slow scan line. It is
UI-only and does not add another celestial-body layer to the main Three.js
scene. Clicking the particle map animates it into a horizontal system strip - a
borderless, transparent fixed overlay reusing the system-select planet-node
visuals (axis
line drawing in, bodies staggering into place, always-visible English labels,
and a gentle floating bob on each body so they hover over the page). Clicking
a body in the strip jumps straight to that planet's page; the active body is
a no-op. Collapse via Escape, a click outside the strip, or a click on the
strip's empty area - the mini map fades back in. The mini map's caption bar
is always the way back to the system-select overview.

## Run and validation

The project remains build-free and works from HTTP or `file://` entry points.
For repeatable browser checks, run `python -m http.server 4173` from the
project root and check `http://127.0.0.1:4173/index.html` plus all nine planet
pages at 1920×1080. Also open `earth.html`, `saturn.html`, and `sun.html`
directly from Explorer to cover the local-file path.

Automated validation uses only Node's built-ins:

```powershell
node --test test/*.test.cjs
Get-ChildItem scripts -Recurse -Filter *.js |
    Where-Object FullName -notmatch '\\vendor\\' |
    ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE) { exit $LASTEXITCODE } }
git diff --check HEAD
```

Browser acceptance should record the opaque first paint, progressive `0%` to
`READY` state, readiness event, controls and navigation, console/page errors,
observed surface draw count, and a fresh 1080p frame sample for each entry.
