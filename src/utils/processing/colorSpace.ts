/**
 * Color Space Utilities
 * CIELAB conversion, caching, and distance calculations
 */

import { MAPART } from '../constants';
import type { RGB } from '../../types/mapart';

// ============================================================================
// Types
// ============================================================================

export interface LAB {
    L: number;
    a: number;
    b: number;
}

// ============================================================================
// Caching System
// ============================================================================

// LAB cache: RGB binary -> LAB values
const labCache = new Map<number, LAB>();

// Color cache: RGB binary -> best candidate index (cleared per processMapart call)
const colorCache = new Map<number, number>();

/**
 * Converts an RGB color object into a single 24-bit binary integer key.
 * Used for fast lookup table indexing in color matching caches.
 */
export function rgbToBinary(rgb: RGB): number {
    return (Math.round(rgb.r) << 16) + (Math.round(rgb.g) << 8) + Math.round(rgb.b);
}

/**
 * Resets the transient query-to-candidate cache before starting a new image quantization.
 */
export function clearColorCache(): void {
    colorCache.clear();
}

/**
 * Gets reference to the active query-to-candidate cache.
 */
export function getColorCache(): Map<number, number> {
    return colorCache;
}

// ============================================================================
// Gamma LUT: sRGB -> linear RGB for all 256 integer channel values
// Built once at module load using the exact same formula as the original
// rgbToLab, eliminating Math.pow(x, 2.4) calls at runtime.
// ============================================================================

const GAMMA_LUT: Float64Array = (() => {
    const lut = new Float64Array(256);
    const THRESHOLD = MAPART.RGB_TO_LINEAR_THRESHOLD; // 0.04045
    const DIVISOR   = MAPART.RGB_TO_LINEAR_DIVISOR;   // 12.0
    const OFFSET    = MAPART.RGB_TO_LINEAR_OFFSET;    // 0.055
    const POWER     = MAPART.RGB_TO_LINEAR_POWER;     // 2.4
    for (let i = 0; i < 256; i++) {
        const v = i / 255.0;
        lut[i] = v <= THRESHOLD
            ? v / DIVISOR
            : Math.pow((v + OFFSET) / (1.0 + OFFSET), POWER);
    }
    return lut;
})();


// ============================================================================
// RGB to LAB Conversion
// ============================================================================

/**
 * Transforms an RGB color into the CIELAB (L*a*b*) color space.
 * Matches mapartcraft's behavior to output matching shade calculations.
 * 
 * Performance features:
 * 1. Uses a precomputed 256-index gamma lookup table (`GAMMA_LUT`) to bypass sRGB to linear conversion.
 * 2. Employs the native `Math.cbrt` (cube root) operation to avoid `Math.pow(x, 1/3)` overhead.
 * 3. Scales L to a 0-255 range to preserve equal weight during Euclidean distance metrics.
 */
export function rgbToLab(rgb: RGB): LAB {
    const key = rgbToBinary(rgb);
    if (labCache.has(key)) {
        return labCache.get(key)!;
    }

    // sRGB to linear RGB — LUT lookup on rounded integer index (zero Math.pow at runtime)
    const r1 = GAMMA_LUT[Math.round(rgb.r) & 0xFF];
    const g1 = GAMMA_LUT[Math.round(rgb.g) & 0xFF];
    const b1 = GAMMA_LUT[Math.round(rgb.b) & 0xFF];

    // Linear RGB to XYZ using coefficients defined in Constants
    const { XYZ_R_COEFFS: Rc, XYZ_G_COEFFS: Gc, XYZ_B_COEFFS: Bc, XYZ_WHITE_REF: Wr } = MAPART;

    const f = (Rc[0] * r1 + Rc[1] * g1 + Rc[2] * b1) / Wr.X;
    const h = (Gc[0] * r1 + Gc[1] * g1 + Gc[2] * b1) / Wr.Y;
    const k = (Bc[0] * r1 + Bc[1] * g1 + Bc[2] * b1) / Wr.Z;

    // XYZ to Lab — Math.cbrt replaces Math.pow(x, 1/3) (native op, no Math.pow overhead)
    const { LAB_THRESHOLD: L_THRESH, LAB_FACTOR_LOW: L_FACT, LAB_OFFSET_LOW: L_OFF, LAB_DIVISOR_LOW: L_DIV } = MAPART;

    const cbrtF = L_THRESH < f ? Math.cbrt(f) : (L_FACT * f + L_OFF) / L_DIV;
    const cbrtH = L_THRESH < h ? Math.cbrt(h) : (L_FACT * h + L_OFF) / L_DIV;
    const cbrtK = L_THRESH < k ? Math.cbrt(k) : (L_FACT * k + L_OFF) / L_DIV;

    const l = cbrtH;
    const m = MAPART.LAB_A_FACTOR * (cbrtF - l);
    const n = MAPART.LAB_B_FACTOR * (l - cbrtK);

    // Scale L to 0-255 range and offset coordinates
    const lab: LAB = {
        L: MAPART.CIELAB_SCALE / 100 * (MAPART.LAB_L_FACTOR * l - MAPART.LAB_L_OFFSET) + 0.5,
        a: m + 0.5,
        b: n + 0.5
    };

    labCache.set(key, lab);
    return lab;
}

