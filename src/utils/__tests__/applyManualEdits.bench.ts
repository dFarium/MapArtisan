import { describe, it } from 'vitest';
import { performance } from 'perf_hooks';
import { processMapart, applyManualEdits, clearColorCache } from '../processing';
import type { BuildMode, BrightnessLevel, RGB } from '../../types/mapart';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ImageData: CanvasImageData } = require('canvas');

function makeImageData(width: number, height: number): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        const idx = i * 4;
        const v = (i * 1664525 + 1013904223) & 0xFFFFFF;
        data[idx] = (v >> 16) & 0xFF;
        data[idx + 1] = (v >> 8) & 0xFF;
        data[idx + 2] = v & 0xFF;
        data[idx + 3] = 255;
    }
    return new CanvasImageData(data, width, height);
}

function runBench(iters: number, fn: () => void): { avg: number; min: number; max: number; stdDev: number } {
    for (let i = 0; i < 3; i++) fn();

    const times: number[] = [];
    for (let i = 0; i < iters; i++) {
        const t0 = performance.now();
        fn();
        times.push(performance.now() - t0);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    const variance = times.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / times.length;
    const stdDev = Math.sqrt(variance);

    return { avg, min, max, stdDev };
}

const PALETTE: Record<number, string | null> = {
    1: 'minecraft:stone',
    2: 'minecraft:dirt',
    4: 'minecraft:sand',
    8: 'minecraft:oak_log',
    10: 'minecraft:cobblestone',
    17: 'minecraft:spruce_log',
    49: 'minecraft:obsidian',
};

function makeEdits(count: number, width: number, height: number): Record<number, { blockId: string; brightness: BrightnessLevel; rgb: RGB }> {
    const edits: Record<number, { blockId: string; brightness: BrightnessLevel; rgb: RGB }> = {};
    const step = Math.max(1, Math.floor((width * height) / count));
    for (let i = 0; i < count; i++) {
        const idx = i * step;
        edits[idx] = {
            blockId: 'minecraft:stone',
            brightness: 'normal',
            rgb: { r: 128, g: 128, b: 128 }
        };
    }
    return edits;
}

describe('applyManualEdits Performance Benchmarks', () => {
    it('measures applyManualEdits: WITHOUT toneMap cache vs WITH toneMap cache (512x512)', () => {
        const width = 512;
        const height = 512;
        const img = makeImageData(width, height);
        const buildMode: BuildMode = '3d_valley';

        clearColorCache();
        const baseResult = processMapart(img, buildMode, PALETTE, 50, 'floyd-steinberg', true, 50, false);

        const editCounts = [1, 10, 100, 1000];
        const iters = 10;

        console.log('\n================================================================');
        console.log('     applyManualEdits BENCHMARK (512x512, 3d_valley, FS)       ');
        console.log('================================================================');
        console.log(`Image: ${width}x${height} (${(width * height).toLocaleString()} pixels)`);
        console.log(`Iterations per scenario: ${iters}`);
        console.log('----------------------------------------------------------------');
        console.log('Edits | WITHOUT cache (ms) | WITH cache (ms) | Improvement');
        console.log('------|--------------------|-----------------|------------');

        for (const count of editCounts) {
            const edits = makeEdits(count, width, height);

            // WITHOUT toneMap cache (full rebuild)
            const withoutCache = runBench(iters, () => {
                applyManualEdits(baseResult.imageData, baseResult.packedResults, edits, buildMode, baseResult.candidates, null);
            });

            // WITH toneMap cache (incremental)
            const withCache = runBench(iters, () => {
                applyManualEdits(baseResult.imageData, baseResult.packedResults, edits, buildMode, baseResult.candidates, baseResult.toneMap);
            });

            const improvement = ((withoutCache.avg - withCache.avg) / withoutCache.avg * 100);

            console.log(
                `${String(count).padStart(5)} | ${withoutCache.avg.toFixed(3).padStart(18)} | ${withCache.avg.toFixed(3).padStart(15)} | ${improvement.toFixed(1).padStart(9)}%`
            );
        }

        console.log('================================================================\n');
    }, 60000);
});
