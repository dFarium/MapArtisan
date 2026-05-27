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

    const mask = (1n << BigInt(num_bits)) - 1n;

    return {
        volume,
        mask,
        array,
        num_bits,
    };
}

// 64-bit unsigned maximum bitmask (equivalent to 0xFFFFFFFFFFFFFFFF)
// Used to wrap JavaScript BigInt operations to exactly 64 bits.
const ONE_64 = 0xFFFFFFFFFFFFFFFFn;

/**
 * Packs a value into the target index of the BitArray.
 * Mutates the underlying BigInt64Array buffer in place.
 * 
 * Handles boundary crossing: if the bit field crosses a 64-bit boundary, 
 * the value is split: the lower bits go to array[startIdx], and the upper bits go to array[endIdx].
 * 
 * Uses `& ONE_64` to simulate unsigned bit operations on JavaScript signed BigInts.
 */
export function set(bitArray: BitArray, index: number, value: number): BitArray {
    const valueBI = BigInt(value);
    const startOffset = index * bitArray.num_bits;
    const startArrIndex = startOffset >> 6; // Divide by 64 (using shift)
    const endArrIndex = ((index + 1) * bitArray.num_bits - 1) >> 6;
    const startBitOffset = BigInt(startOffset & 0x3F); // Modulo 64 (using mask)

    // Calculate shifts
    const fullValueShifted = (valueBI & bitArray.mask) << startBitOffset;
    const fullMaskShifted = bitArray.mask << startBitOffset;

    // Clear bits in the first word using the mask and then OR the new value
    const mask1 = fullMaskShifted & ONE_64;
    bitArray.array[startArrIndex] = (bitArray.array[startArrIndex] & ~mask1) | (fullValueShifted & ONE_64);

    // Handle overflow into next 64-bit word if needed
    if (startArrIndex !== endArrIndex) {
        const shiftRightAmount = 64n - startBitOffset;
        const part2Value = (valueBI & bitArray.mask) >> shiftRightAmount;
        const mask2 = bitArray.mask >> shiftRightAmount;

        bitArray.array[endArrIndex] = (bitArray.array[endArrIndex] & ~mask2) | part2Value;
    }

    return bitArray;
}

/**
 * Unpacks and retrieves a value from the target index of the BitArray.
 * Recombines split bits if the field crosses a 64-bit word boundary.
 */
export function get(bitArray: BitArray, index: number): number {
    const startOffset = index * bitArray.num_bits;
    const startArrIndex = startOffset >> 6;
    const endArrIndex = ((index + 1) * bitArray.num_bits - 1) >> 6;
    const startBitOffset = BigInt(startOffset & 0x3F);

    if (startArrIndex === endArrIndex) {
        const val = (bitArray.array[startArrIndex] >> startBitOffset) & bitArray.mask;
        return Number(val);
    } else {
        const endOffset = 64n - startBitOffset;

        // Mask negative signed BigInt values with `ONE_64` to convert them
        // to positive logical equivalents for correct right-shifting.
        const word1Unsigned = bitArray.array[startArrIndex] & ONE_64;
        const word2Unsigned = bitArray.array[endArrIndex] & ONE_64;

        const val = ((word1Unsigned >> startBitOffset) | (word2Unsigned << endOffset)) & bitArray.mask;
        return Number(val);
    }
}
