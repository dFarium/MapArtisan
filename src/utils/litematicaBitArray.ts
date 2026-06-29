/**
 * Litematica bit-packing utilities
 * Adapted from cartographer's litematica-bit-array.ts
 * 
 * Optimized implementation using BigInt64Array
 */

export interface BitArray {
    array: BigInt64Array;
    num_bits: number;
    mask: bigint;
    volume: number;
    uint32View?: Uint32Array;
}

/**
 * Calculate bits needed to represent palette size
 */
export const getNeededBits = (size: number): number => {
    return Math.max(Math.ceil(Math.log2(size)), 2);
};

/**
 * Allocates a new Litematica BitArray structure.
 * 
 * Litematica stores palette block index values bitpacked consecutively in a 64-bit integer array.
 * Values are stored sequentially and can cross the 64-bit boundaries between elements.
 * 
 * @param volume The total size (width * height * depth) of the region.
 * @param paletteLength The number of items in the palette (used to calculate bits needed).
 */
export function createBitArray(volume: number, paletteLength: number): BitArray {
    const num_bits = getNeededBits(paletteLength);
    const arrayLength = Math.ceil((volume * num_bits) / 64);
    const array = new BigInt64Array(arrayLength);
    const uint32View = new Uint32Array(array.buffer);

    const mask = (1n << BigInt(num_bits)) - 1n;

    return {
        volume,
        mask,
        array,
        num_bits,
        uint32View,
    };
}

/**
 * Packs a value into the target index of the BitArray.
 * Mutates the underlying BigInt64Array buffer in place.
 * 
 * Handles boundary crossing using a fast 32-bit Uint32Array view to avoid slow BigInt operations.
 */
export function set(bitArray: BitArray, index: number, value: number): BitArray {
    if (!bitArray.uint32View) {
        bitArray.uint32View = new Uint32Array(bitArray.array.buffer);
    }
    const uint32View = bitArray.uint32View;
    const num_bits = bitArray.num_bits;
    const mask = (1 << num_bits) - 1;

    const startOffset = index * num_bits;
    const wordIdx = startOffset >>> 5;
    const bitOffset = startOffset & 31;

    if (bitOffset + num_bits <= 32) {
        const maskShifted = mask << bitOffset;
        uint32View[wordIdx] = (uint32View[wordIdx] & ~maskShifted) | ((value & mask) << bitOffset);
    } else {
        const bitsForFirstWord = 32 - bitOffset;
        uint32View[wordIdx] = (uint32View[wordIdx] & ~(mask << bitOffset)) | ((value & mask) << bitOffset);
        uint32View[wordIdx + 1] = (uint32View[wordIdx + 1] & ~(mask >>> bitsForFirstWord)) | ((value & mask) >>> bitsForFirstWord);
    }

    return bitArray;
}

/**
 * Unpacks and retrieves a value from the target index of the BitArray.
 * Recombines split bits using a fast 32-bit Uint32Array view.
 */
export function get(bitArray: BitArray, index: number): number {
    if (!bitArray.uint32View) {
        bitArray.uint32View = new Uint32Array(bitArray.array.buffer);
    }
    const uint32View = bitArray.uint32View;
    const num_bits = bitArray.num_bits;
    const mask = (1 << num_bits) - 1;

    const startOffset = index * num_bits;
    const wordIdx = startOffset >>> 5;
    const bitOffset = startOffset & 31;

    if (bitOffset + num_bits <= 32) {
        return (uint32View[wordIdx] >>> bitOffset) & mask;
    } else {
        const bitsForFirstWord = 32 - bitOffset;
        const val = (uint32View[wordIdx] >>> bitOffset) | (uint32View[wordIdx + 1] << bitsForFirstWord);
        return val & mask;
    }
}

/**
 * Batches setting multiple values in the BitArray directly from coordinates and indices buffers.
 */
export function setBatch(
    bitArray: BitArray,
    x: Int32Array,
    y: Int32Array,
    z: Int32Array,
    paletteIndices: Uint32Array,
    count: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    paletteMap: Uint32Array
): BitArray {
    if (!bitArray.uint32View) {
        bitArray.uint32View = new Uint32Array(bitArray.array.buffer);
    }
    const uint32View = bitArray.uint32View;
    const num_bits = bitArray.num_bits;
    const mask = (1 << num_bits) - 1;

    // Detect if paletteMap is a simple identity mapping (i -> i)
    let isIdentity = true;
    for (let i = 0; i < paletteMap.length; i++) {
        if (paletteMap[i] !== i) {
            isIdentity = false;
            break;
        }
    }

    if (isIdentity) {
        for (let i = 0; i < count; i++) {
            const bx = x[i];
            const by = y[i];
            const bz = z[i];
            if (bx < 0 || bx >= maxX || by < 0 || by >= maxY || bz < 0 || bz >= maxZ) {
                continue;
            }

            const paletteIndex = paletteIndices[i];

            // Calculate linear index: (y * maxZ + z) * maxX + x
            const index = (by * maxZ + bz) * maxX + bx;

            const startOffset = index * num_bits;
            const wordIdx = startOffset >>> 5;
            const bitOffset = startOffset & 31;

            if (bitOffset + num_bits <= 32) {
                const maskShifted = mask << bitOffset;
                uint32View[wordIdx] = (uint32View[wordIdx] & ~maskShifted) | ((paletteIndex & mask) << bitOffset);
            } else {
                const bitsForFirstWord = 32 - bitOffset;
                uint32View[wordIdx] = (uint32View[wordIdx] & ~(mask << bitOffset)) | ((paletteIndex & mask) << bitOffset);
                uint32View[wordIdx + 1] = (uint32View[wordIdx + 1] & ~(mask >>> bitsForFirstWord)) | ((paletteIndex & mask) >>> bitsForFirstWord);
            }
        }
    } else {
        for (let i = 0; i < count; i++) {
            const bx = x[i];
            const by = y[i];
            const bz = z[i];
            if (bx < 0 || bx >= maxX || by < 0 || by >= maxY || bz < 0 || bz >= maxZ) {
                continue;
            }

            const localPaletteIndex = paletteIndices[i];
            const paletteIndex = paletteMap[localPaletteIndex];

            // Calculate linear index: (y * maxZ + z) * maxX + x
            const index = (by * maxZ + bz) * maxX + bx;

            const startOffset = index * num_bits;
            const wordIdx = startOffset >>> 5;
            const bitOffset = startOffset & 31;

            if (bitOffset + num_bits <= 32) {
                const maskShifted = mask << bitOffset;
                uint32View[wordIdx] = (uint32View[wordIdx] & ~maskShifted) | ((paletteIndex & mask) << bitOffset);
            } else {
                const bitsForFirstWord = 32 - bitOffset;
                uint32View[wordIdx] = (uint32View[wordIdx] & ~(mask << bitOffset)) | ((paletteIndex & mask) << bitOffset);
                uint32View[wordIdx + 1] = (uint32View[wordIdx + 1] & ~(mask >>> bitsForFirstWord)) | ((paletteIndex & mask) >>> bitsForFirstWord);
            }
        }
    }

    return bitArray;
}

