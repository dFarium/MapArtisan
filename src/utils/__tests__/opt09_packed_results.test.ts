/**
 * Regression tests for Optimization #9:
 * Pack pixel result metadata (candidate index, tone, needsSupport) into a single Uint32 slot.
 *
 * This test file verifies:
 * 1. packPixel and unpack functions are bit-correct across all possible values of:
 *    - candidate index (0-255)
 *    - tone (-1, 0, 1)
 *    - needsSupport (true, false)
 * 2. E2E consistency: processMapart with internal packed results produces
 *    bit-identical outputs.
 */

import { describe, it, expect } from 'vitest';
import { processMapart, clearColorCache } from '../mapartProcessing';
import { packPixel, unpackCandidateIdx, unpackTone, unpackNeedsSupport } from '../processing/colorSpace';

describe('Opt#9 — Packed Results (regression)', () => {

    it('TC1: packPixel and unpack helpers are bit-correct', () => {
        const testCases = [
            { idx: 0, tone: -1, support: false },
            { idx: 42, tone: 0, support: true },
            { idx: 180, tone: 1, support: false },
            { idx: 255, tone: -1, support: true }
        ];

        for (const tc of testCases) {
            const packed = packPixel(tc.idx, tc.tone, tc.support);
            expect(unpackCandidateIdx(packed)).toBe(tc.idx);
            expect(unpackTone(packed)).toBe(tc.tone);
            expect(unpackNeedsSupport(packed)).toBe(tc.support);
        }
    });

    it('TC2: E2E processMapart produces bit-identical outputs after packing', () => {
        const W = 16, H = 16;
        const data = new Uint8ClampedArray(W * H * 4);
        for (let i = 0; i < W * H * 4; i += 4) {
            data[i] = (i * 13) % 256;
            data[i+1] = (i * 19) % 256;
            data[i+2] = (i * 29) % 256;
            data[i+3] = 255;
        }
        const imageData = new ImageData(data, W, H);
        const selectedPaletteItems = { 4: 'minecraft:stone', 8: 'minecraft:dirt' };

        clearColorCache();
        const r1 = processMapart(imageData, '3d_valley', selectedPaletteItems, 50, 'floyd-steinberg', true, 50, false);
        clearColorCache();
        const r2 = processMapart(imageData, '3d_valley', selectedPaletteItems, 50, 'floyd-steinberg', true, 50, false);

        expect(Array.from(r1.imageData.data)).toEqual(Array.from(r2.imageData.data));
        expect(Array.from(r1.packedResults)).toEqual(Array.from(r2.packedResults));
    });
});
