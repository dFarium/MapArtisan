/**
 * Litematica bit-packing utilities
 * Adapted from cartographer's litematica-bit-array.ts
 * 
 * This implementation uses mutable operations for performance
 */

export type Long = [number, number]; // [high 32 bits, low 32 bits]

export interface BitArray {
    array: Long[];
    num_bits: number;
    mask: number;
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
    const array: Long[] = [];

    for (let i = 0; i < arrayLength; i++) {
        array.push([0, 0]);
    }

    const mask = (1 << num_bits) - 1;

    return {
        volume,
        mask,
        array,
        num_bits,
    };
}

// Long arithmetic operations (treating two 32-bit ints as 64-bit long)

function longAnd(a: Long, b: Long): Long {
    return [a[0] & b[0], a[1] & b[1]];
}

function longOr(a: Long, b: Long): Long {
    return [a[0] | b[0], a[1] | b[1]];
}

function longNot(a: Long): Long {
    return [~a[0], ~a[1]];
}

function longShiftLeft(value: Long, shift: number): Long {
    if (shift === 0) return value;
    if (shift >= 64) return [0, 0];

    if (shift >= 32) {
        return [value[1] << (shift - 32), 0];
    } else {
        const high = (value[0] << shift) | (value[1] >>> (32 - shift));
        const low = value[1] << shift;
        return [high, low];
    }
}

function longShiftRight(value: Long, shift: number): Long {
    if (shift === 0) return value;
    if (shift >= 64) return [0, 0];

    if (shift >= 32) {
        return [0, value[0] >>> (shift - 32)];
    } else {
        const high = value[0] >>> shift;
        const low = (value[1] >>> shift) | (value[0] << (32 - shift));
        return [high, low];
    }
}

/**
 * Set a value in the bit array (MUTABLE - modifies array in place)
 */
export function set(bitArray: BitArray, index: number, value: number): BitArray {
    const startOffset = index * bitArray.num_bits;
    const startArrIndex = startOffset >> 6; // Divide by 64
    const endArrIndex = ((index + 1) * bitArray.num_bits - 1) >> 6;
    const startBitOffset = startOffset & 0x3F; // Modulo 64

    // Clear and set bits in first long
    bitArray.array[startArrIndex] = longOr(
        longAnd(
            bitArray.array[startArrIndex],
            longNot(longShiftLeft([0, bitArray.mask], startBitOffset))
        ),
        longShiftLeft([0, value & bitArray.mask], startBitOffset)
    );

    // Handle overflow into next long if needed
    if (startArrIndex !== endArrIndex) {
        const endOffset = 64 - startBitOffset;
        const j1 = bitArray.num_bits - endOffset;

        bitArray.array[endArrIndex] = longOr(
            longShiftRight(
                longShiftLeft(bitArray.array[endArrIndex], j1),
                j1
            ),
            longShiftRight([0, value & bitArray.mask], endOffset)
        );
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
    const startBitOffset = startOffset & 0x3F;

    if (startArrIndex === endArrIndex) {
        const shifted = longShiftRight(bitArray.array[startArrIndex], startBitOffset);
        return longAnd(shifted, [0, bitArray.mask])[1];
    } else {
        const endOffset = 64 - startBitOffset;
        const part1 = longShiftRight(bitArray.array[startArrIndex], startBitOffset);
        const part2 = longShiftLeft(bitArray.array[endArrIndex], endOffset);
        return longAnd(longOr(part1, part2), [0, bitArray.mask])[1];
    }
}
