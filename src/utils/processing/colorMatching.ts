/**
 * Color Matching Utilities
 * Functions for finding closest colors and generating candidates
 */

import paletteData from '../../data/palette.json';
import type { RGB, BrightnessLevel, BuildMode, PaletteColor } from '../../types/mapart';
import { rgbToLab, getColorCache, type LAB } from './colorSpace';



// ============================================================================
// Types
// ============================================================================

export interface ColorCandidate {
    colorID: number;
    brightness: BrightnessLevel;
    rgb: RGB;
    blockId: string;
    needsSupport: boolean;
    lab?: LAB;
}

// ============================================================================
// Precomputed static Minecraft palette LAB values
// ============================================================================
const paletteLabMap = new Map<string, LAB>();
(() => {
    const palette = paletteData.colors as unknown as PaletteColor[];
    for (const color of palette) {
        for (const level of ['lowest', 'low', 'normal', 'high'] as BrightnessLevel[]) {
            const rgb = color.brightnessValues[level];
            if (rgb) {
                paletteLabMap.set(`${color.colorID}_${level}`, rgbToLab(rgb.r, rgb.g, rgb.b));
            }
        }
    }
})();

export interface ColorMatchResult {
    index: number;
    distance: number;
}

/**
 * Candidates represented in a Struct of Arrays (SoA) layout.
 * Structuring candidates sequentially in memory avoids allocating individual color objects
 * during the color selection hot loop, significantly improving CPU cache-friendliness.
 */
export interface CandidatesSoA {
    count: number;
    r: Uint8Array;
    g: Uint8Array;
    b: Uint8Array;
    labL: Float64Array;
    labA: Float64Array;
    labB: Float64Array;
    notNormal: Uint8Array; // 1 if brightness level is 'high' or 'low', 0 if 'normal'
    sortedToOriginal: Int32Array; // Maps sorted position to original candidate index
}

/**
 * Transforms an Array of Structs (AoS) representing color candidates
 * into a highly optimized Struct of Arrays (SoA) layout.
 */
export function buildCandidatesSoA(candidates: ColorCandidate[]): CandidatesSoA {
    const count = candidates.length;

    // 1. Ensure all candidates have their LAB values pre-computed
    for (let i = 0; i < count; i++) {
        const c = candidates[i];
        if (!c.lab) {
            c.lab = rgbToLab(c.rgb.r, c.rgb.g, c.rgb.b);
        }
    }

    // 2. Create index array and sort it by L (lightness) in ascending order
    const indices = Array.from({ length: count }, (_, i) => i);
    indices.sort((a, b) => candidates[a].lab!.L - candidates[b].lab!.L);
    
    const sortedToOriginal = new Int32Array(indices);

    const r = new Uint8Array(count);
    const g = new Uint8Array(count);
    const b = new Uint8Array(count);
    const labL = new Float64Array(count);
    const labA = new Float64Array(count);
    const labB = new Float64Array(count);
    const notNormal = new Uint8Array(count);

    for (let i = 0; i < count; i++) {
        const origIdx = sortedToOriginal[i];
        const c = candidates[origIdx];
        r[i] = c.rgb.r;
        g[i] = c.rgb.g;
        b[i] = c.rgb.b;
        const lab = c.lab!;
        labL[i] = lab.L;
        labA[i] = lab.a;
        labB[i] = lab.b;
        notNormal[i] = c.brightness !== 'normal' ? 1 : 0;
    }

    return { count, r, g, b, labL, labA, labB, notNormal, sortedToOriginal };
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
            const key = `${color.colorID}_${level}`;
            candidates.push({
                colorID: color.colorID,
                brightness: level,
                rgb: color.brightnessValues[level],
                blockId,
                needsSupport,
                lab: paletteLabMap.get(key)
            });
        }
    }

    return candidates;
}

// ============================================================================
// Color Matching with Cache
// ============================================================================

// Reusable static result objects to eliminate garbage collection pressure
const _singleResult: ColorMatchResult = { index: 0, distance: 0 };

const _twoResult = {
    first: { index: 0, distance: 0 },
    second: { index: 0, distance: 0 }
};

