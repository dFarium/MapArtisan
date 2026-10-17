# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

This update builds every 3D column as low as its shading allows, replaces the 3D precision slider with a height limit in blocks, makes Smart V2 the default dithering, rebuilds the interface on shadcn/ui, and hardens memory use, caching and exports.

### Added
- **Height Limit**: Cap the 3D build height in blocks. When a column would grow taller, the quantizer picks the closest color with the opposite shade and dithering absorbs the difference. Three styles control how those resets look on flat areas: `Lines`, `Balanced` and `Noise`. Manually painted pixels always take priority over the limit.
- **Smooth Resampling**: The image now shrinks to the map resolution with an exact area average in linear light instead of picking the nearest pixel, removing aliasing and moiré from photos and fine detail. Results are identical in every browser, and uniform blocks at integer ratios are unchanged. `Sharp` keeps the previous nearest-pixel behaviour for pixel art.
- **Smart V2 Dithering**: Diffuses error fully on detailed areas and gently on flat ones, guided by a local activity map that respects independent map boundaries.
- **Build Height in the Status Bar**: Shows the real height of the tallest column, and turns red above the world limit or when manual edits exceed the height limit.
- **Map Count Limits**: Grids are capped at 128 maps, with a warning and a RAM estimate from 96 maps.
- **Diagnostics Switch**: Informational logs are off by default; enable them with `?debug=1` or the `mapartisan:debug` local storage key.
- **Test Card**: A 1×2 test image and generator (`docs/test-images`, `scripts/generate-test-card.mjs`) for checking heights and exports in game.
- **Golden Fixtures**: 616 generated cases freeze the processing output across grids, build modes, dithering modes, color spaces, edits, independent maps and height limits.

### Changed
- **New Interface**: Every control now uses shadcn/ui components with one color theme, a 12 px minimum text size and the Inter font. Icon buttons show tooltips and can be used from the keyboard, and status colors (success, warning, error) are consistent across the app.
- **Dialogs Instead of Browser Prompts**: Saving a preset asks for its name in a dialog, and deleting one asks for confirmation. The brush picker and the material list are proper dialogs that close with `Esc` or a click outside.
- **Grouped Dithering Menu**: Dithering modes are grouped into Smart, Error diffusion and Ordered.
- **Smoother Painting**: Painting a stroke no longer re-renders the palette and control panel.
- **Lowest Possible Staircase**: The 3D layout now reaches the theoretical minimum height for every column: its longest run of highlights or shadows, plus one block.
- **Smart V2 is the Default**: Smart V1 remains available as `Smart V1`.
- **Smart V2 Strength Scale**: The slider now runs from no dithering at 0% to Floyd-Steinberg at 100%, like Smart V1. Values from 50% up behave exactly as before; below 50% the dithering fades out evenly.
- **Versioned Processing Contract**: The worker processes, edits, counts materials and exports through one versioned engine API, and materials and exports reuse the cached result instead of reprocessing.
- **Faster Color Filters**: Brightness, contrast and saturation reuse the resampled image instead of scaling the source again.
- **Texture Cache Versioning**: The service worker cache name now follows the texture contents, so updated textures replace the old cache.

### Removed
- **3D Precision Slider**: Replaced by the height limit, which keeps far more color accuracy at the same height.
- **Rust/WASM Engine**: Retired after measuring it slower than the TypeScript engine with real palettes; its last state is kept in the `rust-engine-final` tag. The COOP/COEP headers it required are gone as well.
- **Legacy Worker API**: Only the versioned contract remains.

### Fixed
- **Independent Map Exports**: The last row of every 128-row section is no longer dropped.
- **Single-File Exports**: The north reference block (noobline) is placed correctly.
- **Block Picker**: Reads the latest processed result.
- **Undo/Redo**: Undoing after more than 50 strokes no longer erases the oldest ones, and the Redo button is enabled right after an undo.
- **Button and Heading Styles**: Leftover global styles from the project template no longer override button padding, heading sizes and link colors.
- **Screen Readers**: Sliders and icon buttons are announced by name.
- **Version Changes**: Switching Minecraft versions invalidates colors that are no longer available.
- **Memory**: Bounded caches, undo deltas, texture LRU, and cleanup of buffers, Blob URLs, timers and WebGL resources on image, grid and palette changes.

## [1.2.0] - 2026-06-11

This update modernizes the entire dependency stack, adopts the OKLab perceptual color space for high-fidelity block matching, implements major core optimizations (allocation-free algorithms, fast 32-bit bitpacking, and hoisted loops), and resolves React hooks violations for React 19 compatibility.