// ============================================================================
// Distance Calculations
// ============================================================================

/**
 * Calculates the standard Delta E 1976 distance between two CIELAB colors.
 */
export function deltaE(lab1: LAB, lab2: LAB): number {
    const dL = lab1.L - lab2.L;
    const da = lab1.a - lab2.a;
    const db = lab1.b - lab2.b;
    return Math.sqrt(dL * dL + da * da + db * db);
}

/**
 * Calculates the squared Delta E distance between two CIELAB colors.
 * Eliminating the Math.sqrt operation makes this significantly faster for comparative searches.
 */
export function labDistanceSq(lab1: LAB, lab2: LAB): number {
    const dL = lab1.L - lab2.L;
    const da = lab1.a - lab2.a;
    const db = lab1.b - lab2.b;
    return dL * dL + da * da + db * db;
}

/**
 * Calculates the squared Euclidean distance in RGB color space.
 */
export function colorDistanceSq(a: RGB, b: RGB): number {
    const dr = a.r - b.r;
    const dg = a.g - b.g;
    const db = a.b - b.b;
    return dr * dr + dg * dg + db * db;
}

// ============================================================================
// Bitpacking Result Utilities
// ============================================================================

// Bit-packing metadata bit offsets:
// bits 0..12: Unused
// bit 13: Needs support block flag (gravity blocks)
// bits 14..15: Relative height adjustments (-1, 0, or 1 represented as unsigned 0..2)
// bits 16..23: Palette candidate selection index (0..255)
const CANDIDATE_SHIFT = 16;
const CANDIDATE_MASK = 0xFF;
const TONE_SHIFT = 14;
const TONE_MASK = 0x3;
const SUPPORT_BIT = 13;

/**
 * Packs processing results for a single pixel into a 32-bit unsigned integer.
 * This represents a 4x reduction in memory compared to objects, eliminating GC allocations.
 */
export function packPixel(candidateIdx: number, tone: number, needsSupport: boolean): number {
    return ((candidateIdx & CANDIDATE_MASK) << CANDIDATE_SHIFT)
         | (((tone + 1) & TONE_MASK) << TONE_SHIFT)
         | (needsSupport ? (1 << SUPPORT_BIT) : 0);
}

/**
 * Unpacks the palette candidate index from the packed 32-bit pixel value.
 */
export function unpackCandidateIdx(packed: number): number {
    return (packed >> CANDIDATE_SHIFT) & CANDIDATE_MASK;
}

/**
 * Unpacks the relative tone offset (-1, 0, or 1) from the packed 32-bit pixel value.
 */
export function unpackTone(packed: number): number {
    return ((packed >> TONE_SHIFT) & TONE_MASK) - 1;
}

/**
 * Unpacks the gravity support block requirement from the packed 32-bit pixel value.
 */
export function unpackNeedsSupport(packed: number): boolean {
    return (packed & (1 << SUPPORT_BIT)) !== 0;
}
