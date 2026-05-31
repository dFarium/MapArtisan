# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
