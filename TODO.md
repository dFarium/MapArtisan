# Pending Implementations / Lessons Learned

## ✅ Successful Experiments

### Adaptive Dithering (Ref: Experiment 3)

- **Problem**: Standard error diffusion creates excessive noise in flat areas (skies, water, solid backgrounds).
- **Solution**: Reduce error diffusion strength by scaling the error accumulation.
- **Implementation**: Multiply error by `0.85` before distributing to neighbors.
- **Results**: Cleaner skies, smoother gradients, significantly better flat color handling (mecha image).
- **Action**: Implemented as "Adaptive (85% Error)" option.

### Hybrid (Smart) Dithering (Experiment 7 - The Solution)

- **Problem**: Balancing clean flat areas (skies) vs detailed gradients (moon, faces).
- **Solution**: "Super Algorithm" that adapts Error Scale per-pixel based on Local Variance and Quantization Error.
- **Implementation**:
  - Calculates 3x3 local variance.
  - Checks quantization error (color distance).
  - Interpolates error scale dynamically (0.1 to 1.0).
  - **User Control**: Added "Hybrid Strength" slider to UI.
- **Status**: **IMPLEMENTED**. This is the recommended default.

## ❌ Failed Experiments

### Serpentine Scanning (Ref: Experiment 1)

- **Idea**: Scan rows in alternating directions.
- **Result**: No visible improvement over standard raster scan. Added complexity without benefit.

### Weighted LAB (Ref: Experiment 2)

- **Idea**: Increase weight of a/b channels (1.5x) vs L (1.0x).
- **Result**: Created severe banding artifacts and "islands" of color. Broke subtle gradients (Torres del Paine).
- **Lesson**: Prioritizing color over lightness excessively breaks dithering coherence.

### Blue Noise / Ordered 8x8 (Ref: Experiment 4)

- **Idea**: Use 8x8 Bayer matrix instead of 4x4 or Error Diffusion.
- **Result**: Good for stylized/flat art (Night in the Woods), but creates visible "screen door" grid on photos.
- **Action**: Implemented as "Ordered 8x8". Both 4x4 and 8x8 are available.

### Multi-Pass Strategy 1: Selective Detail (Experiment 5.1)

- **Idea**: Pass 1 Solid (clean), Pass 2 Dithered. Pixel = Solid if error < threshold, else Dithered.
- **Result**: **SUCCESS**. Significantly cleans up flat backgrounds (Red robot, Night in the Woods) while keeping detail in complex areas (Minecraft landscape).
- **Action**: This is a keeper. Candidate name: "Smart Dithering" or "Clean Dithering".

### Multi-Pass Strategy 2: Edge-Critical (Experiment 5.2)

- **Idea**: Apply Solid on edges, Dithering elsewhere.
- **Result**: **FAILURE**. Regression in flat areas (they get dithered again). Visual clash between solid "edge" pixels and adjacent dithered pixels. Looks like artifacts/noise rather than sharpness.
- **Action**: Discard. The "Smart/Selective" approach (Strat 1) is better because it relies on _Color Error_ rather than _Edge Geometry_.

### Multi-Pass Strategy 3: Hybrid Palette (2D Base / 3D Detail) (Experiment 5.3)

- **Idea**: Use 2D (flat) as base. If 3D (slope) improves color match significantly, use it.
- **Result**: **FAILURE**. "Had potential but didn't work out". Likely caused jarring inconsistency between flat and sloped areas.
- **Action**: Discard. Inconsistency is worse than overall lower quality.

### Multi-Pass Strategy 4: Variance-Based (Experiment 5.4)

- **Idea**: Use local variance (texture complexity) to switch between Solid (High Variance) and Dithered (Low Variance).
- **Result**: Mixed. User moved to Adaptive Dithering. Likely difficult to calibrate threshold for all images.

### Experiment 6: Adaptive Dithering / Dampened Error (Current)

- **Idea**: Use standard Floyd-Steinberg but multiply the error by a factor (e.g. 0.85).
- **Goal**: Reduce "worms" and excessive noise in flat areas by letting the error die out rather than propagating forever.
- **Implementation**: `ERROR_SCALE = 0.85` inside the loop.