/**
 * Find the closest color candidate for a pixel given as inline RGB scalars.
 * Accepts tr/tg/tb directly to avoid allocating a { r, g, b } object per pixel.
 *
 * The usePerceptual branch is hoisted and candidates are structured as Struct of Arrays (SoA) for cache-friendly sequential memory access.
 */
export function findClosestColorIndex(
    tr: number,
    tg: number,
    tb: number,
    candidatesSoA: CandidatesSoA,
    usePerceptual: boolean,
    skipCache: boolean = false,
    heightPenalty: number = 0
): ColorMatchResult {
    const key = (((tr + 0.5) | 0) << 16) | (((tg + 0.5) | 0) << 8) | ((tb + 0.5) | 0);
    const colorCache = getColorCache();

    // Check cache first (only for exact RGB matches, skip during error diffusion)
    if (!skipCache && colorCache.has(key)) {
        const cachedIndex = colorCache.get(key)!;
        _singleResult.index = cachedIndex;
        _singleResult.distance = 0;
        return _singleResult;
    }

    let bestIndex = 0;
    let bestDist = Infinity;
    const n = candidatesSoA.count;

    if (usePerceptual) {
        // --- LAB path: binary search + 2-pointer scan on L-sorted array ---
        const targetLab = rgbToLab(tr, tg, tb);
        const tL = targetLab.L;
        const ta = targetLab.a;
        const tbVal = targetLab.b;

        // 1. Binary search for closest L
        let low = 0;
        let high = n - 1;
        let startIdx = 0;

        while (low <= high) {
            const mid = (low + high) >>> 1;
            const midL = candidatesSoA.labL[mid];
            if (midL < tL) {
                low = mid + 1;
            } else if (midL > tL) {
                high = mid - 1;
            } else {
                startIdx = mid;
                break;
            }
        }
        if (low > high) {
            if (high < 0) startIdx = 0;
            else if (low >= n) startIdx = n - 1;
            else {
                startIdx = (tL - candidatesSoA.labL[high] < candidatesSoA.labL[low] - tL) ? high : low;
            }
        }

        // 2. Initialize best with startIdx
        bestIndex = startIdx;
        const dL_start = tL - candidatesSoA.labL[startIdx];
        const da_start = ta - candidatesSoA.labA[startIdx];
        const db_start = tbVal - candidatesSoA.labB[startIdx];
        bestDist = dL_start * dL_start + da_start * da_start + db_start * db_start;
        if (heightPenalty > 0 && candidatesSoA.notNormal[startIdx] !== 0) {
            bestDist += heightPenalty;
        }

        // 3. Two-pointer scan outwards
        let left = startIdx - 1;
        let right = startIdx + 1;

        if (heightPenalty > 0) {
            while (left >= 0 || right < n) {
                if (left >= 0) {
                    const dL = tL - candidatesSoA.labL[left];
                    const dL2 = dL * dL;
                    if (dL2 >= bestDist) {
                        left = -1; // stop searching left
                    } else {
                        const da = ta - candidatesSoA.labA[left];
                        const db = tbVal - candidatesSoA.labB[left];
                        let dist = dL2 + da * da + db * db;
                        if (candidatesSoA.notNormal[left] !== 0) dist += heightPenalty;
                        if (dist < bestDist) { bestDist = dist; bestIndex = left; }
                        left--;
                    }
                }
                if (right < n) {
                    const dL = tL - candidatesSoA.labL[right];
                    const dL2 = dL * dL;
                    if (dL2 >= bestDist) {
                        right = n; // stop searching right
                    } else {
                        const da = ta - candidatesSoA.labA[right];
                        const db = tbVal - candidatesSoA.labB[right];
                        let dist = dL2 + da * da + db * db;
                        if (candidatesSoA.notNormal[right] !== 0) dist += heightPenalty;
                        if (dist < bestDist) { bestDist = dist; bestIndex = right; }
                        right++;
                    }
                }
            }
        } else {
            while (left >= 0 || right < n) {
                if (left >= 0) {
                    const dL = tL - candidatesSoA.labL[left];
                    const dL2 = dL * dL;
                    if (dL2 >= bestDist) {
                        left = -1; // stop searching left
                    } else {
                        const da = ta - candidatesSoA.labA[left];
                        const db = tbVal - candidatesSoA.labB[left];
                        const dist = dL2 + da * da + db * db;
                        if (dist < bestDist) { bestDist = dist; bestIndex = left; }
                        left--;
                    }
                }
                if (right < n) {
                    const dL = tL - candidatesSoA.labL[right];
                    const dL2 = dL * dL;
                    if (dL2 >= bestDist) {
                        right = n; // stop searching right
                    } else {
                        const da = ta - candidatesSoA.labA[right];
                        const db = tbVal - candidatesSoA.labB[right];
                        const dist = dL2 + da * da + db * db;
                        if (dist < bestDist) { bestDist = dist; bestIndex = right; }
                        right++;
                    }
                }
            }
        }
    } else {
        // --- RGB path: branch resolved once, no LAB objects created ---
        if (heightPenalty > 0) {
            for (let i = 0; i < n; i++) {
                const dr = tr - candidatesSoA.r[i];
                const dg = tg - candidatesSoA.g[i];
                const db = tb - candidatesSoA.b[i];
                let dist = dr * dr + dg * dg + db * db;
                if (candidatesSoA.notNormal[i] !== 0) dist += heightPenalty;
                if (dist < bestDist) { bestDist = dist; bestIndex = i; }
            }
        } else {
            for (let i = 0; i < n; i++) {
                const dr = tr - candidatesSoA.r[i];
                const dg = tg - candidatesSoA.g[i];
                const db = tb - candidatesSoA.b[i];
                const dist = dr * dr + dg * dg + db * db;
                if (dist < bestDist) { bestDist = dist; bestIndex = i; }
            }
        }
    }

    const finalIndex = candidatesSoA.sortedToOriginal[bestIndex];
    if (!skipCache) {
        colorCache.set(key, finalIndex);
    }
    _singleResult.index = finalIndex;
    _singleResult.distance = bestDist;
    return _singleResult;
}

