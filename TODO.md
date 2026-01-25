# Pending Implementations / Lessons Learned

## ✅ Successful Experiments

### Adaptive Dithering (Ref: Experiment 3)

- **Problem**: Standard error diffusion creates excessive noise in flat areas (skies, water, solid backgrounds).
- **Solution**: Reduce error diffusion strength by scaling the error accumulation.
- **Implementation**: Multiply error by `0.85` before distributing to neighbors.
- **Results**: Cleaner skies, smoother gradients, significantly better flat color handling (mecha image).
- **Action**: Implement as a toggle or default behavior in final version.

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
- **Action**: Consider upgrading current "Ordered" mode to use 8x8 matrix, or add as separate option. Not suitable as default replacement for Floyd-Steinberg.
