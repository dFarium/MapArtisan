/**
 * Regression tests for Optimization #3:
 * Hoist the `useCielab` branch outside the inner candidate loop in
 * findClosestColorIndex and findTwoClosestColors.
 *
 * Both functions split into two specialized code paths (one per mode)
 * selected BEFORE entering the loop — eliminating a branch check that
 * was previously evaluated once per candidate per pixel (~47M times on
 * a 512x512 image with 180 candidates).
 *
 * Results must be BIT-IDENTICAL for both useCielab=true and useCielab=false.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { processMapart, clearColorCache, unpackCandidateIdx } from '../mapartProcessing';

const PALETTE_MULTI = {
    4:  'minecraft:stone',
    8:  'minecraft:dirt',
    17: 'minecraft:oak_log',
    49: 'minecraft:obsidian',
    1:  'minecraft:grass_block',
    12: 'minecraft:white_wool',
};

function makeGradientImage(w: number, h: number): ImageData {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        const v = Math.round((i / (w * h - 1)) * 255);
        data[i * 4]     = v;
        data[i * 4 + 1] = Math.round(v * 0.7);
        data[i * 4 + 2] = Math.round(255 - v * 0.5);
        data[i * 4 + 3] = 255;
    }
    return new ImageData(data, w, h);
}

// ---------------------------------------------------------------------------
// TC1 — useCielab=true: two identical calls must produce bit-identical output
// Exercises findClosestColorIndex (error-diffusion path)
// ---------------------------------------------------------------------------
describe('Opt#3 — useCielab branch hoisted (regression)', () => {

    beforeEach(() => { clearColorCache(); });

    it('TC1: CIELAB mode — two calls produce bit-identical toneMap and blockIndices', () => {
        const img = makeGradientImage(8, 8);

        clearColorCache();
        const r1 = processMapart(img, '3d_valley', PALETTE_MULTI, 50, 'floyd-steinberg', true, 50, false);
        clearColorCache();
        const r2 = processMapart(img, '3d_valley', PALETTE_MULTI, 50, 'floyd-steinberg', true, 50, false);

        expect(Array.from(r1.packedResults)).toEqual(Array.from(r2.packedResults));
        expect(Array.from(r1.imageData.data)).toEqual(Array.from(r2.imageData.data));
    });

    // ---------------------------------------------------------------------------
    // TC2 — useCielab=false (RGB distance mode): ordered dithering uses
    // findTwoClosestColors — must also produce stable, valid output
    // ---------------------------------------------------------------------------
    it('TC2: RGB distance mode — ordered dithering produces valid output', () => {
        const img = makeGradientImage(8, 8);

        clearColorCache();
        const r1 = processMapart(img, '2d', PALETTE_MULTI, 50, 'ordered', false, 50, false);
        clearColorCache();
        const r2 = processMapart(img, '2d', PALETTE_MULTI, 50, 'ordered', false, 50, false);

        // Bit-identical across two runs
        expect(Array.from(r1.imageData.data)).toEqual(Array.from(r2.imageData.data));
        expect(Array.from(r1.packedResults)).toEqual(Array.from(r2.packedResults));

        // All output pixels must be a valid candidate color
        const candidateKeys = new Set(r1.candidates.map(c => `${c.rgb.r},${c.rgb.g},${c.rgb.b}`));
        for (let i = 0; i < 8 * 8; i++) {
            const idx = i * 4;
            const key = `${r1.imageData.data[idx]},${r1.imageData.data[idx+1]},${r1.imageData.data[idx+2]}`;
            expect(candidateKeys.has(key)).toBe(true);
        }
    });

    // ---------------------------------------------------------------------------
    // TC3 — Cross-mode consistency: CIELAB and RGB modes must agree that each
    // selected color is a valid palette candidate (structural correctness)
    // and that switching mode doesn't produce invalid indices
    // ---------------------------------------------------------------------------
    it('TC3: both modes select valid candidate indices — no out-of-bounds', () => {
        const W = 16, H = 16;
        const data = new Uint8ClampedArray(W * H * 4);
        // Checkerboard of saturated colors
        for (let i = 0; i < W * H; i++) {
            const idx = i * 4;
            data[idx]     = (i % 3 === 0) ? 220 : 30;
            data[idx + 1] = (i % 3 === 1) ? 200 : 40;
            data[idx + 2] = (i % 3 === 2) ? 210 : 20;
            data[idx + 3] = 255;
        }
        const img = new ImageData(data, W, H);

        for (const useCielab of [true, false]) {
            for (const dithering of ['none', 'floyd-steinberg', 'ordered'] as const) {
                clearColorCache();
                const r = processMapart(img, '3d_valley', PALETTE_MULTI, 50, dithering, useCielab, 50, false);

                // Every blockIndex must be in-bounds
                for (let i = 0; i < W * H; i++) {
                    const candidateIndex = unpackCandidateIdx(r.packedResults[i]);
                    expect(candidateIndex).toBeGreaterThanOrEqual(0);
                    expect(candidateIndex).toBeLessThan(r.candidates.length);
                }

                // Every output pixel must match its candidate's RGB
                for (let i = 0; i < W * H; i++) {
                    const idx = i * 4;
                    const candidateIndex = unpackCandidateIdx(r.packedResults[i]);
                    const cand = r.candidates[candidateIndex];
                    expect(r.imageData.data[idx]).toBe(cand.rgb.r);
                    expect(r.imageData.data[idx + 1]).toBe(cand.rgb.g);
                    expect(r.imageData.data[idx + 2]).toBe(cand.rgb.b);
                }
            }
        }
    });
});
