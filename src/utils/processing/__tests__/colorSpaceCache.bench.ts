import { describe, expect, it } from 'vitest';
import {
    clearLabCache,
    getLabCacheSize,
    LAB_CACHE_MAX_ENTRIES,
    rgbToLab,
} from '../colorSpace';

describe('OKLab cache long-session benchmark', () => {
    it('keeps cache memory bounded across twenty 512x512-equivalent passes', () => {
        clearLabCache();
        const pixelsPerPass = 512 * 512;
        const passes = 20;
        const start = performance.now();

        for (let pass = 0; pass < passes; pass++) {
            for (let pixel = 0; pixel < pixelsPerPass; pixel++) {
                const color = (pass * pixelsPerPass + pixel) & 0xFFFFFF;
                rgbToLab(color & 0xFF, (color >> 8) & 0xFF, (color >> 16) & 0xFF);
            }
        }

        const durationMs = performance.now() - start;
        console.log(
            `[OKLab cache] ${passes}x 512x512 passes in ${durationMs.toFixed(1)}ms; ` +
            `${getLabCacheSize()} / ${LAB_CACHE_MAX_ENTRIES} cached colors`
        );

        expect(getLabCacheSize()).toBeLessThanOrEqual(LAB_CACHE_MAX_ENTRIES);
        expect(durationMs).toBeLessThan(10_000);
    });
});
