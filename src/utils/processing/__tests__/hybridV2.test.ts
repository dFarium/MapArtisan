import { describe, expect, it } from 'vitest';
import {
    buildHybridV2ActivityMap,
    hybridV2ErrorScale,
} from '../dithering';
import { processMapart } from '../pipeline';

const PALETTE = {
    1: 'minecraft:grass_block',
    4: 'minecraft:stone',
    30: 'minecraft:red_wool',
};

function source(width: number, height: number): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < width * height; index++) {
        data[index * 4] = (index * 17) & 0xff;
        data[index * 4 + 1] = (index * 31 + 47) & 0xff;
        data[index * 4 + 2] = (index * 13 + 101) & 0xff;
        data[index * 4 + 3] = 255;
    }
    return new ImageData(data, width, height);
}

describe('Hybrid V2', () => {
    it('keeps activity inside independent 128x128 sections', () => {
        const width = 129;
        const data = new Uint8ClampedArray(width * 4);
        for (let x = 0; x < width; x++) {
            const value = x < 128 ? 0 : 255;
            data[x * 4] = value;
            data[x * 4 + 1] = value;
            data[x * 4 + 2] = value;
            data[x * 4 + 3] = 255;
        }

        const continuous = buildHybridV2ActivityMap(data, width, 1, false);
        const independent = buildHybridV2ActivityMap(data, width, 1, true);

        expect(continuous[127]).toBeGreaterThan(0);
        expect(continuous[128]).toBeGreaterThan(0);
        expect(independent[127]).toBe(0);
        expect(independent[128]).toBe(0);
    });

    it('has bounded monotonic and continuous diffusion weights', () => {
        const flatLowError = hybridV2ErrorScale(0, 100, 100, 100, 100, 100, 100, 0);
        const flatHighError = hybridV2ErrorScale(0, 200, 200, 200, 100, 100, 100, 0);
        const detailed = hybridV2ErrorScale(0xffff, 100, 100, 100, 100, 100, 100, 0);
        expect(flatLowError).toBe(0);
        expect(flatHighError).toBeGreaterThan(flatLowError);
        expect(detailed).toBe(1);

        const strengths = [0, 25, 50, 75, 100].map(strength =>
            hybridV2ErrorScale(20_000, 140, 120, 100, 100, 100, 100, strength)
        );
        expect(strengths.every((value, index) => value >= 0 && value <= 1
            && (index === 0 || value >= strengths[index - 1]))).toBe(true);
        expect(strengths.at(-1)).toBe(1);

        const below = hybridV2ErrorScale(10_000, 118.25, 100, 100, 100, 100, 100, 40);
        const above = hybridV2ErrorScale(10_000, 118.26, 100, 100, 100, 100, 100, 40);
        expect(Math.abs(above - below)).toBeLessThan(0.001);
    });

    it('is byte-identical to Floyd-Steinberg at 100% strength', () => {
        const image = source(24, 16);
        const floyd = processMapart(image, '2d', PALETTE, 100, 'floyd-steinberg', true, 50, false);
        const hybrid = processMapart(image, '2d', PALETTE, 100, 'hybrid-v2', true, 100, false);

        expect(hybrid.imageData.data).toEqual(floyd.imageData.data);
        expect(hybrid.packedResults).toEqual(floyd.packedResults);
    });

    it('makes adjacent independent maps identical to separate processing', () => {
        const combinedSource = source(256, 128);
        const combined = processMapart(
            combinedSource, '2d', PALETTE, 100, 'hybrid-v2', false, 50, true
        );

        for (let section = 0; section < 2; section++) {
            const sectionData = new Uint8ClampedArray(128 * 128 * 4);
            for (let y = 0; y < 128; y++) {
                const sourceStart = (y * 256 + section * 128) * 4;
                sectionData.set(
                    combinedSource.data.subarray(sourceStart, sourceStart + 128 * 4),
                    y * 128 * 4
                );
            }
            const separate = processMapart(
                new ImageData(sectionData, 128, 128),
                '2d', PALETTE, 100, 'hybrid-v2', false, 50, true
            );
            for (let y = 0; y < 128; y++) {
                const combinedPixelStart = y * 256 + section * 128;
                expect(combined.imageData.data.subarray(
                    combinedPixelStart * 4,
                    (combinedPixelStart + 128) * 4
                )).toEqual(separate.imageData.data.subarray(y * 128 * 4, (y + 1) * 128 * 4));
                expect(combined.packedResults.subarray(
                    combinedPixelStart,
                    combinedPixelStart + 128
                )).toEqual(separate.packedResults.subarray(y * 128, (y + 1) * 128));
            }
        }
    });
});
