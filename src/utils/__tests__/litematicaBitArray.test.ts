import { describe, it, expect } from 'vitest';
import * as bitArray from '../litematicaBitArray';

describe('litematicaBitArray', () => {
    it('should correctly set and get values', () => {
        const volume = 100;
        const paletteSize = 16; // Needs 4 bits
        const ba = bitArray.createBitArray(volume, paletteSize);

        // Set some values
        bitArray.set(ba, 0, 1);
        bitArray.set(ba, 1, 15);
        bitArray.set(ba, 50, 7);
        bitArray.set(ba, 99, 3);

        // Get values
        expect(bitArray.get(ba, 0)).toBe(1);
        expect(bitArray.get(ba, 1)).toBe(15);
        expect(bitArray.get(ba, 50)).toBe(7);
        expect(bitArray.get(ba, 99)).toBe(3);
    });

    it('should handle values crossing 64-bit boundaries', () => {
        // 6 bits per value. 64 and 6 have common factor 2. LCM(64, 6) = 192 bits = 3 longs = 32 values.
        // A value spans across boundary if logic is correct.
        // Let's rely on a large random fill to catch edge cases.
        const volume = 1000;
        const paletteSize = 64; // 6 bits
        const ba = bitArray.createBitArray(volume, paletteSize);

        const values = new Array(volume).fill(0).map(() => Math.floor(Math.random() * paletteSize));

        for (let i = 0; i < volume; i++) {
            bitArray.set(ba, i, values[i]);
        }

        for (let i = 0; i < volume; i++) {
            const got = bitArray.get(ba, i);
            if (got !== values[i]) {
                console.error(`Mismatch at index ${i}: expected ${values[i]}, got ${got}`);
            }
            expect(got).toBe(values[i]);
        }
    });

    it('benchmark', () => {
        const volume = 256 * 256 * 10; // Moderate size
        const paletteSize = 16;
        const ba = bitArray.createBitArray(volume, paletteSize);

        const start = performance.now();
        for (let i = 0; i < volume; i++) {
            bitArray.set(ba, i, i % paletteSize);
        }
        const end = performance.now();
        console.log(`BitArray Set (Legacy) Time: ${(end - start).toFixed(2)}ms`);

        const startGet = performance.now();
        for (let i = 0; i < volume; i++) {
            bitArray.get(ba, i);
        }
        const endGet = performance.now();
        console.log(`BitArray Get (Legacy) Time: ${(endGet - startGet).toFixed(2)}ms`);
    });
});
