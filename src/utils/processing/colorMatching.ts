/**
 * Color Matching Utilities
 * Functions for finding closest colors and generating candidates
 */

import paletteData from '../../data/palette.json';
import type { RGB, BrightnessLevel, BuildMode, PaletteColor } from '../../types/mapart';
import { rgbToLab, labDistanceSq, colorDistanceSq, rgbToBinary, getColorCache, type LAB } from './colorSpace';

// ---------------------------------------------------------------------------
// Internal helper: build an RGB object from inline scalars for functions that
// need an RGB (e.g. rgbToLab, colorDistanceSq). Defined once here to avoid
// repeated object literals in callers.
// ---------------------------------------------------------------------------
function makeRGB(r: number, g: number, b: number): RGB {
    return { r, g, b };
}

// ============================================================================
// Types
// ============================================================================

export interface ColorCandidate {
    colorID: number;
    brightness: BrightnessLevel;
    rgb: RGB;
    blockId: string;
    needsSupport: boolean;
}

export interface ColorMatchResult {
    index: number;
    distance: number;
}

export interface CandidatesSoA {
    count: number;
    r: Uint8Array;
    g: Uint8Array;
    b: Uint8Array;
    labL: Float64Array;
    labA: Float64Array;
    labB: Float64Array;
    notNormal: Uint8Array;
}

export function buildCandidatesSoA(candidates: ColorCandidate[]): CandidatesSoA {
    const count = candidates.length;
    const r = new Uint8Array(count);
    const g = new Uint8Array(count);
    const b = new Uint8Array(count);
    const labL = new Float64Array(count);
    const labA = new Float64Array(count);
    const labB = new Float64Array(count);
    const notNormal = new Uint8Array(count);

    for (let i = 0; i < count; i++) {
        const c = candidates[i];
        r[i] = c.rgb.r;
        g[i] = c.rgb.g;
        b[i] = c.rgb.b;
        const lab = rgbToLab(c.rgb);
        labL[i] = lab.L;
        labA[i] = lab.a;
        labB[i] = lab.b;
        notNormal[i] = c.brightness !== 'normal' ? 1 : 0;
    }

    return { count, r, g, b, labL, labA, labB, notNormal };
}

// ============================================================================
// Color Candidate Functions
// ============================================================================

export function getValidColors(
    selectedPaletteItems: Record<number, string | null>,
    buildMode: BuildMode
): ColorCandidate[] {
    const candidates: ColorCandidate[] = [];
    const palette = paletteData.colors as unknown as PaletteColor[];

    const selectedColorIDs = Object.keys(selectedPaletteItems)
        .map(Number)
        .filter(id => selectedPaletteItems[id] !== null);

    if (selectedColorIDs.length === 0) {
        return [];
    }

    for (const color of palette) {
        if (!selectedColorIDs.includes(color.colorID)) continue;

        const blockId = selectedPaletteItems[color.colorID];
        if (!blockId) continue;

        let levels: BrightnessLevel[];
        if (buildMode === '2d') {
            levels = ['normal'];
        } else {
            levels = ['low', 'normal', 'high'];
        }

        // Find needsSupport for the selected block
        const blockInfo = color.blocks.find(b => b.id === blockId);
        const needsSupport = blockInfo?.needsSupport ?? false;

        for (const level of levels) {
            candidates.push({
                colorID: color.colorID,
                brightness: level,
                rgb: color.brightnessValues[level],
                blockId,
                needsSupport
            });
        }
    }

    return candidates;
}

// ============================================================================
// Color Matching with Cache
// ============================================================================

/**
 * Find the closest color candidate for a pixel given as inline RGB scalars.
 * Accepts tr/tg/tb directly to avoid allocating a { r, g, b } object per pixel.
 *
 * Opt#3 & Opt#5: useCielab branch is hoisted, candidates structured as Flat Typed Arrays (SoA).
 */
