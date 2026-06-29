import { describe, it, expect, beforeEach } from 'vitest';
import { 
    processMapart, 
    applyManualEdits, 
    suggestDitheringMode,
    clearColorCache,
    getValidColors,
    unpackCandidateIdx,
    unpackTone
} from '../index';

const PALETTE: Record<number, string | null> = {
    4: 'minecraft:stone',
    8: 'minecraft:dirt',
    17: 'minecraft:oak_log',
    49: 'minecraft:obsidian',
};

function makeTestImage(w: number, h: number): ImageData {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        const v = Math.round((i / (w * h - 1)) * 255);
        data[i * 4] = v;
        data[i * 4 + 1] = v;
        data[i * 4 + 2] = v;
        data[i * 4 + 3] = 255;
    }
    return new ImageData(data, w, h);
}

describe('Processing Pipeline - Regression Tests', () => {
    beforeEach(() => {
        clearColorCache();
    });

    it('processMapart returns expected structure', () => {
        const img = makeTestImage(64, 64);
        const result = processMapart(img, '2d', PALETTE, 50, 'none', true, 50, false);
        
        expect(result.imageData).toBeDefined();
        expect(result.imageData.width).toBe(64);
        expect(result.imageData.height).toBe(64);
        expect(result.stats).toBeDefined();
        expect(result.stats.minHeight).toBeDefined();
        expect(result.stats.maxHeight).toBeDefined();
        expect(result.stats.heightMap).toBeDefined();
        expect(result.packedResults).toBeDefined();
        expect(result.packedResults.length).toBe(64 * 64);
        expect(result.candidates).toBeDefined();
        expect(Array.isArray(result.candidates)).toBe(true);
    });

    it('processMapart 3D valley returns heightPath', () => {
        const img = makeTestImage(64, 64);
        const result = processMapart(img, '3d_valley', PALETTE, 50, 'floyd-steinberg', true, 50, false);
        
        expect(result.heightPath).toBeDefined();
        expect(result.heightPath).not.toBeNull();
        expect(result.heightPath!.length).toBe(64 * 64);
    });

    it('getValidColors returns candidates for valid palette', () => {
        const candidates = getValidColors(PALETTE, '2d');
        expect(candidates.length).toBeGreaterThan(0);
        expect(candidates[0].blockId).toBeDefined();
        expect(candidates[0].rgb).toBeDefined();
    });

    it('applyManualEdits modifies packedResults correctly', () => {
        const img = makeTestImage(32, 32);
        const baseResult = processMapart(img, '2d', PALETTE, 50, 'none', true, 50, false);
        
        const manualEdits = {
            0: { blockId: 'minecraft:stone', brightness: 'normal' as const, rgb: { r: 128, g: 128, b: 128 } }
        };
        
        const editResult = applyManualEdits(
            baseResult.imageData,
            baseResult.packedResults,
            manualEdits,
            '2d',
            baseResult.candidates
        );
        
        expect(editResult.imageData).toBeDefined();
        expect(editResult.packedResults).toBeDefined();
        expect(editResult.stats).toBeDefined();
    });

    it('suggestDitheringMode returns valid mode', () => {
        const img = makeTestImage(64, 64);
        const suggestion = suggestDitheringMode(img);
        
        expect(['none', 'ordered', 'floyd-steinberg', 'hybrid']).toContain(suggestion.mode);
        expect(suggestion.strength).toBeGreaterThanOrEqual(0);
        expect(suggestion.strength).toBeLessThanOrEqual(100);
    });

    it('packPixel/unpack roundtrip for pipeline data', () => {
        const img = makeTestImage(16, 16);
        const result = processMapart(img, '3d_valley', PALETTE, 50, 'none', true, 50, false);
        
        for (let i = 0; i < Math.min(100, result.packedResults.length); i++) {
            const packed = result.packedResults[i];
            const candidateIdx = unpackCandidateIdx(packed);
            const tone = unpackTone(packed);
            
            expect(candidateIdx).toBeGreaterThanOrEqual(0);
            expect(candidateIdx).toBeLessThan(result.candidates.length);
            expect([-1, 0, 1]).toContain(tone);
        }
    });
});
