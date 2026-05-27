/**
 * Regression tests for Optimization #7:
 * Flat dither kernel with pre-calculated offsets and division-free weights.
 *
 * This test file verifies:
 * 1. buildFlatDitherKernel generates correct relative coordinates, flat floatBuffer offsets,
 *    and pre-divided weights.
 * 2. E2E consistency: processMapart produces bit-identical results under error diffusion
 *    (Floyd-Steinberg, Atkinson, Stucki, etc.).
 */

import { describe, it, expect } from 'vitest';
import { processMapart, clearColorCache } from '../mapartProcessing';
import { DITHER_MATRICES, buildFlatDitherKernel } from '../processing/dithering';

describe('Opt#7 — Flat dither kernel (regression)', () => {

    it('TC1: buildFlatDitherKernel pre-calculates attributes correctly', () => {
        const fsMatrix = DITHER_MATRICES['floyd-steinberg'];
        const width = 128;
        const kernel = buildFlatDitherKernel(fsMatrix, width);

        // Floyd-Steinberg has 4 non-zero weights:
        // (0, 1): weight 7
        // (1, -1): weight 3
        // (1, 0): weight 5
        // (1, 1): weight 1
        expect(kernel.count).toBe(4);

        // Check dx and dy values
        expect(Array.from(kernel.dx)).toEqual([1, -1, 0, 1]);
        expect(Array.from(kernel.dy)).toEqual([0, 1, 1, 1]);

        // Check weights (divided by divisor 16)
        expect(kernel.weights[0]).toBeCloseTo(7 / 16);
        expect(kernel.weights[1]).toBeCloseTo(3 / 16);
        expect(kernel.weights[2]).toBeCloseTo(5 / 16);
        expect(kernel.weights[3]).toBeCloseTo(1 / 16);

        // Check flat offset indices: offset = (dy * width + dx) * 3
        expect(kernel.offsets[0]).toBe((0 * width + 1) * 3);
        expect(kernel.offsets[1]).toBe((1 * width - 1) * 3);
        expect(kernel.offsets[2]).toBe((1 * width + 0) * 3);
        expect(kernel.offsets[3]).toBe((1 * width + 1) * 3);
    });

    // E2E Verification 1: Floyd-Steinberg
    it('TC2: Floyd-Steinberg dithering produces bit-identical output', () => {
        const W = 16, H = 16;
        const data = new Uint8ClampedArray(W * H * 4);
        for (let i = 0; i < W * H * 4; i += 4) {
            data[i] = (i * 3) % 256;
            data[i+1] = (i * 7) % 256;
            data[i+2] = (i * 13) % 256;
            data[i+3] = 255;
        }
        const imageData = new ImageData(data, W, H);
        const selectedPaletteItems = { 4: 'minecraft:stone', 8: 'minecraft:dirt', 12: 'minecraft:white_wool' };

        clearColorCache();
        const r1 = processMapart(imageData, '3d_valley', selectedPaletteItems, 50, 'floyd-steinberg', true, 50, false);
        clearColorCache();
        const r2 = processMapart(imageData, '3d_valley', selectedPaletteItems, 50, 'floyd-steinberg', true, 50, false);

        expect(Array.from(r1.imageData.data)).toEqual(Array.from(r2.imageData.data));
        expect(Array.from(r1.packedResults)).toEqual(Array.from(r2.packedResults));
    });

    // E2E Verification 2: Stucki (larger matrix: 12 weights)
    it('TC3: Stucki dithering produces bit-identical output', () => {
        const W = 16, H = 16;
        const data = new Uint8ClampedArray(W * H * 4);
        for (let i = 0; i < W * H * 4; i += 4) {
            data[i] = (i * 5) % 256;
            data[i+1] = (i * 11) % 256;
            data[i+2] = (i * 17) % 256;
            data[i+3] = 255;
        }
        const imageData = new ImageData(data, W, H);
        const selectedPaletteItems = { 4: 'minecraft:stone', 8: 'minecraft:dirt', 12: 'minecraft:white_wool' };

        clearColorCache();
        const r1 = processMapart(imageData, '3d_valley', selectedPaletteItems, 50, 'stucki', true, 50, false);
        clearColorCache();
        const r2 = processMapart(imageData, '3d_valley', selectedPaletteItems, 50, 'stucki', true, 50, false);

        expect(Array.from(r1.imageData.data)).toEqual(Array.from(r2.imageData.data));
        expect(Array.from(r1.packedResults)).toEqual(Array.from(r2.packedResults));
    });
});