export function findClosestColorIndex(
    tr: number,
    tg: number,
    tb: number,
    candidatesSoA: CandidatesSoA,
    useCielab: boolean,
    skipCache: boolean = false,
    heightPenalty: number = 0
): ColorMatchResult {
    const key = (Math.round(tr) << 16) + (Math.round(tg) << 8) + Math.round(tb);
    const colorCache = getColorCache();

    // Check cache first (only for exact RGB matches, skip during error diffusion)
    if (!skipCache && colorCache.has(key)) {
        const cachedIndex = colorCache.get(key)!;
        let dist = 0;
        if (useCielab) {
            const targetLab = rgbToLab(makeRGB(tr, tg, tb));
            const dL = targetLab.L - candidatesSoA.labL[cachedIndex];
            const da = targetLab.a - candidatesSoA.labA[cachedIndex];
            const db = targetLab.b - candidatesSoA.labB[cachedIndex];
            dist = dL * dL + da * da + db * db;
        } else {
            const dr = tr - candidatesSoA.r[cachedIndex];
            const dg = tg - candidatesSoA.g[cachedIndex];
            const db = tb - candidatesSoA.b[cachedIndex];
            dist = dr * dr + dg * dg + db * db;
        }
        return { index: cachedIndex, distance: dist };
    }

    let bestIndex = 0;
    let bestDist = Infinity;
    const n = candidatesSoA.count;

    if (useCielab) {
        // --- LAB path: branch resolved once, tight loop over flat typed arrays ---
        const targetLab = rgbToLab(makeRGB(tr, tg, tb));
        const tL = targetLab.L;
        const ta = targetLab.a;
        const tbVal = targetLab.b;
        for (let i = 0; i < n; i++) {
            const dL = tL - candidatesSoA.labL[i];
            const da = ta - candidatesSoA.labA[i];
            const db = tbVal - candidatesSoA.labB[i];
            let dist = dL * dL + da * da + db * db;
            if (heightPenalty > 0 && candidatesSoA.notNormal[i] !== 0) dist += heightPenalty;
            if (dist < bestDist) { bestDist = dist; bestIndex = i; }
        }
    } else {
        // --- RGB path: branch resolved once, no LAB objects created ---
        for (let i = 0; i < n; i++) {
            const dr = tr - candidatesSoA.r[i];
            const dg = tg - candidatesSoA.g[i];
            const db = tb - candidatesSoA.b[i];
            let dist = dr * dr + dg * dg + db * db;
            if (heightPenalty > 0 && candidatesSoA.notNormal[i] !== 0) dist += heightPenalty;
            if (dist < bestDist) { bestDist = dist; bestIndex = i; }
        }
    }

    if (!skipCache) {
        colorCache.set(key, bestIndex);
    }
    return { index: bestIndex, distance: bestDist };
}

/**
 * Find two closest colors for ordered dithering.
 * Accepts tr/tg/tb directly to avoid allocating a { r, g, b } object per pixel.
 *
 * Opt#3 & Opt#5: useCielab branch is hoisted, candidates structured as Flat Typed Arrays (SoA).
 */
export function findTwoClosestColors(
    tr: number,
    tg: number,
    tb: number,
    candidatesSoA: CandidatesSoA,
    useCielab: boolean,
    heightPenalty: number = 0
): { first: ColorMatchResult; second: ColorMatchResult } {
    let bestIndex = 0;
    let bestDist = Infinity;
    let secondIndex = 0;
    let secondDist = Infinity;
    const n = candidatesSoA.count;

    if (useCielab) {
        // --- LAB path ---
        const targetLab = rgbToLab(makeRGB(tr, tg, tb));
        const tL = targetLab.L;
        const ta = targetLab.a;
        const tbVal = targetLab.b;
        for (let i = 0; i < n; i++) {
            const dL = tL - candidatesSoA.labL[i];
            const da = ta - candidatesSoA.labA[i];
            const db = tbVal - candidatesSoA.labB[i];
            let dist = dL * dL + da * da + db * db;
            if (heightPenalty > 0 && candidatesSoA.notNormal[i] !== 0) dist += heightPenalty;
            if (dist < bestDist) {
                secondDist = bestDist; secondIndex = bestIndex;
                bestDist = dist;      bestIndex = i;
            } else if (dist < secondDist) {
                secondDist = dist; secondIndex = i;
            }
        }
    } else {
        // --- RGB path ---
        for (let i = 0; i < n; i++) {
            const dr = tr - candidatesSoA.r[i];
            const dg = tg - candidatesSoA.g[i];
            const db = tb - candidatesSoA.b[i];
            let dist = dr * dr + dg * dg + db * db;
            if (heightPenalty > 0 && candidatesSoA.notNormal[i] !== 0) dist += heightPenalty;
            if (dist < bestDist) {
                secondDist = bestDist; secondIndex = bestIndex;
                bestDist = dist;      bestIndex = i;
            } else if (dist < secondDist) {
                secondDist = dist; secondIndex = i;
            }
        }
    }

    return {
        first:  { index: bestIndex,  distance: bestDist  },
        second: { index: secondIndex, distance: secondDist }
    };
}
