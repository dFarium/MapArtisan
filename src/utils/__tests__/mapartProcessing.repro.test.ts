
import { describe, it, expect } from 'vitest';
import { processMapart } from '../mapartProcessing';

describe('mapartProcessing Idempotency', () => {
    it('produces consistent results for complex input', () => {
        // 1. Generate a determinstic pseudo-random image (128x128)
        const width = 128;
        const height = 128;
        const data = new Uint8ClampedArray(width * height * 4);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                // Periodic pattern to test dithering
                data[idx] = (Math.sin(x * 0.1) + 1) * 127;     // R
                data[idx + 1] = (Math.cos(y * 0.1) + 1) * 127; // G
                data[idx + 2] = ((x + y) % 255);               // B
                data[idx + 3] = 255;                           // A
            }
        }

        const imageData = new ImageData(data, width, height);

        // 2. Define settings
        const selectedPaletteItems = {
            4: 'minecraft:cobblestone',  // Gray
            1: 'minecraft:grass_block',  // Greenish
            12: 'minecraft:white_wool',  // White
            30: 'minecraft:red_wool'     // Red
        };

        // 3. Process with complex settings (Hybrid Dithering + 3D Valley)
        const result = processMapart(
            imageData,
            '3d_valley',
            selectedPaletteItems,
            50,        // 3D Precision
            'hybrid', // Dithering
            true,      // CIELAB
            50,        // Hybrid Strength
            false      // Independent Maps
        );

        // 4. Snapshot the key outputs
        // We use inline snapshots or hardcoded hashes/values if snapshots aren't available in this environment. 
        // For this environment, let's verify checksums/integrity.

        expect(result.imageData.width).toBe(128);
        expect(result.imageData.height).toBe(128);

        // Calculate simple checksums for result arrays
        const toneCheck = result.toneMap.reduce((acc, val) => acc + val, 0);
        const indicesCheck = result.blockIndices.reduce((acc, val) => acc + val, 0);

        console.log('Tone Checksum:', toneCheck);
        console.log('Indices Checksum:', indicesCheck);

        expect(toneCheck).toBe(-975);
        expect(indicesCheck).toBe(112750);

        expect(result.toneMap.length).toBe(128 * 128);
        expect(result.blockIndices.length).toBe(128 * 128);
    });
});
