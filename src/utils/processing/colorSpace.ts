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
// RGB to LAB Conversion
// ============================================================================

/**
 * RGB to LAB conversion - exact copy from mapartcraft (redstonehelper's program).
 * This version scales L to 0-255 range for consistent distance calculations.
 */
export function rgbToLab(rgb: RGB): LAB {
    const key = rgbToBinary(rgb);
    if (labCache.has(key)) {
        return labCache.get(key)!;
    }

    let r1 = rgb.r / 255.0;
    let g1 = rgb.g / 255.0;
    let b1 = rgb.b / 255.0;

    // sRGB to linear RGB (gamma correction)
    const { RGB_TO_LINEAR_THRESHOLD: THRESHOLD, RGB_TO_LINEAR_DIVISOR: DIVISOR, RGB_TO_LINEAR_OFFSET: OFFSET, RGB_TO_LINEAR_POWER: POWER } = MAPART;

    r1 = THRESHOLD >= r1 ? (r1 / DIVISOR) : Math.pow((r1 + OFFSET) / (1 + OFFSET), POWER);
    g1 = THRESHOLD >= g1 ? (g1 / DIVISOR) : Math.pow((g1 + OFFSET) / (1 + OFFSET), POWER);
    b1 = THRESHOLD >= b1 ? (b1 / DIVISOR) : Math.pow((b1 + OFFSET) / (1 + OFFSET), POWER);

    // Linear RGB to XYZ
    const { XYZ_R_COEFFS: Rc, XYZ_G_COEFFS: Gc, XYZ_B_COEFFS: Bc, XYZ_WHITE_REF: Wr } = MAPART;

    const f = (Rc[0] * r1 + Rc[1] * g1 + Rc[2] * b1) / Wr.X;
    const h = (Gc[0] * r1 + Gc[1] * g1 + Gc[2] * b1) / Wr.Y;
    const k = (Bc[0] * r1 + Bc[1] * g1 + Bc[2] * b1) / Wr.Z;

    // XYZ to Lab
    const { LAB_THRESHOLD: L_THRESH, LAB_FACTOR_LOW: L_FACT, LAB_OFFSET_LOW: L_OFF, LAB_DIVISOR_LOW: L_DIV } = MAPART;

    const l = L_THRESH < h ? Math.pow(h, MAPART.LAB_POWER) : (L_FACT * h + L_OFF) / L_DIV;
    const m = MAPART.LAB_A_FACTOR * ((L_THRESH < f ? Math.pow(f, MAPART.LAB_POWER) : (L_FACT * f + L_OFF) / L_DIV) - l);
    const n = MAPART.LAB_B_FACTOR * (l - (L_THRESH < k ? Math.pow(k, MAPART.LAB_POWER) : (L_FACT * k + L_OFF) / L_DIV));

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
