/**
 * Color Space Utilities
 * OKLab conversion, caching, and distance calculations.
 * Reference: Björn Ottosson — https://bottosson.github.io/posts/oklab/
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

export function rgbToBinary(rgb: RGB): number;
export function rgbToBinary(r: number, g: number, b: number): number;
export function rgbToBinary(rOrRgb: number | RGB, g?: number, b?: number): number {
    if (typeof rOrRgb === 'object' && rOrRgb !== null) {
        return (((rOrRgb.r + 0.5) | 0) << 16) | (((rOrRgb.g + 0.5) | 0) << 8) | ((rOrRgb.b + 0.5) | 0);
    }
    return (((rOrRgb + 0.5) | 0) << 16) | (((g! + 0.5) | 0) << 8) | ((b! + 0.5) | 0);
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
// Built once at module load using the exact same formula as before —
// OKLab uses identical sRGB linearization.
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
// OKLab matrix coefficients — hoisted as module-level constants for zero
// property-lookup overhead inside rgbToLab (called once per unique RGB color).
// ============================================================================

// M1: linear sRGB → LMS
const M1_L0 = MAPART.OKLAB_M1_L[0], M1_L1 = MAPART.OKLAB_M1_L[1], M1_L2 = MAPART.OKLAB_M1_L[2];
const M1_M0 = MAPART.OKLAB_M1_M[0], M1_M1 = MAPART.OKLAB_M1_M[1], M1_M2 = MAPART.OKLAB_M1_M[2];
const M1_S0 = MAPART.OKLAB_M1_S[0], M1_S1 = MAPART.OKLAB_M1_S[1], M1_S2 = MAPART.OKLAB_M1_S[2];

// M2: LMS^(1/3) → OKLab
const M2_L0 = MAPART.OKLAB_M2_L[0], M2_L1 = MAPART.OKLAB_M2_L[1], M2_L2 = MAPART.OKLAB_M2_L[2];
const M2_A0 = MAPART.OKLAB_M2_A[0], M2_A1 = MAPART.OKLAB_M2_A[1], M2_A2 = MAPART.OKLAB_M2_A[2];
const M2_B0 = MAPART.OKLAB_M2_B[0], M2_B1 = MAPART.OKLAB_M2_B[1], M2_B2 = MAPART.OKLAB_M2_B[2];

// ============================================================================
// RGB to OKLab Conversion
// ============================================================================

/**
 * Transforms an RGB color into the OKLab color space (Björn Ottosson, 2020).
 *
 * Output ranges:
 *   L ∈ [0, 1]          — perceptual lightness
 *   a ≈ [-0.4,  0.4]    — green↔red axis
 *   b ≈ [-0.4,  0.4]    — blue↔yellow axis
 *
 * All three axes have a naturally similar scale, so Euclidean distance in
 * OKLab is perceptually uniform without requiring L rescaling.
 *
 * Performance features:
 * 1. Reuses the precomputed 256-entry GAMMA_LUT for sRGB→linear (same as before).
 * 2. Matrix coefficients are hoisted to module-level scalars — zero object lookup.
 * 3. Uses Math.cbrt (native op) for LMS^(1/3).
 * 4. Results are cached by 24-bit RGB key — computed at most once per unique color.
 */
export function rgbToLab(rgb: RGB): LAB;
export function rgbToLab(r: number, g: number, b: number): LAB;
export function rgbToLab(rOrRgb: number | RGB, g?: number, b?: number): LAB {
    let r: number, gVal: number, bVal: number;
    if (typeof rOrRgb === 'object' && rOrRgb !== null) {
        r = rOrRgb.r;
        gVal = rOrRgb.g;
        bVal = rOrRgb.b;
    } else {
        r = rOrRgb;
        gVal = g!;
        bVal = b!;
    }
    const key = (((r + 0.5) | 0) << 16) | (((gVal + 0.5) | 0) << 8) | ((bVal + 0.5) | 0);
    if (labCache.has(key)) {
        return labCache.get(key)!;
    }

    // Step 1: sRGB → linear RGB via gamma LUT (identical to previous CIELab path)
    const r1 = GAMMA_LUT[((r + 0.5) | 0) & 0xFF];
    const g1 = GAMMA_LUT[((gVal + 0.5) | 0) & 0xFF];
    const b1 = GAMMA_LUT[((bVal + 0.5) | 0) & 0xFF];

    // Step 2: linear sRGB → LMS cone space (M1)
    const lms_l = M1_L0 * r1 + M1_L1 * g1 + M1_L2 * b1;
    const lms_m = M1_M0 * r1 + M1_M1 * g1 + M1_M2 * b1;
    const lms_s = M1_S0 * r1 + M1_S1 * g1 + M1_S2 * b1;

    // Step 3: LMS^(1/3) — cube root of each cone response
    const l_ = Math.cbrt(lms_l);
    const m_ = Math.cbrt(lms_m);
    const s_ = Math.cbrt(lms_s);

    // Step 4: LMS^(1/3) → OKLab (M2)
    const lab: LAB = {
        L: M2_L0 * l_ + M2_L1 * m_ + M2_L2 * s_,
        a: M2_A0 * l_ + M2_A1 * m_ + M2_A2 * s_,
        b: M2_B0 * l_ + M2_B1 * m_ + M2_B2 * s_,
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
// bits 0..9: Palette candidate selection index (0..1023)
// bits 10..11: Relative height adjustments (-1, 0, or 1 represented as unsigned 0..2)
// bit 12: Needs support block flag (gravity blocks)
const CANDIDATE_SHIFT = 0;
const CANDIDATE_MASK = 0x3FF;
const TONE_SHIFT = 10;
const TONE_MASK = 0x3;
const SUPPORT_BIT = 12;

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
    // Zero-shift shortcut for bits 0..9
    return packed & CANDIDATE_MASK;
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
