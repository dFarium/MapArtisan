import { describe, it, expect, beforeEach } from 'vitest';
import { 
    rgbToLab, 
    packPixel, 
    unpackCandidateIdx, 
    unpackTone, 
    unpackNeedsSupport,
    clearColorCache,
    clearLabCache,
    getLabCacheSize,
    LAB_CACHE_MAX_ENTRIES,
} from '../colorSpace';
import { MAPART } from '../colorConstants';

describe('Color Space - Regression Tests', () => {
    beforeEach(() => {
        clearColorCache();
        clearLabCache();
    });

    it('rgbToLab converts known colors correctly', () => {
        const black = rgbToLab(0, 0, 0);
        expect(black.L).toBeCloseTo(0, 2);
        expect(black.a).toBeCloseTo(0, 2);
        expect(black.b).toBeCloseTo(0, 2);

        const white = rgbToLab(255, 255, 255);
        expect(white.L).toBeCloseTo(1, 2);
        expect(white.a).toBeCloseTo(0, 1);
        expect(white.b).toBeCloseTo(0, 1);

        const red = rgbToLab(255, 0, 0);
        expect(red.L).toBeGreaterThan(0.5);
        expect(red.a).toBeGreaterThan(0.1);
    });

    it('packPixel/unpack roundtrip preserves data', () => {
        const candidateIdx = 42;
        const tone = -1;
        const needsSupport = true;

        const packed = packPixel(candidateIdx, tone, needsSupport);
        
        expect(unpackCandidateIdx(packed)).toBe(candidateIdx);
        expect(unpackTone(packed)).toBe(tone);
        expect(unpackNeedsSupport(packed)).toBe(needsSupport);
    });

    it('MAPART constants are accessible and valid', () => {
        expect(MAPART).toBeDefined();
        expect(MAPART.OKLAB_M1_L).toHaveLength(3);
        expect(MAPART.OKLAB_M2_L).toHaveLength(3);
        expect(MAPART.RGB_TO_LINEAR_THRESHOLD).toBeCloseTo(0.04045, 5);
    });

    it('bounds the OKLab cache without changing conversion results', () => {
        const reference = rgbToLab(12, 34, 56);
        clearLabCache();

        for (let i = 0; i <= LAB_CACHE_MAX_ENTRIES; i++) {
            rgbToLab(i & 0xFF, (i >> 8) & 0xFF, (i >> 16) & 0xFF);
        }

        expect(getLabCacheSize()).toBeLessThanOrEqual(LAB_CACHE_MAX_ENTRIES);
        expect(rgbToLab(12, 34, 56)).toEqual(reference);
    });
});
