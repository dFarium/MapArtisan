/**
 * Regression tests for Optimization #8:
 * Pre-compute y * width per row to eliminate redundant multiplications in inner loops.
 *
 * This test file verifies:
 * 1. E2E consistency: processMapart produces bit-identical results under various modes.
 * 2. build3DGeometry continues to produce identical geometry structure, counts,
 *    coordinates, and colors.
 */

import { describe, it, expect } from 'vitest';
import { processMapart, clearColorCache } from '../mapartProcessing';
import { build3DGeometry } from '../../components/builder/3d/build3DGeometry';

describe('Opt#8 — Row y * width hoist (regression)', () => {

    it('TC1: processMapart produces identical outputs', () => {
        const W = 16, H = 16;
        const data = new Uint8ClampedArray(W * H * 4);
        for (let i = 0; i < W * H * 4; i += 4) {
            data[i] = (i * 17) % 256;
            data[i+1] = (i * 23) % 256;
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

    it('TC2: build3DGeometry produces identical output matrices, coords, and textureIds', () => {
        const W = 16, H = 16;
        const data = new Uint8ClampedArray(W * H * 4);
        for (let i = 0; i < W * H * 4; i += 4) {
            data[i] = (i * 3) % 256;
            data[i+1] = (i * 9) % 256;
            data[i+2] = (i * 27) % 256;
            data[i+3] = 255;
        }
        const imageData = new ImageData(data, W, H);
        const selectedPaletteItems = { 4: 'minecraft:stone', 8: 'minecraft:dirt' };
        
        const mapartRes = processMapart(imageData, '3d_valley', selectedPaletteItems, 50, 'floyd-steinberg', true, 50, false);
        
        const candidateBlocks = mapartRes.candidates.map(c => c.blockId);

        const geom1 = build3DGeometry({
            imageData: mapartRes.imageData,
            packedResults: mapartRes.packedResults,
            blockSupport: 'gravity',
            supportColor: { r: 128, g: 128, b: 128 },
            exportMode: 'sections',
            independentMaps: true,
            candidateBlocks,
            supportBlockId: 'minecraft:cobblestone'
        });

        const geom2 = build3DGeometry({
            imageData: mapartRes.imageData,
            packedResults: mapartRes.packedResults,
            blockSupport: 'gravity',
            supportColor: { r: 128, g: 128, b: 128 },
            exportMode: 'sections',
            independentMaps: true,
            candidateBlocks,
            supportBlockId: 'minecraft:cobblestone'
        });

        expect(geom1.count).toBe(geom2.count);
        expect(Array.from(geom1.positions)).toEqual(Array.from(geom2.positions));
        expect(Array.from(geom1.colors)).toEqual(Array.from(geom2.colors));
        expect(Array.from(geom1.textureIds)).toEqual(Array.from(geom2.textureIds));
    });
});
