# Processing Golden Fixtures

The golden fixture suite freezes the observable behavior of the processing engine. Any change to quantization, dithering, height optimization or the height limit shows up here, and any alternative engine must reproduce these results byte for byte.

## Matrix

The cases are generated as a full cross-product rather than maintained manually:

- 2 grids: `1x1` and `2x2`
- 2 build modes: `2d` and `3d_valley`
- 11 dithering modes
- 2 color-distance modes: RGB and OKLab
- 2 edit states: base and manual edits
- 2 map segmentation modes: continuous and `independentMaps`

That gives `352` cases. Every unedited `3d_valley` case also gets three height-limited variants, one per reset style (`4` blocks `lines`, `6` blocks `balanced`, `8` blocks `noise`), for exactly `616` deterministic cases. Edits are applied after quantization, so edited cases only run without a limit. Although some flags are semantically redundant in a subset of configurations, retaining the complete product prevents holes in the compatibility contract.

The `2x2` source includes distinctive pixels on both `127/128` seams. Manual edits cover corners, quadrant interiors, and the four pixels surrounding the central map intersection.

## Compared outputs

Every case records exact FNV-1a 64-bit hashes for:

- source and processed RGBA bytes
- `packedResults`
- candidate metadata
- `toneMap`
- `heightPath`
- `MapartStats.heightMap`

It also records `minHeight`, `maxHeight`, edit count, and exact probes at corners, interiors, and map seams. Integer processing outputs require exact equality. Future floating-point geometry fixtures should use explicitly documented tolerances instead.

Typed-array hashes use their little-endian byte representation, matching WebAssembly linear memory and the supported browser/desktop targets.

## Commands

```bash
# Verify the checked-in TypeScript reference
npm run goldens:verify

# Intentionally regenerate after an approved behavior change
npm run goldens:update
```

Regeneration is not an automatic snapshot update. Review the manifest diff and explain every intentional output change before committing it.
