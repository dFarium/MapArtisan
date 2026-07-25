import { describe, it, expect, vi } from 'vitest';
import { unpackTone, type BuildMode, type DitheringMode } from '../../utils/processing';

// Mock comlink to avoid side effects during import
vi.mock('comlink', () => ({
    expose: vi.fn(),
    wrap: vi.fn(),
    transfer: vi.fn((obj) => obj), // Passthrough
}));

// Import the worker API AFTER mocking
import { createProcessingConfigKey, mapartWorkerApi } from '../mapart.worker';

describe('mapart.worker idempotency', () => {
    it('should produce identical results for the same input', async () => {
        const width = 128;
        const height = 128;
        // Create a simple pattern: gradient
        const buffer = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < width * height; i++) {
            buffer[i * 4] = i % 255;     // R
            buffer[i * 4 + 1] = 100;     // G
            buffer[i * 4 + 2] = 200;     // B
            buffer[i * 4 + 3] = 255;     // A
        }

        const inputBuffer = buffer.buffer;

        const buildMode: BuildMode = '3d_valley';
        const palette: Record<number, string | null> = {
            1: 'stone', // Example ID
            2: 'dirt'
        };
        const threeDPrecision = 80;
        const dithering: DitheringMode = 'floyd-steinberg';
        const usePerceptual = true;
        const version = 1;

        // First run
        const result1 = await mapartWorkerApi.processMapart(
            inputBuffer.slice(0), // Pass a copy
            width,
            height,
            version,
            buildMode,
            palette,
            threeDPrecision,
            dithering,
            usePerceptual
        );

        // Second run
        const result2 = await mapartWorkerApi.processMapart(
            inputBuffer.slice(0), // Pass a copy
            width,
            height,
            version,
            buildMode,
            palette,
            threeDPrecision,
            dithering,
            usePerceptual
        );

        // Assertions
        expect(result1.stats).toEqual(result2.stats);
        expect(result1.packedResults).toEqual(result2.packedResults);
    });

    it('includes every processing parameter in the cache key', () => {
        const baseArgs = [
            128,
            128,
            1,
            '3d_valley' as const,
            { 4: 'minecraft:stone' },
            80,
            'hybrid' as const,
            true,
            50,
            false,
        ] as const;
        const baseKey = createProcessingConfigKey(...baseArgs);

        expect(createProcessingConfigKey(...baseArgs)).toBe(baseKey);
        expect(createProcessingConfigKey(128, 128, 1, '3d_valley', { 4: 'minecraft:dirt' }, 80, 'hybrid', true, 50, false)).not.toBe(baseKey);
        expect(createProcessingConfigKey(128, 128, 1, '3d_valley', { 4: 'minecraft:stone' }, 75, 'hybrid', true, 50, false)).not.toBe(baseKey);
        expect(createProcessingConfigKey(128, 128, 1, '3d_valley', { 4: 'minecraft:stone' }, 80, 'none', true, 50, false)).not.toBe(baseKey);
        expect(createProcessingConfigKey(128, 128, 1, '3d_valley', { 4: 'minecraft:stone' }, 80, 'hybrid', false, 50, false)).not.toBe(baseKey);
        expect(createProcessingConfigKey(128, 128, 1, '3d_valley', { 4: 'minecraft:stone' }, 80, 'hybrid', true, 75, false)).not.toBe(baseKey);
        expect(createProcessingConfigKey(128, 128, 1, '3d_valley', { 4: 'minecraft:stone' }, 80, 'hybrid', true, 50, true)).not.toBe(baseKey);
    });

    it('keeps the base tone map immutable when an edit is removed', async () => {
        const width = 1;
        const height = 4;
        const pixels = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < width * height; i++) {
            pixels[i * 4] = 128;
            pixels[i * 4 + 1] = 128;
            pixels[i * 4 + 2] = 128;
            pixels[i * 4 + 3] = 255;
        }

        const base = await mapartWorkerApi.processMapart(
            pixels.buffer,
            width,
            height,
            99,
            '3d_valley',
            { 4: 'minecraft:stone' },
            100,
            'none',
            true,
            50,
            false
        );
        const baseTone = unpackTone(base.packedResults![0]);
        const editedBrightness = baseTone === 1 ? 'low' : 'high';

        await mapartWorkerApi.applyEdits({
            0: {
                blockId: 'minecraft:stone',
                brightness: editedBrightness,
                rgb: { r: 128, g: 128, b: 128 },
            },
        });
        const reverted = await mapartWorkerApi.applyEdits({});

        expect(reverted.stats).toEqual(base.stats);
        expect(reverted.heightPath).toEqual(base.heightPath);
        expect(unpackTone(reverted.packedResults[0])).toBe(baseTone);
    });

    it('releases the cached source when clearCache is requested', async () => {
        const pixels = new Uint8ClampedArray([128, 128, 128, 255]);
        await mapartWorkerApi.processMapart(
            pixels.buffer,
            1,
            1,
            123,
            '2d',
            { 4: 'minecraft:stone' },
            0,
            'none',
            true,
            50,
            false
        );

        mapartWorkerApi.clearCache();
        const result = await mapartWorkerApi.processMapart(
            null,
            1,
            1,
            123,
            '2d',
            { 4: 'minecraft:stone' },
            0,
            'none',
            true,
            50,
            false
        );

        expect(result.error).toBe('CACHE_MISS');
    });
});
