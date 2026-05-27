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

export function rgbToBinary(rgb: RGB): number {
    return (Math.round(rgb.r) << 16) + (Math.round(rgb.g) << 8) + Math.round(rgb.b);
}

export function clearColorCache(): void {
    colorCache.clear();
}

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
 * RGB to LAB conversion - exact copy from mapartcraft (redstonehelper's program).
 * This version scales L to 0-255 range for consistent distance calculations.
 *
 * Optimizations (Opt#2):
 *   - sRGB gamma step uses GAMMA_LUT[256] instead of Math.pow(x, 2.4)
 *   - XYZ→Lab cube root uses Math.cbrt instead of Math.pow(x, 1/3)
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

    // Linear RGB to XYZ
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

    // Scale L to 0-255 range
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

export function deltaE(lab1: LAB, lab2: LAB): number {
    const dL = lab1.L - lab2.L;
    const da = lab1.a - lab2.a;
    const db = lab1.b - lab2.b;
    return Math.sqrt(dL * dL + da * da + db * db);
}

/**
 * Squared Euclidean distance in LAB space (like mapartcraft).
 * Using squared values avoids sqrt and works better for comparisons.
 */
export function labDistanceSq(lab1: LAB, lab2: LAB): number {
    const dL = lab1.L - lab2.L;
    const da = lab1.a - lab2.a;
    const db = lab1.b - lab2.b;
    return dL * dL + da * da + db * db;
}

export function colorDistanceSq(a: RGB, b: RGB): number {
    const dr = a.r - b.r;
    const dg = a.g - b.g;
    const db = a.b - b.b;
    return dr * dr + dg * dg + db * db;
}
