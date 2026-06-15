import { describe, it, expect, beforeEach } from 'vitest';
import { processMapart, clearColorCache, unpackTone, unpackCandidateIdx } from '../mapartProcessing';

const PALETTE_MULTI = {
    4:  'minecraft:stone',
    8:  'minecraft:dirt',
    17: 'minecraft:oak_log',
    49: 'minecraft:obsidian',
    1:  'minecraft:grass_block',
    12: 'minecraft:white_wool',
    30: 'minecraft:red_wool'
};

function makeGradientImage(w: number, h: number): ImageData {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        const v = Math.round((i / (w * h - 1)) * 255);
        data[i * 4]     = v;
        data[i * 4 + 1] = Math.round(v * 0.75);
        data[i * 4 + 2] = Math.round(255 - v * 0.45);
        data[i * 4 + 3] = 255;
    }
    return new ImageData(data, w, h);
}

describe('Hotpath Regression Tests (512x512)', () => {
    beforeEach(() => {
        clearColorCache();
    });

    it('TC1: 2D None - compute baseline checksums', () => {
        const img = makeGradientImage(512, 512);
        const result = processMapart(img, '2d', PALETTE_MULTI, 50, 'none', true, 50, false);
        
        let toneCheck = 0;
        let indicesCheck = 0;
        for (let i = 0; i < result.packedResults.length; i++) {
            toneCheck += unpackTone(result.packedResults[i]);
            indicesCheck += unpackCandidateIdx(result.packedResults[i]);
        }
        
        console.log('[REGRESSION 2D NONE] Tone Checksum:', toneCheck);
        console.log('[REGRESSION 2D NONE] Indices Checksum:', indicesCheck);
        
        expect(toneCheck).toBe(0);
        expect(indicesCheck).toBe(818814);
        expect(result.packedResults.length).toBe(512 * 512);
    });

    it('TC2: 3D Valley + Floyd-Steinberg - compute baseline checksums', () => {
        const img = makeGradientImage(512, 512);
        const result = processMapart(img, '3d_valley', PALETTE_MULTI, 50, 'floyd-steinberg', true, 50, false);
        
        let toneCheck = 0;
        let indicesCheck = 0;
        for (let i = 0; i < result.packedResults.length; i++) {
            toneCheck += unpackTone(result.packedResults[i]);
            indicesCheck += unpackCandidateIdx(result.packedResults[i]);
        }
        
        console.log('[REGRESSION 3D FLOYD] Tone Checksum:', toneCheck);
        console.log('[REGRESSION 3D FLOYD] Indices Checksum:', indicesCheck);
        
        expect(toneCheck).toBe(0);
        expect(indicesCheck).toBe(2585449);
        expect(result.packedResults.length).toBe(512 * 512);
    });

    it('TC3: 2D Ordered Dithering - compute baseline checksums', () => {
        const img = makeGradientImage(512, 512);
        const result = processMapart(img, '2d', PALETTE_MULTI, 50, 'ordered', false, 50, false);
        
        let toneCheck = 0;
        let indicesCheck = 0;
        for (let i = 0; i < result.packedResults.length; i++) {
            toneCheck += unpackTone(result.packedResults[i]);
            indicesCheck += unpackCandidateIdx(result.packedResults[i]);
        }
        
        console.log('[REGRESSION ORDERED] Tone Checksum:', toneCheck);
        console.log('[REGRESSION ORDERED] Indices Checksum:', indicesCheck);
        
        expect(toneCheck).toBe(0);
        expect(indicesCheck).toBe(888675);
        expect(result.packedResults.length).toBe(512 * 512);
    });
});
