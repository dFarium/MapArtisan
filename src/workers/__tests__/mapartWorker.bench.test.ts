import { describe, it, expect, vi } from 'vitest';
import type { BuildMode, DitheringMode } from '../../utils/mapartProcessing';

// Mock comlink
vi.mock('comlink', () => ({
    expose: vi.fn(),
    wrap: vi.fn(),
    transfer: vi.fn((obj) => obj),
}));

import { mapartWorkerApi } from '../mapart.worker';

describe('mapart.worker performance', () => {
    it('should process 512x512 mapart within reasonable time', async () => {
        const width = 512;
        const height = 512;
        const buffer = new Uint8ClampedArray(width * height * 4);

        // Fill with noise to ensure dithering does work
        for (let i = 0; i < width * height; i++) {
            buffer[i * 4] = Math.floor(Math.random() * 256);
            buffer[i * 4 + 1] = Math.floor(Math.random() * 256);
            buffer[i * 4 + 2] = Math.floor(Math.random() * 256);
            buffer[i * 4 + 3] = 255;
        }

        const inputBuffer = buffer.buffer;

        const buildMode: BuildMode = '3d_valley'; // Complex mode
        const palette: Record<number, string | null> = {
            1: 'stone',
            2: 'dirt',
            3: 'sand',
            4: 'cobblestone'
        };
        const threeDPrecision = 80;
        const dithering: DitheringMode = 'floyd-steinberg'; // Expensive dithering
        const useCielab = true;

        const iterations = 5;
        let totalTime = 0;

        for (let i = 0; i < iterations; i++) {
            const start = performance.now();

            await mapartWorkerApi.processMapart(
                inputBuffer.slice(0),
                width,
                height,
                buildMode,
                palette,
                threeDPrecision,
                dithering,
                useCielab
            );

            const end = performance.now();
            totalTime += (end - start);
        }

        const avgTime = totalTime / iterations;
        console.log(`Average processing time for 512x512 (3d_valley, complex dithering): ${avgTime.toFixed(2)}ms`);

        // Assert decent performance (e.g. < 1000ms on a dev machine is good target for Node.js test)
        // Adjust threshold based on environment, but 2000ms is a safe upper bound to detect major regressions.
        expect(avgTime).toBeLessThan(2000);
    });
});