### Added
- **OKLab Perceptual Color Space**: Integrated the modern OKLab color space to replace CIELAB. OKLab delivers superior perceptual uniformity, particularly in blue and violet hues, while using simpler and faster floating-point operations.
- **Minecraft Palette Precalculations**: Added static precomputation of OKLab coordinates for the entire Minecraft block palette at module load time (`paletteLabMap`), completely eliminating color-space conversion overhead on start-up.

### Upgraded
- **Core Stack**: Upgraded React and React DOM to v19, TypeScript to v6.0, Vite to v8.0, Zustand to v5.0, Lucide React to v1.17, React-dropzone to v15.0, and Vitest to v4.1.
- **Engine Modernization**: Upgraded Three.js and `@types/three` to `0.184.0` / `0.184.1`, `eslint-plugin-react-refresh` to `0.5.2`, and `globals` to `17.6.0`.

### Fixed
- **React Hook & ESLint Violations**:
  - Eliminated accessing and mutating refs during component render cycles in `Mapart3DPreview.tsx` and `useBlockTextures.ts`.
  - Refactored synchronous `setState` calls inside `useEffect` to use clean, render-phase state synchronization patterns in `useMapartWorker.ts`, `useBlockTextures.ts`, and `ConstructionSettingsSection.tsx`.
  - Fixed useless assignment warnings (`no-useless-assignment`) in block generation and processing scripts.
  - Added compatibility overrides for the React Compiler within `Mapart3DPreview.tsx`.

### Optimized
- **Bit Array Bitpacking Speedups**: Redesigned `litematicaBitArray.ts` to utilize a fast `Uint32Array` view over the underlying buffer, completely avoiding CPU-heavy JavaScript `BigInt` operations for read and write queries.
- **Allocation-Free Matching**: Inlined RGB scalar calculations in the inner loops of the dithering and color matching systems (`colorMatching.ts` / `colorSpace.ts`), preventing temporary object allocations (`{r, g, b}`) on hot paths.
- **Loop Hoisting**: Hoisted static conditionals (such as height penalty and precision checks) out of hot loops in the color matcher.
- **Build Speeds**: Reduced build compilation time by over **80%** (from ~6.5s to under 1s) through Vite 8's native Rolldown bundler and Oxc compiler integration.
- **Package Housekeeping**: Removed redundant packages (`postcss`, `autoprefixer`, and `@types/jszip`) to leverage Tailwind v4's native compiler and JSZip's built-in type declarations.

## [1.1.0] - 2026-05-29

This update introduces support for Minecraft 26.2, major improvements in color manipulation alongside performance optimizations, persistent paint mode, and direct NBT schematic exporting.

### Added
- **Minecraft 26.2 Support**: Added block palette entries and textures for new blocks introduced in Minecraft 26.2 (Cinnabar and Sulfur blocks/slabs variants). Registered new assets in the Service Worker cache.
- **Persistent Paint**: Redesigned canvas hand-painting to persist modifications across worker recalculations.
- **NBT Export**: Completed direct NBT and Litematica (`.litematic`) builder integration with automated test coverage.
- **Background 3D Builder**: Offloaded Three.js geometry construction to a dedicated background Web Worker.
- **Keyboard Shortcuts**: Implemented hotkey controls and interaction hint overlays for canvas editing.

### Optimized
- **Color Manipulation & Algorithmic Performance**:
  - Implemented Look-Up Tables (LUT) for gamma correction and faster color-space matching.
  - Avoided redundant CIELAB conversions by caching common color match paths.
  - Redesigned data layouts into Struct-of-Arrays (SoA) with row hoisting and optimized bitpacking.
  - Streamlined Floyd-Steinberg and hybrid dithering execution for multi-map creations.
  - Optimized 3D geometry mesh rendering to reduce draw calls.


---

## [1.0.1] - 2026-03-16

### Added
- **Minecraft 26.1 Support**: Updated the palette filter and data versions to fully support Minecraft version 26.1 block registries.
- **3D Preview Textures**: Rendered Minecraft textures onto 3D previews.
- **Performance Adjustments**: Optimizations to initial 3D preview render pipelines.

---

## [1.0.0] - 2026-02-14

### Added
- **Initial Release**: Complete MapArtisan application featuring 2D canvas editor, real-time 3D preview, color matching, and basic schematic exports.
- **PWA Capabilities**: Service worker for offline use.
- **Dark Mode**: Forced dark mode support.
