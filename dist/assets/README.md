# Assets Directory: Non-Runtime Media Documentation

## Overview

This directory contains showcase previews and soundtrack accompaniment for the **NASA-Punk Observatory**. All files stored here are strictly **non-runtime media**: they are not requested or loaded by any HTML page, stylesheet, or script in the application.

---

## Textureless Procedural Runtime Architecture

The NASA-Punk Observatory operates on a **100% textureless, procedural rendering pipeline**:

1. **Zero External Textures**: No raster textures (PNG, JPEG, WebP) or audio elements are downloaded or referenced at runtime.
2. **Procedural Surface & Celestial Generation**:
   - Celestial bodies (Sun, Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune) are generated in real-time as Three.js WebGL point clouds (`THREE.Points`) using procedural vertex shaders and dynamic buffer geometries.
   - Surface features (terrains, impact craters, atmospheric bands, polar hexagons, cloud layers) are computed algorithmically using multi-octave Simplex noise algorithms (`scripts/vendor/simplex-noise.min.js`).
3. **Procedural Vector Interfaces**:
   - Tactical topography background grids, alignment crosshairs, and the 128-particle orbital telemetry mini-map are rendered dynamically via Canvas2D.
4. **Zero Runtime Network Requests**:
   - The application makes **zero HTTP requests to `assets/`**.
   - Runtime assets are strictly limited to local typography files in `fonts/` (`Jura-*.ttf`, `RobotoMono-Regular.ttf`) and local vendor scripts in `scripts/vendor/` (`three.min.js`, `simplex-noise.min.js`).
   - The observatory achieves complete offline standalone portability with zero external CDN dependencies.

---

## Media Inventory

The repository hosts 10 non-runtime media files totaling **32,571,754 bytes (~31.06 MiB)**:

| File Name | Media Type | Specifications / Encoding | Dimensions / Aspect Ratio | File Size (Bytes) | Role & Purpose |
|---|---|---|---|---|---|
| `Inon Zur - Into the Starfield (Main Theme).mp3` | Audio | MPEG ADTS layer III, v1, ID3v2.4.0, 320 kbps, 44.1 kHz, Stereo | N/A | 7,349,060 (~7.01 MiB) | Non-runtime ambient soundtrack accompaniment for standalone external listening. |
| `preview-sol.png` | Image | PNG (8-bit/color RGBA, non-interlaced) | 3840 × 2160 (16:9 4K UHD) | 3,652,123 (~3.48 MiB) | Non-runtime widescreen wallpaper & store preview for Sol (System Select / Sun). |
| `preview-sol_1-1.png` | Image | PNG (8-bit/color RGBA, non-interlaced) | 2160 × 2160 (1:1 Square) | 3,060,059 (~2.92 MiB) | Non-runtime square showcase & avatar/profile preview for Sol. |
| `preview-sol_4-3.png` | Image | PNG (8-bit/color RGBA, non-interlaced) | 2880 × 2160 (4:3 Standard) | 3,248,565 (~3.10 MiB) | Non-runtime standard aspect ratio preview for Sol. |
| `preview-sol-iii.png` | Image | PNG (8-bit/color RGBA, non-interlaced) | 3840 × 2160 (16:9 4K UHD) | 2,493,049 (~2.38 MiB) | Non-runtime widescreen wallpaper & store preview for Sol III (Earth / Terra). |
| `preview-sol-iii_1-1.png` | Image | PNG (8-bit/color RGBA, non-interlaced) | 2160 × 2160 (1:1 Square) | 2,018,981 (~1.93 MiB) | Non-runtime square showcase & avatar/profile preview for Sol III (Earth / Terra). |
| `preview-sol-iii_4-3.png` | Image | PNG (8-bit/color RGBA, non-interlaced) | 2880 × 2160 (4:3 Standard) | 2,164,545 (~2.06 MiB) | Non-runtime standard aspect ratio preview for Sol III (Earth / Terra). |
| `preview-sol-vi.png` | Image | PNG (8-bit/color RGBA, non-interlaced) | 3840 × 2160 (16:9 4K UHD) | 3,114,603 (~2.97 MiB) | Non-runtime widescreen wallpaper & store preview for Sol VI (Saturn). |
| `preview-sol-vi_1-1.png` | Image | PNG (8-bit/color RGBA, non-interlaced) | 2160 × 2160 (1:1 Square) | 2,600,446 (~2.48 MiB) | Non-runtime square showcase & avatar/profile preview for Sol VI (Saturn). |
| `preview-sol-vi_4-3.png` | Image | PNG (8-bit/color RGBA, non-interlaced) | 2880 × 2160 (4:3 Standard) | 2,870,323 (~2.74 MiB) | Non-runtime standard aspect ratio preview for Sol VI (Saturn). |

---

## Aspect Ratio Conventions & Use Cases

- **16:9 Widescreen (3840 × 2160)**: Intended for 4K and 1080p desktop wallpaper distribution (e.g., Wallpaper Engine, Lively Wallpaper) and repository banner presentations.
- **1:1 Square (2160 × 2160)**: Intended for social media embeds, square cards, and profile showcase previews.
- **4:3 Standard (2880 × 2160)**: Intended for standard presentation formats, dual-monitor vertical alignments, or legacy aspect displays.
