/**
 * Color Matching Utilities
 * Functions for finding closest colors and generating candidates
 */

import paletteData from '../../data/palette.json';
import type { RGB, BrightnessLevel, BuildMode, PaletteColor } from '../../types/mapart';
import { rgbToLab, labDistanceSq, colorDistanceSq, rgbToBinary, getColorCache, type LAB } from './colorSpace';

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

export function findClosestColorIndex(
    target: RGB,
    candidates: ColorCandidate[],
    candidateLabs: LAB[],
    useCielab: boolean,
    skipCache: boolean = false,
    heightPenalty: number = 0
): ColorMatchResult {
    const key = rgbToBinary(target);
    const colorCache = getColorCache();

    // Check cache first (only for exact RGB matches, skip during error diffusion)
    if (!skipCache && colorCache.has(key)) {
        const cachedIndex = colorCache.get(key)!;
        const dist = useCielab
            ? labDistanceSq(rgbToLab(target), candidateLabs[cachedIndex])
            : colorDistanceSq(target, candidates[cachedIndex].rgb);
        return { index: cachedIndex, distance: dist };
    }

    const targetLab = useCielab ? rgbToLab(target) : { L: 0, a: 0, b: 0 };

    let bestIndex = 0;
    let bestDist = Infinity;

    for (let i = 0; i < candidates.length; i++) {
        let dist: number;
        if (useCielab) {
            dist = labDistanceSq(targetLab, candidateLabs[i]);
        } else {
            dist = colorDistanceSq(target, candidates[i].rgb);
        }

        // Apply 3D Precision Penalty
        if (heightPenalty > 0 && candidates[i].brightness !== 'normal') {
            dist += heightPenalty;
        }

        if (dist < bestDist) {
            bestDist = dist;
            bestIndex = i;
        }
    }

    if (!skipCache) {
        colorCache.set(key, bestIndex);
    }
    return { index: bestIndex, distance: bestDist };
}

/**
 * Find two closest colors for ordered dithering.
 */
export function findTwoClosestColors(
    target: RGB,
    candidates: ColorCandidate[],
    candidateLabs: LAB[],
    useCielab: boolean,
    heightPenalty: number = 0
): { first: ColorMatchResult; second: ColorMatchResult } {
    const targetLab = useCielab ? rgbToLab(target) : { L: 0, a: 0, b: 0 };

    let bestIndex = 0;
    let bestDist = Infinity;
    let secondIndex = 0;
    let secondDist = Infinity;

    for (let i = 0; i < candidates.length; i++) {
        let dist: number;
        if (useCielab) {
            dist = labDistanceSq(targetLab, candidateLabs[i]);
        } else {
            dist = colorDistanceSq(target, candidates[i].rgb);
        }

        // Apply 3D Precision Penalty
        if (heightPenalty > 0 && candidates[i].brightness !== 'normal') {
            dist += heightPenalty;
        }

        if (dist < bestDist) {
            secondDist = bestDist;
            secondIndex = bestIndex;
            bestDist = dist;
            bestIndex = i;
        } else if (dist < secondDist) {
            secondDist = dist;
            secondIndex = i;
        }
    }

    return {
        first: { index: bestIndex, distance: bestDist },
        second: { index: secondIndex, distance: secondDist }
    };
}
