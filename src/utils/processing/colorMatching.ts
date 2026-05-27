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
 * Opt#3: useCielab branch is evaluated ONCE before the loop, not once per candidate.
 */
export function findClosestColorIndex(
    tr: number,
    tg: number,
    tb: number,
    candidates: ColorCandidate[],
    candidateLabs: LAB[],
    useCielab: boolean,
    skipCache: boolean = false,
    heightPenalty: number = 0
): ColorMatchResult {
    const key = (Math.round(tr) << 16) + (Math.round(tg) << 8) + Math.round(tb);
    const colorCache = getColorCache();

    // Check cache first (only for exact RGB matches, skip during error diffusion)
    if (!skipCache && colorCache.has(key)) {
        const cachedIndex = colorCache.get(key)!;
        const targetRGB = makeRGB(tr, tg, tb);
        const dist = useCielab
            ? labDistanceSq(rgbToLab(targetRGB), candidateLabs[cachedIndex])
            : colorDistanceSq(targetRGB, candidates[cachedIndex].rgb);
        return { index: cachedIndex, distance: dist };
    }

    let bestIndex = 0;
    let bestDist = Infinity;
    const n = candidates.length;

    if (useCielab) {
        // --- LAB path: branch resolved once, tight loop over pre-computed LAB values ---
        const targetLab = rgbToLab(makeRGB(tr, tg, tb));
        for (let i = 0; i < n; i++) {
            let dist = labDistanceSq(targetLab, candidateLabs[i]);
            if (heightPenalty > 0 && candidates[i].brightness !== 'normal') dist += heightPenalty;
            if (dist < bestDist) { bestDist = dist; bestIndex = i; }
        }
    } else {
        // --- RGB path: branch resolved once, no LAB objects created ---
        const targetRGB = makeRGB(tr, tg, tb);
        for (let i = 0; i < n; i++) {
            let dist = colorDistanceSq(targetRGB, candidates[i].rgb);
            if (heightPenalty > 0 && candidates[i].brightness !== 'normal') dist += heightPenalty;
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
 * Opt#3: useCielab branch is evaluated ONCE before the loop, not once per candidate.
 */
export function findTwoClosestColors(
    tr: number,
    tg: number,
    tb: number,
    candidates: ColorCandidate[],
    candidateLabs: LAB[],
    useCielab: boolean,
    heightPenalty: number = 0
): { first: ColorMatchResult; second: ColorMatchResult } {
    let bestIndex = 0;
    let bestDist = Infinity;
    let secondIndex = 0;
    let secondDist = Infinity;
    const n = candidates.length;

    if (useCielab) {
        // --- LAB path ---
        const targetLab = rgbToLab(makeRGB(tr, tg, tb));
        for (let i = 0; i < n; i++) {
            let dist = labDistanceSq(targetLab, candidateLabs[i]);
            if (heightPenalty > 0 && candidates[i].brightness !== 'normal') dist += heightPenalty;
            if (dist < bestDist) {
                secondDist = bestDist; secondIndex = bestIndex;
                bestDist = dist;      bestIndex = i;
            } else if (dist < secondDist) {
                secondDist = dist; secondIndex = i;
            }
        }
    } else {
        // --- RGB path ---
        const targetRGB = makeRGB(tr, tg, tb);
        for (let i = 0; i < n; i++) {
            let dist = colorDistanceSq(targetRGB, candidates[i].rgb);
            if (heightPenalty > 0 && candidates[i].brightness !== 'normal') dist += heightPenalty;
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
