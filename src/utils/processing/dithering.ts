/**
 * Dithering Configuration and Utilities
 * Contains dithering matrices, modes, and variance analysis
 */

// ============================================================================
// Types
// ============================================================================

export type DitheringMode =
    | 'none'
    | 'floyd-steinberg'
    | 'atkinson'
    | 'stucki'
    | 'burkes'
    | 'sierra-lite'
    | 'ordered'
    | 'ordered-8x8'
    | 'adaptive'
    | 'hybrid';

export interface DitherMatrix {
    divisor: number;
    // Matrix rows: [row0, row1, row2] where each row is [col-2, col-1, col0, col+1, col+2]
    // Position [0][2] is current pixel (always 0), error distributed to right and below
    matrix: number[][];
}

// ============================================================================
// Dithering Matrices
// ============================================================================

export const DITHER_MATRICES: Record<string, DitherMatrix> = {
    'floyd-steinberg': {
        divisor: 16,
        matrix: [
            [0, 0, 0, 7, 0],
            [0, 3, 5, 1, 0],
            [0, 0, 0, 0, 0]
        ]
    },
    'atkinson': {
        divisor: 8,
        matrix: [
            [0, 0, 0, 1, 1],
            [0, 1, 1, 1, 0],
            [0, 0, 1, 0, 0]
        ]
    },
    'stucki': {
        divisor: 42,
        matrix: [
            [0, 0, 0, 8, 4],
            [2, 4, 8, 4, 2],
            [1, 2, 4, 2, 1]
        ]
    },
    'burkes': {
        divisor: 32,
        matrix: [
            [0, 0, 0, 8, 4],
            [2, 4, 8, 4, 2],
            [0, 0, 0, 0, 0]
        ]
    },
    'sierra-lite': {
        divisor: 4,
        matrix: [
            [0, 0, 0, 2, 0],
            [0, 1, 1, 0, 0],
            [0, 0, 0, 0, 0]
        ]
    }
};

// Bayer 4x4 threshold matrix for ordered dithering (values 1-16)
export const BAYER_4X4 = [
    [1, 9, 3, 11],
    [13, 5, 15, 7],
    [4, 12, 2, 10],
    [16, 8, 14, 6]
];

// Bayer 8x8 threshold matrix for ordered dithering (values 1-64)
export const BAYER_8X8 = [
    [1, 49, 13, 61, 4, 52, 16, 64],
    [33, 17, 45, 29, 36, 20, 48, 32],
    [9, 57, 5, 53, 12, 60, 8, 56],
    [41, 25, 37, 21, 44, 28, 40, 24],
    [3, 51, 15, 63, 2, 50, 14, 62],
    [35, 19, 47, 31, 34, 18, 46, 30],
    [11, 59, 7, 55, 10, 58, 6, 54],
    [43, 27, 39, 23, 42, 26, 38, 22]
];

// ============================================================================
// Hybrid Dithering - Local Variance Analysis
// ============================================================================

/**
 * Calculate local variance in a 3x3 window around a pixel.
 * Returns the sum of squared differences from the center pixel.
 */
export function calculateLocalVariance(
    floatBuffer: Float32Array,
    x: number,
    y: number,
    width: number,
    height: number
): number {
    const centerIdx = (y * width + x) * 3;
    const centerR = floatBuffer[centerIdx];
    const centerG = floatBuffer[centerIdx + 1];
    const centerB = floatBuffer[centerIdx + 2];

    let variance = 0;
    let count = 0;

    for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny >= 0 && ny < height) {
            const nyOffset = ny * width;
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;

                const nx = x + dx;
                if (nx >= 0 && nx < width) {
                    const nIdx = (nyOffset + nx) * 3;
                    const dr = floatBuffer[nIdx] - centerR;
                    const dg = floatBuffer[nIdx + 1] - centerG;
                    const db = floatBuffer[nIdx + 2] - centerB;
                    variance += dr * dr + dg * dg + db * db;
                    count++;
                }
            }
        }
    }

    return count > 0 ? variance / count : 0;
}

// ============================================================================
// Flat Dither Kernel Optimization
// ============================================================================

export interface FlatDitherKernel {
    offsets: Int32Array;
    weights: Float32Array;
    dx: Int8Array;
    dy: Int8Array;
    count: number;
}

export function buildFlatDitherKernel(ditherMatrix: DitherMatrix, width: number): FlatDitherKernel {
    const matrix = ditherMatrix.matrix;
    const divisor = ditherMatrix.divisor;

    let count = 0;
    for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
            if (matrix[r][c] !== 0) count++;
        }
    }

    const offsets = new Int32Array(count);
    const weights = new Float32Array(count);
    const dx = new Int8Array(count);
    const dy = new Int8Array(count);

    let idx = 0;
    for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
            const weight = matrix[r][c];
            if (weight === 0) continue;

            const curDx = c - 2;
            const curDy = r;

            dx[idx] = curDx;
            dy[idx] = curDy;
            offsets[idx] = (curDy * width + curDx) * 3;
            weights[idx] = weight / divisor;
            idx++;
        }
    }

    return { offsets, weights, dx, dy, count };
}
