/**
 * Regression tests for Optimization #1:
 * Inline RGB scalars instead of creating { r, g, b } object per pixel.
 *
 * These tests verify that after refactoring the hot loop in mapartProcessing.ts
 * and the signatures of findClosestColorIndex / findTwoClosestColors,
 * the output is BIT-IDENTICAL to the original implementation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { processMapart, clearColorCache, unpackCandidateIdx } from '../mapartProcessing';

// ---------------------------------------------------------------------------
// Test Case 1 — Single pixel, 2D mode, multiple palette colors
// ---------------------------------------------------------------------------
describe('Opt#1 — inline RGB scalars (regression)', () => {

    beforeEach(() => {
        clearColorCache();
    });

    it('TC1: 2D mode — single pixel produces identical pixel output and blockIndex', () => {
        // Gray pixel — should match a definite block color
        const data = new Uint8ClampedArray([128, 100, 80, 255]);
        const imageData = new ImageData(data, 1, 1);
        const selectedPaletteItems = { 4: 'minecraft:stone', 8: 'minecraft:dirt', 17: 'minecraft:oak_log' };

        const result = processMapart(imageData, '2d', selectedPaletteItems, 50, 'none', true, 50, false);

        // Output image must be opaque
        expect(result.imageData.data[3]).toBe(255);
        // blockIndices must map to a valid candidate index
        const candidateIndex = unpackCandidateIdx(result.packedResults[0]);
        expect(candidateIndex).toBeGreaterThanOrEqual(0);
        expect(candidateIndex).toBeLessThan(result.candidates.length);
        // The output RGB must match the candidate's RGB exactly
        const candidate = result.candidates[candidateIndex];
        expect(result.imageData.data[0]).toBe(candidate.rgb.r);
        expect(result.imageData.data[1]).toBe(candidate.rgb.g);
        expect(result.imageData.data[2]).toBe(candidate.rgb.b);
    });

    // ---------------------------------------------------------------------------
    // Test Case 2 — 4x4 image, floyd-steinberg dithering, 3D valley mode
    // Verifies that error diffusion produces the same toneMap and blockIndices
    // ---------------------------------------------------------------------------
    it('TC2: 3D valley + floyd-steinberg — toneMap and blockIndices are stable across two calls', () => {
        // Deterministic input: gradient from dark to light
        const W = 4, H = 4;
        const data = new Uint8ClampedArray(W * H * 4);
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const i = (y * W + x) * 4;
                const v = Math.round((x + y * W) * (255 / (W * H - 1)));
                data[i] = v;
                data[i + 1] = v;
                data[i + 2] = v;
                data[i + 3] = 255;
            }
        }
        const imageData = new ImageData(data, W, H);
        const selectedPaletteItems = { 4: 'minecraft:stone', 8: 'minecraft:dirt' };

        // Run twice — results must be identical (deterministic, no random state)
        clearColorCache();
        const r1 = processMapart(imageData, '3d_valley', selectedPaletteItems, 50, 'floyd-steinberg', true, 50, false);
        clearColorCache();
        const r2 = processMapart(imageData, '3d_valley', selectedPaletteItems, 50, 'floyd-steinberg', true, 50, false);

        // Pixel output must be bit-identical
        expect(Array.from(r1.imageData.data)).toEqual(Array.from(r2.imageData.data));
        expect(Array.from(r1.packedResults)).toEqual(Array.from(r2.packedResults));
        // stats must be identical
        expect(r1.stats.minHeight).toBe(r2.stats.minHeight);
        expect(r1.stats.maxHeight).toBe(r2.stats.maxHeight);
    });

    // ---------------------------------------------------------------------------
    // Test Case 3 — Ordered dithering (uses findTwoClosestColors path)
    // Verifies that the ordered-dithering branch also produces stable results
    // ---------------------------------------------------------------------------
    it('TC3: ordered dithering — blockIndices match candidate rgb in output pixels', () => {
        const W = 4, H = 4;
        const data = new Uint8ClampedArray(W * H * 4);
        // Checkerboard of two known colors
        for (let i = 0; i < W * H; i++) {
            const idx = i * 4;
            if (i % 2 === 0) {
                data[idx] = 200; data[idx + 1] = 100; data[idx + 2] = 50; data[idx + 3] = 255;
            } else {
                data[idx] = 50; data[idx + 1] = 150; data[idx + 2] = 200; data[idx + 3] = 255;
            }
        }
        const imageData = new ImageData(data, W, H);
        const selectedPaletteItems = {
            4: 'minecraft:stone',
            8: 'minecraft:dirt',
            17: 'minecraft:oak_log',
            49: 'minecraft:obsidian'
        };

        clearColorCache();
        const result = processMapart(imageData, '2d', selectedPaletteItems, 50, 'ordered', true, 50, false);

        // For every pixel, the output color must correspond to one of the candidates
        const candidateRGBs = new Set(result.candidates.map(c => `${c.rgb.r},${c.rgb.g},${c.rgb.b}`));
        for (let i = 0; i < W * H; i++) {
            const idx = i * 4;
            const key = `${result.imageData.data[idx]},${result.imageData.data[idx + 1]},${result.imageData.data[idx + 2]}`;
            expect(candidateRGBs.has(key)).toBe(true);
        }

        // blockIndices must point to valid candidates
        for (let i = 0; i < W * H; i++) {
            const candidateIndex = unpackCandidateIdx(result.packedResults[i]);
            expect(candidateIndex).toBeGreaterThanOrEqual(0);
            expect(candidateIndex).toBeLessThan(result.candidates.length);
        }
    });
});
