import { describe, it, expect, vi } from 'vitest';
import type { BuildMode, DitheringMode } from '../../utils/mapartProcessing';

// Mock comlink to avoid side effects during import
vi.mock('comlink', () => ({
    expose: vi.fn(),
    wrap: vi.fn(),
    transfer: vi.fn((obj) => obj), // Passthrough
}));

// Import the worker API AFTER mocking
import { mapartWorkerApi } from '../mapart.worker';

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
        // We need to copy it because the worker might transfer/neuter it (in real life)
        // But here we are calling the function directly.
        // The function `processMapart` implementation in worker:
        // const imageData = new ImageData(new Uint8ClampedArray(imageDataBuffer), width, height);
        // It reads from buffer.

        const buildMode: BuildMode = 'staircase';
        const palette: Record<number, string | null> = {
            1: 'stone', // Example ID
            2: 'dirt'
        };
        const threeDPrecision = 80;
        const dithering: DitheringMode = 'floyd-steinberg';
        const useCielab = true;

        // First run
        const result1 = await mapartWorkerApi.processMapart(
            inputBuffer.slice(0), // Pass a copy
            width,
            height,
            buildMode,
            palette,
            threeDPrecision,
            dithering,
            useCielab
        );

        // Second run
        const result2 = await mapartWorkerApi.processMapart(
            inputBuffer.slice(0), // Pass a copy
            width,
            height,
            buildMode,
            palette,
            threeDPrecision,
            dithering,
            useCielab
        );

        // Assertions
        expect(result1.stats).toEqual(result2.stats);
        expect(result1.toneMap).toEqual(result2.toneMap);
        expect(result1.needsSupportMap).toEqual(result2.needsSupportMap);

        // Verify that imageData is empty as expected from the new optimization
        expect(result1.imageData.byteLength).toBe(0);
    });
});
