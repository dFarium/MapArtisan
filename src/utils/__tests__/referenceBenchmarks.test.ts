import { describe, it, expect } from 'vitest';
import { processMapart, clearColorCache } from '../processing';

/**
 * Reference benchmarks for MapArtisan processing pipeline.
 *
 * These tests establish baseline performance metrics for the core
 * `processMapart()` function at standard grid sizes.
 *
 * Run with: `npx vitest run src/utils/__tests__/referenceBenchmarks.ts`
 */

function makeImageData(width: number, height: number): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = (i / 4) % 256;
        data[i + 1] = ((i / 4) * 2) % 256;
        data[i + 2] = ((i / 4) * 3) % 256;
        data[i + 3] = 255;
    }
    return new ImageData(data, width, height);
}

const palette: Record<number, string | null> = {
    0: 'minecraft:white_wool',
    1: 'minecraft:black_wool',
    2: 'minecraft:red_wool',
    3: 'minecraft:green_wool',
    4: 'minecraft:blue_wool',
};

describe('Reference Benchmarks', () => {
    it('128×128 (1×1 map) — baseline', () => {
        clearColorCache();
        const img = makeImageData(128, 128);
        const start = performance.now();
        const result = processMapart(img, '3d_valley', palette, 100, 'hybrid', true, 50, false);
        const duration = performance.now() - start;

        console.log(`[Benchmark] 128×128 (1×1 map): ${duration.toFixed(1)}ms`);
        console.log(`  Stats: minHeight=${result.stats.minHeight}, maxHeight=${result.stats.maxHeight}`);
        console.log(`  Candidates: ${result.candidates.length}`);
        console.log(`  Packed results: ${result.packedResults.length} pixels`);

        expect(result.packedResults.length).toBe(128 * 128);
        expect(result.stats.heightMap.length).toBe(128);
        expect(duration).toBeLessThan(500);
    });

    it('512×512 (4×4 maps) — medium grid', () => {
        clearColorCache();
        const img = makeImageData(512, 512);
        const start = performance.now();
        const result = processMapart(img, '3d_valley', palette, 100, 'hybrid', true, 50, false);
        const duration = performance.now() - start;

        console.log(`[Benchmark] 512×512 (4×4 maps): ${duration.toFixed(1)}ms`);
        console.log(`  Stats: minHeight=${result.stats.minHeight}, maxHeight=${result.stats.maxHeight}`);
        console.log(`  Candidates: ${result.candidates.length}`);
        console.log(`  Packed results: ${result.packedResults.length} pixels`);

        expect(result.packedResults.length).toBe(512 * 512);
        expect(result.stats.heightMap.length).toBe(512);
        expect(duration).toBeLessThan(5000);
    });

    it('1024×1024 (8×8 maps, max supported) — large grid', () => {
        clearColorCache();
        const img = makeImageData(1024, 1024);
        const start = performance.now();
        const result = processMapart(img, '3d_valley', palette, 100, 'hybrid', true, 50, false);
        const duration = performance.now() - start;

        console.log(`[Benchmark] 1024×1024 (8×8 maps, max): ${duration.toFixed(1)}ms`);
        console.log(`  Stats: minHeight=${result.stats.minHeight}, maxHeight=${result.stats.maxHeight}`);
        console.log(`  Candidates: ${result.candidates.length}`);
        console.log(`  Packed results: ${result.packedResults.length} pixels`);

        expect(result.packedResults.length).toBe(1024 * 1024);
        expect(result.stats.heightMap.length).toBe(1024);
        expect(duration).toBeLessThan(20000);
    });

    it('2D mode comparison (512×512)', () => {
        clearColorCache();
        const img = makeImageData(512, 512);
        const start = performance.now();
        const result = processMapart(img, '2d', palette, 100, 'hybrid', true, 50, false);
        const duration = performance.now() - start;

        console.log(`[Benchmark] 512×512 (2D mode): ${duration.toFixed(1)}ms`);
        console.log(`  Stats: minHeight=${result.stats.minHeight}, maxHeight=${result.stats.maxHeight}`);
        console.log(`  heightPath: ${result.heightPath === null ? 'null (expected for 2D)' : 'unexpected'}`);
        console.log(`  toneMap: ${result.toneMap === null ? 'null (expected for 2D)' : 'unexpected'}`);

        expect(result.packedResults.length).toBe(512 * 512);
        expect(result.heightPath).toBeNull();
        expect(result.toneMap).toBeNull();
        expect(duration).toBeLessThan(3000);
    });
});
