# NASA-Punk Observatory Transition Notes

## Current runtime API

`scripts/core/transition.js` exposes one browser-global object:

- `TransitionManager.init()` installs the readiness listener and the 1,500 ms
  startup reveal fallback. Entry pages call it automatically on
  `DOMContentLoaded`.
- `TransitionManager.navigate(url)` dispatches the particle-exit event and assigns
  `window.location.href` after the longest registered `holdFor(duration)` delay.
  Delays are clamped to 480–1,200 ms, and repeated calls during one exit are ignored.

The transition module projects a bounded sample from every `THREE.Points` layer
in the complete scene and converts it into at most 1,800 GPU bridge particles.
The bridge renderer is prepared with the scene instead of during a click, and
each animation frame updates uniforms plus one draw call instead of drawing each
particle through Canvas2D. This includes auxiliary atmospheres, rings, moons,
and satellites without relying on WebGL framebuffer preservation.

The outgoing particles continue across document navigation through compact
session state. After the destination reaches `observatory:ready`, a second
full-scene sample reconstructs the incoming planet and every auxiliary point
layer. The real WebGL scene stays hidden until that reconstruction is mostly
formed, then crossfades underneath it so rings and moons never pop in directly.
It also dispatches `observatory:navigate-start` with `{url, holdFor}`. The active
planet surface reverses its GPU convergence shader and requests a 720 ms hold
while its particles spiral outward. The particle builder uses the same event to
pause active generation jobs before the page changes.

## Configuration and effects

There is currently no effect registry, plugin API, or `TRANSITION_CONFIG`
global. The built-in effect is the bidirectional surface-particle shader in
`scripts/core/planetScene.js`; `styles/transition.css` only fades the HUD chrome.
Changing `window.TRANSITION_CONFIG`, or calling methods such as
`registerEffect`, `use`, `setEnabled`, `getConfig`, or
`getRegisteredEffects`, has no runtime effect because those methods are not
part of the current implementation.

The legacy curtain node remains in page markup for DOM compatibility but is not
rendered. The deep-space `html` and `body` background covers the brief document
handoff between the outgoing scatter and incoming reconstruction.

## Palette note

The two saturated `#4b70dd` marker dots in `styles/components.css` belong to
the Earth and Neptune planet identity markers. They are intentionally kept
separate from the shared cold technical-blue token `--const-blue: #5b789c`,
which is used for HUD and transition chrome; replacing them would change the
planet-specific visual mapping rather than unify semantic UI color.

## Non-regression rule

Any future transition extension must preserve direct `file://` opening,
offline operation, readiness-gated reveal, single-flight navigation, and the
bounded navigation hold unless the task explicitly changes those behaviors.