/**
 * Find the two closest color candidates for ordered dithering threshold logic.
 * Accepts inline RGB components to prevent garbage collection pressure.
 *
 * For performance:
 * 1. The CIELAB color space conditional checks are hoisted outside the main loops.
 * 2. Parallel sequential memory layout (SoA) is traversed for better cache locality.
 */
export function findTwoClosestColors(
    tr: number,
    tg: number,
    tb: number,
    candidatesSoA: CandidatesSoA,
    usePerceptual: boolean,
    heightPenalty: number = 0
): { first: ColorMatchResult; second: ColorMatchResult } {
    let bestIndex = 0;
    let bestDist = Infinity;
    let secondIndex = 0;
    let secondDist = Infinity;
    const n = candidatesSoA.count;

    if (usePerceptual) {
        // --- LAB path: binary search + 2-pointer scan on L-sorted array ---
        const targetLab = rgbToLab(tr, tg, tb);
        const tL = targetLab.L;
        const ta = targetLab.a;
        const tbVal = targetLab.b;

        // 1. Binary search for closest L
        let low = 0;
        let high = n - 1;
        let startIdx = 0;

        while (low <= high) {
            const mid = (low + high) >>> 1;
            const midL = candidatesSoA.labL[mid];
            if (midL < tL) {
                low = mid + 1;
            } else if (midL > tL) {
                high = mid - 1;
            } else {
                startIdx = mid;
                break;
            }
        }
        if (low > high) {
            if (high < 0) startIdx = 0;
            else if (low >= n) startIdx = n - 1;
            else {
                startIdx = (tL - candidatesSoA.labL[high] < candidatesSoA.labL[low] - tL) ? high : low;
            }
        }

        // 2. Initialize best with startIdx
        bestIndex = startIdx;
        const dL_start = tL - candidatesSoA.labL[startIdx];
        const da_start = ta - candidatesSoA.labA[startIdx];
        const db_start = tbVal - candidatesSoA.labB[startIdx];
        bestDist = dL_start * dL_start + da_start * da_start + db_start * db_start;
        if (heightPenalty > 0 && candidatesSoA.notNormal[startIdx] !== 0) {
            bestDist += heightPenalty;
        }

        // 3. Two-pointer scan outwards
        let left = startIdx - 1;
        let right = startIdx + 1;

        if (heightPenalty > 0) {
            while (left >= 0 || right < n) {
                if (left >= 0) {
                    const dL = tL - candidatesSoA.labL[left];
                    const dL2 = dL * dL;
                    if (dL2 >= secondDist) {
                        left = -1; // stop searching left
                    } else {
                        const da = ta - candidatesSoA.labA[left];
                        const db = tbVal - candidatesSoA.labB[left];
                        let dist = dL2 + da * da + db * db;
                        if (candidatesSoA.notNormal[left] !== 0) dist += heightPenalty;
                        if (dist < bestDist) {
                            secondDist = bestDist; secondIndex = bestIndex;
                            bestDist = dist;      bestIndex = left;
                        } else if (dist < secondDist) {
                            secondDist = dist; secondIndex = left;
                        }
                        left--;
                    }
                }
                if (right < n) {
                    const dL = tL - candidatesSoA.labL[right];
                    const dL2 = dL * dL;
                    if (dL2 >= secondDist) {
                        right = n; // stop searching right
                    } else {
                        const da = ta - candidatesSoA.labA[right];
                        const db = tbVal - candidatesSoA.labB[right];
                        let dist = dL2 + da * da + db * db;
                        if (candidatesSoA.notNormal[right] !== 0) dist += heightPenalty;
                        if (dist < bestDist) {
                            secondDist = bestDist; secondIndex = bestIndex;
                            bestDist = dist;      bestIndex = right;
                        } else if (dist < secondDist) {
                            secondDist = dist; secondIndex = right;
                        }
                        right++;
                    }
                }
            }
        } else {
            while (left >= 0 || right < n) {
                if (left >= 0) {
                    const dL = tL - candidatesSoA.labL[left];
                    const dL2 = dL * dL;
                    if (dL2 >= secondDist) {
                        left = -1; // stop searching left
                    } else {
                        const da = ta - candidatesSoA.labA[left];
                        const db = tbVal - candidatesSoA.labB[left];
                        const dist = dL2 + da * da + db * db;
                        if (dist < bestDist) {
                            secondDist = bestDist; secondIndex = bestIndex;
                            bestDist = dist;      bestIndex = left;
                        } else if (dist < secondDist) {
                            secondDist = dist; secondIndex = left;
                        }
                        left--;
                    }
                }
                if (right < n) {
                    const dL = tL - candidatesSoA.labL[right];
                    const dL2 = dL * dL;
                    if (dL2 >= secondDist) {
                        right = n; // stop searching right
                    } else {
                        const da = ta - candidatesSoA.labA[right];
                        const db = tbVal - candidatesSoA.labB[right];
                        const dist = dL2 + da * da + db * db;
                        if (dist < bestDist) {
                            secondDist = bestDist; secondIndex = bestIndex;
                            bestDist = dist;      bestIndex = right;
                        } else if (dist < secondDist) {
                            secondDist = dist; secondIndex = right;
                        }
                        right++;
                    }
                }
            }
        }
    } else {
        // --- RGB path ---
        if (heightPenalty > 0) {
            for (let i = 0; i < n; i++) {
                const dr = tr - candidatesSoA.r[i];
                const dg = tg - candidatesSoA.g[i];
                const db = tb - candidatesSoA.b[i];
                let dist = dr * dr + dg * dg + db * db;
                if (candidatesSoA.notNormal[i] !== 0) dist += heightPenalty;
                if (dist < bestDist) {
                    secondDist = bestDist; secondIndex = bestIndex;
                    bestDist = dist;      bestIndex = i;
                } else if (dist < secondDist) {
                    secondDist = dist; secondIndex = i;
                }
            }
        } else {
            for (let i = 0; i < n; i++) {
                const dr = tr - candidatesSoA.r[i];
                const dg = tg - candidatesSoA.g[i];
                const db = tb - candidatesSoA.b[i];
                const dist = dr * dr + dg * dg + db * db;
                if (dist < bestDist) {
                    secondDist = bestDist; secondIndex = bestIndex;
                    bestDist = dist;      bestIndex = i;
                } else if (dist < secondDist) {
                    secondDist = dist; secondIndex = i;
                }
            }
        }
    }

    _twoResult.first.index = candidatesSoA.sortedToOriginal[bestIndex];
    _twoResult.first.distance = bestDist;
    _twoResult.second.index = candidatesSoA.sortedToOriginal[secondIndex];
    _twoResult.second.distance = secondDist;
    return _twoResult;
}
