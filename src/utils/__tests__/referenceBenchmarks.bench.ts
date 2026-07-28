import { describe, expect, it } from 'vitest';
import { clearColorCache, clearOklabCache, processMapart, type BuildMode } from '../processing';
import { MAX_MAPS_TOTAL } from '../memory';

const MAP_EDGE = 128;
const MAX_GRID = { x: 16, y: 8 } as const;

function makeImageData(width: number, height: number): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let pixel = 0; pixel < width * height; pixel++) {
        const offset = pixel * 4;
        data[offset] = pixel % 256;
        data[offset + 1] = (pixel * 2) % 256;
        data[offset + 2] = (pixel * 3) % 256;
        data[offset + 3] = 255;
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

function runReference(width: number, height: number, buildMode: BuildMode) {
    clearColorCache();
    clearOklabCache();
    const image = makeImageData(width, height);
    const start = performance.now();
    const result = processMapart(image, buildMode, palette, 100, 'hybrid', true, 50, false);
    return { result, duration: performance.now() - start };
}

describe('processing reference benchmarks', () => {
    it('128×128 (1×1 map)', () => {
        const { result, duration } = runReference(128, 128, '3d_valley');
        console.log(`[reference] 128×128 3D: ${duration.toFixed(1)}ms`);

        expect(result.packedResults).toHaveLength(128 * 128);
        expect(result.stats.heightMap).toHaveLength(128);
        expect(duration).toBeLessThan(1_000);
    });

    it('512×512 (4×4 maps)', () => {
        const { result, duration } = runReference(512, 512, '3d_valley');
        console.log(`[reference] 512×512 3D: ${duration.toFixed(1)}ms`);

        expect(result.packedResults).toHaveLength(512 * 512);
        expect(result.stats.heightMap).toHaveLength(512);
        expect(duration).toBeLessThan(5_000);
    });

    it('uses a representative maximum workload of 128 maps (16×8)', () => {
        expect(MAX_GRID.x * MAX_GRID.y).toBe(MAX_MAPS_TOTAL);
        const width = MAX_GRID.x * MAP_EDGE;
        const height = MAX_GRID.y * MAP_EDGE;
        const { result, duration } = runReference(width, height, '3d_valley');
        console.log(`[reference] ${width}×${height} 3D (${MAX_MAPS_TOTAL} maps): ${duration.toFixed(1)}ms`);

        expect(result.packedResults).toHaveLength(width * height);
        expect(result.stats.heightMap).toHaveLength(width);
        expect(duration).toBeLessThan(30_000);
    }, 30_000);

    it('512×512 in 2D mode', () => {
        const { result, duration } = runReference(512, 512, '2d');
        console.log(`[reference] 512×512 2D: ${duration.toFixed(1)}ms`);

        expect(result.packedResults).toHaveLength(512 * 512);
        expect(result.heightPath).toBeNull();
        expect(result.toneMap).toBeNull();
        expect(duration).toBeLessThan(5_000);
    });
});
