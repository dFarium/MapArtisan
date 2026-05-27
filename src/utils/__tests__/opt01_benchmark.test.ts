/**
 * Benchmark: Opt#1 — inline RGB scalars vs object creation per pixel
 *
 * Strategy: We can't restore the old code, but we can measure the ACTUAL cost
 * of object allocation by running two equivalent implementations side-by-side:
 *   - "old style": forces { r, g, b } object creation per pixel (simulated)
 *   - "new style": current implementation (inline scalars)
 *
 * We also do a large-scale processMapart timing to show the end-to-end gain.
 */

import { describe, it } from 'vitest';
import { processMapart, clearColorCache } from '../../utils/mapartProcessing';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeImageData(width: number, height: number, fill: 'noise' | 'gradient'): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        const idx = i * 4;
        if (fill === 'noise') {
            // Deterministic "noise" using a cheap LCG
            const v = (i * 1664525 + 1013904223) & 0xFFFFFF;
            data[idx]     = (v >> 16) & 0xFF;
            data[idx + 1] = (v >> 8)  & 0xFF;
            data[idx + 2] =  v        & 0xFF;
        } else {
            const v = Math.round((i / (width * height - 1)) * 255);
            data[idx] = v; data[idx + 1] = v; data[idx + 2] = v;
        }
        data[idx + 3] = 255;
    }
    return new ImageData(data, width, height);
}

function bench(label: string, iters: number, fn: () => void): { avg: number; min: number; max: number } {
    const times: number[] = [];
    for (let i = 0; i < iters; i++) {
        const t0 = performance.now();
        fn();
        times.push(performance.now() - t0);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    console.log(`[BENCH] ${label}: avg=${avg.toFixed(2)}ms  min=${min.toFixed(2)}ms  max=${max.toFixed(2)}ms  (${iters} iters)`);
    return { avg, min, max };
}

// ---------------------------------------------------------------------------
// Micro-benchmark: raw object allocation cost
// This isolates ONLY the allocation overhead of { r, g, b } per pixel.
// ---------------------------------------------------------------------------

describe('Opt#1 — allocation micro-benchmark', () => {
    const PIXEL_COUNT = 512 * 512; // 262 144 pixels

    it('[MICRO] OLD: object { r, g, b } per pixel', () => {
        bench(`OLD 512×512 pixels — object per pixel`, 5, () => {
            let sink = 0; // prevent dead-code elimination
            for (let i = 0; i < PIXEL_COUNT; i++) {
                const r = (i * 3) & 0xFF;
                const g = (i * 7) & 0xFF;
                const b = (i * 11) & 0xFF;
                // Simulate the old pattern: create an object and access its fields
                const target = {
                    r: Math.max(0, Math.min(255, r)),
                    g: Math.max(0, Math.min(255, g)),
                    b: Math.max(0, Math.min(255, b))
                };
                sink += target.r + target.g + target.b;
            }
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            sink;
        });
    });

    it('[MICRO] NEW: inline ternary clamp, no object', () => {
        bench(`NEW 512×512 pixels — inline scalars`, 5, () => {
            let sink = 0;
            for (let i = 0; i < PIXEL_COUNT; i++) {
                const r = (i * 3) & 0xFF;
                const g = (i * 7) & 0xFF;
                const b = (i * 11) & 0xFF;
                // New pattern: ternary clamp, no heap allocation
                const clampR = r < 0 ? 0 : r > 255 ? 255 : r;
                const clampG = g < 0 ? 0 : g > 255 ? 255 : g;
                const clampB = b < 0 ? 0 : b > 255 ? 255 : b;
                sink += clampR + clampG + clampB;
            }
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            sink;
        });
    });
});

// ---------------------------------------------------------------------------
// End-to-end benchmark: full processMapart at different resolutions
// ---------------------------------------------------------------------------

const PALETTE: Record<number, string | null> = {
    1: 'minecraft:stone',
    2: 'minecraft:dirt',
    4: 'minecraft:sand',
    8: 'minecraft:oak_log',
    10: 'minecraft:cobblestone',
    17: 'minecraft:spruce_log',
    49: 'minecraft:obsidian',
};

describe('Opt#1 — end-to-end processMapart benchmark', () => {

    it('[E2E] 128×128 — 2D, no dithering', () => {
        const img = makeImageData(128, 128, 'noise');
        bench('128×128  2D none', 8, () => {
            clearColorCache();
            processMapart(img, '2d', PALETTE, 50, 'none', true, 50, false);
        });
    });

    it('[E2E] 128×128 — 3D valley, floyd-steinberg', () => {
        const img = makeImageData(128, 128, 'noise');
        bench('128×128  3D floyd-steinberg', 8, () => {
            clearColorCache();
            processMapart(img, '3d_valley', PALETTE, 50, 'floyd-steinberg', true, 50, false);
        });
    });

    it('[E2E] 512×512 — 2D, no dithering  (1-map baseline)', () => {
        const img = makeImageData(512, 512, 'noise');
        bench('512×512  2D none', 5, () => {
            clearColorCache();
            processMapart(img, '2d', PALETTE, 50, 'none', true, 50, false);
        });
    });

    it('[E2E] 512×512 — 3D valley, floyd-steinberg  (worst case)', () => {
        const img = makeImageData(512, 512, 'noise');
        bench('512×512  3D floyd-steinberg', 5, () => {
            clearColorCache();
            processMapart(img, '3d_valley', PALETTE, 50, 'floyd-steinberg', true, 50, false);
        });
    });

    it('[E2E] 512×512 — ordered dithering  (uses findTwoClosestColors path)', () => {
        const img = makeImageData(512, 512, 'noise');
        bench('512×512  ordered', 5, () => {
            clearColorCache();
            processMapart(img, '2d', PALETTE, 50, 'ordered', true, 50, false);
        });
    });
});
