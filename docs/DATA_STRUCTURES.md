# MapArtisan — Data Structures & Invariants

This document describes the internal data structures, bit formats, and invariants used by the MapArtisan processing pipeline.

---

## `packedResults` — Pixel Result Buffer

**Type:** `Uint32Array`  
**Size:** `width × height` (one `u32` per pixel)  
**Layout:** Row-major, `packedResults[y * width + x]`

### Bit Layout (32-bit)

```
 31                                0
 +---------------------------------+
 | 12 | 11..10 |  9 ............. 0 |
 +---------------------------------+
 |Supp|  Tone  |  Candidate Index   |
 +---------------------------------+
```

| Bits | Width | Name | Description |
|------|-------|------|-------------|
| 0..9 | 10 | Candidate Index | Index into the `candidates` array (0–1023) |
| 10..11 | 2 | Tone | Relative height: stored as `tone + 1` (0=low/-1, 1=normal/0, 2=high/+1) |
| 12 | 1 | Support | 1 = needs support block underneath, 0 = no support needed |
| 13..31 | 19 | _unused_ | Reserved for future use |

### Invariants

- `packedResults.length === width * height`
- `unpackCandidateIdx(packedResults[i]) < candidates.length` for all valid `i`
- `unpackTone(packedResults[i]) ∈ {-1, 0, 1}` for all `i`
- In 2D mode, `unpackTone(packedResults[i]) === 0` for all `i`
- `unpackNeedsSupport(packedResults[i])` matches `candidates[unpackCandidateIdx(i)].needsSupport` unless overridden by manual edits

### Accessors

```ts
unpackCandidateIdx(packed: number): number   // bits 0..9
unpackTone(packed: number): number           // bits 10..11, returns -1/0/1
unpackNeedsSupport(packed: number): boolean  // bit 12
packPixel(candidateIdx: number, tone: number, needsSupport: boolean): number
```

---

## `toneMap` — Tone Adjustment Map

**Type:** `Int8Array | null`  
**Size:** `width × height` (one `i8` per pixel)  
**Layout:** Row-major, `toneMap[y * width + x]`

### Values

| Value | Meaning |
|-------|---------|
| `-1` | Low / dark brightness |
| `0` | Normal brightness |
| `+1` | High / light brightness |

### Invariants

- `null` in 2D mode
- `toneMap[i] === unpackTone(packedResults[i])` for all `i` (redundant but kept for convenience)
- Used by `applyManualEdits()` for incremental height recalculation

---

## `heightPath` — Smart Drop Height Profile

**Type:** `Int32Array | null`  
**Size:** `width × height` (one `i32` per pixel)  
**Layout:** **Column-major**, `heightPath[x * height + y]`

### Values

- Non-negative integers representing the normalized Y position for each block
- `heightPath[x * height + y]` = the vertical offset where the block at column `x`, row `y` should be placed

### Invariants

- `null` in 2D mode
- All values `>= 0` (normalized to start at Y=0)
- Computed by the Smart Drop algorithm (`optimizeColumnHeights`)
- In `independentMaps` mode, each 128-row segment is optimized independently
- Used by 3D preview and export to determine block Z positions

### Layout Note

Unlike `packedResults` and `toneMap` which are row-major, `heightPath` is **column-major** because the Smart Drop algorithm processes columns independently. This means:

```
heightPath[x * height + y]  // column-major
toneMap[y * width + x]      // row-major
```

---

## Worker Cache Key

**Function:** `createProcessingConfigKey()` in `mapart.worker.ts`

### Parameters included in cache key

| Parameter | Type | Why included |
|-----------|------|-------------|
| `version` | `number` | Changes when image or filters change |
| `width` | `number` | Affects pixel count and layout |
| `height` | `number` | Affects pixel count and layout |
| `buildMode` | `'2d' \| '3d_valley'` | Affects tone and height calculations |
| `palette` | `[number, string][]` | Sorted `[colorIndex, blockId]` pairs |
| `threeDPrecision` | `number` | Affects height penalty |
| `dithering` | `DitheringMode` | Affects color matching |
| `usePerceptual` | `boolean` | OKLab vs RGB distance |
| `hybridStrength` | `number` | Affects hybrid dithering |
| `independentMaps` | `boolean` | Affects Smart Drop segmentation |

### Parameters NOT in cache key

| Parameter | Why excluded |
|-----------|-------------|
| `manualEdits` | Applied incrementally on top of cached results |
| `blockSupport` | Only affects export/geometry, not color matching |
| `supportBlockId` | Only affects export/geometry |
| `exportMode` | Only affects file output |
| `exportFormat` | Only affects file output |

---

## `MapartStats`

**Type:**
```ts
interface MapartStats {
    minHeight: number;
    maxHeight: number;
    heightMap: Int32Array;  // width entries, one per column
}
```

### Invariants

- `heightMap.length === width`
- `heightMap[x]` = max height deviation in column `x`
- `minHeight <= 0` (baseline or below)
- `maxHeight >= 0` (baseline or above)
- `maxHeight - minHeight` = total height range of the structure

---

## OKLab Color Space

All perceptual color matching uses **OKLab** (Björn Ottosson, 2020), not CIELAB.

### Output Ranges

| Axis | Range | Meaning |
|------|-------|---------|
| `L` | `[0, 1]` | Perceptual lightness |
| `a` | `[-0.4, 0.4]` | Green ↔ Red axis |
| `b` | `[-0.4, 0.4]` | Blue ↔ Yellow axis |

### Cache

- **OKLab cache:** `Map<number, OKLab>` keyed by 24-bit RGB value, max 65,536 entries
- **Color match cache:** `Map<number, number>` keyed by 24-bit RGB, cleared per `processMapart` call
- **Gamma LUT:** 256-entry `Float64Array` built at module load
