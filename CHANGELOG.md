# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
