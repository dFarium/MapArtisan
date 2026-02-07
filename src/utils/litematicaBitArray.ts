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
 * Create a new bit array for Litematica
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

const ONE_64 = 0xFFFFFFFFFFFFFFFFn;

/**
 * Set a value in the bit array (MUTABLE - modifies array in place)
 */
export function set(bitArray: BitArray, index: number, value: number): BitArray {
    const valueBI = BigInt(value);
    const startOffset = index * bitArray.num_bits;
    const startArrIndex = startOffset >> 6; // Divide by 64
    const endArrIndex = ((index + 1) * bitArray.num_bits - 1) >> 6;
    const startBitOffset = BigInt(startOffset & 0x3F); // Modulo 64

    // Calculate shifts
    const fullValueShifted = (valueBI & bitArray.mask) << startBitOffset;
    const fullMaskShifted = bitArray.mask << startBitOffset;

    // Update first word
    // We clear bits using the mask and then OR the new value
    // We must handle 64-bit wrapping manually for the mask inversion logic if we were using ~
    // But since we use BigInts, ~ works on infinite bits.
    // To clear bits in 64-bit word: word & ~(mask)
    // We restrict mask to 64 bits: mask & ONE_64

    const mask1 = fullMaskShifted & ONE_64;
    bitArray.array[startArrIndex] = (bitArray.array[startArrIndex] & ~mask1) | (fullValueShifted & ONE_64);

    // Handle overflow into next long if needed
    if (startArrIndex !== endArrIndex) {
        const shiftRightAmount = 64n - startBitOffset;
        const part2Value = (valueBI & bitArray.mask) >> shiftRightAmount;
        const mask2 = bitArray.mask >> shiftRightAmount;

        bitArray.array[endArrIndex] = (bitArray.array[endArrIndex] & ~mask2) | part2Value;
    }

    return bitArray;
}

/**
 * Get a value from the bit array
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

        // Combine and mask
        // Note: BigInt shifts on signed numbers fill with sign bit?
        // Right shift: Yes (arithmetic). Left shift: adds zeros.
        // To avoid sign extension issues with right shift on negative numbers (if high bit set), 
        // we should mask `bitArray.array[startArrIndex]` with `ONE_64` (conceptually unsigned) before shifting?
        // Yes, `BigInt.asUintN(64, ...)` or `& ONE_64`.
        // `& ONE_64` converts negative BigInt to positive BigInt with same bits (for subsequent ops).

        const word1Unsigned = bitArray.array[startArrIndex] & ONE_64;
        const word2Unsigned = bitArray.array[endArrIndex] & ONE_64;

        const val = ((word1Unsigned >> startBitOffset) | (word2Unsigned << endOffset)) & bitArray.mask;
        return Number(val);
    }
}
