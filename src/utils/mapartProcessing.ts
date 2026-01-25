import paletteData from '../data/palette_1_21_11.json';

// Types based on palette structure
export interface RGB {
    r: number;
    g: number;
    b: number;
}

export type BrightnessLevel = 'lowest' | 'low' | 'normal' | 'high';

export interface PaletteColor {
    colorID: number;
    colorName: string;
    brightnessValues: Record<BrightnessLevel, RGB>;
    blocks: { id: string; needsSupport: boolean }[];
}

export interface ColorCandidate {
    colorID: number;
    brightness: BrightnessLevel;
    rgb: RGB;
    blockId: string;
}

export type BuildMode = '2d' | '3d_valley' | '3d_valley_lossy';

const MAX_HEIGHT_PENALTY = 255 * 255 * 3 + 1; // Larger than max color distance squared to ensure 0% = pure 2D

/**
 * Calculate squared Euclidean distance between two RGB colors.
 */
function colorDistanceSq(a: RGB, b: RGB): number {
    const dr = a.r - b.r;
    const dg = a.g - b.g;
    const db = a.b - b.b;
    return dr * dr + dg * dg + db * db;
}

/**
 * Get valid color candidates based on build mode and selected palette items.
 */
export function getValidColors(
    selectedPaletteItems: Record<number, string | null>,
    buildMode: BuildMode
): ColorCandidate[] {
    const candidates: ColorCandidate[] = [];
    const palette = paletteData.colors as unknown as PaletteColor[];

    // Filter to only selected colors
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

        // Determine which brightness levels to include
        let levels: BrightnessLevel[];
        if (buildMode === '2d') {
            levels = ['normal'];
        } else {
            // 3D and 3D Lossy: all except 'lowest'
            levels = ['low', 'normal', 'high'];
        }

        for (const level of levels) {
            candidates.push({
                colorID: color.colorID,
                brightness: level,
                rgb: color.brightnessValues[level],
                blockId
            });
        }
    }

    return candidates;
}

/**
 * Find the closest color from candidates using simple Euclidean distance.
 * Used for 2D and standard 3D modes.
 */
export function findClosestColor(target: RGB, candidates: ColorCandidate[]): ColorCandidate | null {
    if (candidates.length === 0) return null;

    let best = candidates[0];
    let bestDist = colorDistanceSq(target, best.rgb);

    for (let i = 1; i < candidates.length; i++) {
        const dist = colorDistanceSq(target, candidates[i].rgb);
        if (dist < bestDist) {
            bestDist = dist;
            best = candidates[i];
        }
    }

    return best;
}

/**
 * Process the entire image for mapart preview.
 * For 3D Lossy mode, processes column-by-column to track height.
 * 
 * @param imageData - The source image data
 * @param buildMode - Current build mode
 * @param selectedPaletteItems - User's color selections
 * @param threeDPrecision - UI slider value (0-100). 0=Flat, 100=Precise
 * @returns New ImageData with colors mapped to palette
 */
export function processMapart(
    imageData: ImageData,
    buildMode: BuildMode,
    selectedPaletteItems: Record<number, string | null>,
    threeDPrecision: number
): ImageData {
    const candidates = getValidColors(selectedPaletteItems, buildMode);

    // If no candidates, return original image
    if (candidates.length === 0) {
        return imageData;
    }

    const { width, height, data } = imageData;
    const output = new Uint8ClampedArray(data);

    // Convert UI precision (0=flat, 100=precise) to internal penalty
    // At 0%: Use huge penalty to force normal only (identical to 2D)
    // At 1-100%: Use exponential curve with practical range
    const normalizedPrecision = threeDPrecision / 100;
    let heightPenalty: number;

    if (threeDPrecision === 0) {
        // Force 2D-like behavior: penalty so high that normal always wins
        heightPenalty = MAX_HEIGHT_PENALTY;
    } else {
        // Practical range based on typical brightness variant differences
        // Brightness variants differ by ~20-40 per channel = ~1200-4800 distance squared
        // Use linear scale for predictable behavior
        const PRACTICAL_MAX = 5000;
        heightPenalty = PRACTICAL_MAX * (1 - normalizedPrecision);
    }

    if (buildMode === '3d_valley_lossy') {
        // Process column by column (x first, then y from top to bottom = North to South)
        for (let x = 0; x < width; x++) {
            let currentHeight = 0;

            for (let y = 0; y < height; y++) {
                const idx = (y * width + x) * 4;
                const target: RGB = { r: data[idx], g: data[idx + 1], b: data[idx + 2] };

                // Find best candidate considering height constraints
                let best: ColorCandidate | null = null;
                let bestScore = Infinity;

                for (const candidate of candidates) {
                    // Skip 'low' if it would make height negative
                    if (candidate.brightness === 'low' && currentHeight <= 0) {
                        continue;
                    }

                    const colorDist = colorDistanceSq(target, candidate.rgb);
                    let heightCost = 0;

                    // Add penalty for choosing non-normal brightness
                    // At 0% precision, this effectively forces only 'normal' (like 2D)
                    // At 100% precision, no penalty applied
                    if (candidate.brightness === 'high' || candidate.brightness === 'low') {
                        heightCost = heightPenalty;
                    }

                    const score = colorDist + heightCost;

                    if (score < bestScore) {
                        bestScore = score;
                        best = candidate;
                    }
                }

                if (best) {
                    output[idx] = best.rgb.r;
                    output[idx + 1] = best.rgb.g;
                    output[idx + 2] = best.rgb.b;
                    // alpha unchanged

                    // Update height based on chosen brightness
                    if (best.brightness === 'high') {
                        currentHeight++;
                    } else if (best.brightness === 'low') {
                        currentHeight--;
                    }
                    // 'normal' doesn't change height
                }
            }
        }
    } else {
        // 2D or standard 3D: simple pixel-by-pixel mapping
        for (let i = 0; i < data.length; i += 4) {
            const target: RGB = { r: data[i], g: data[i + 1], b: data[i + 2] };
            const best = findClosestColor(target, candidates);

            if (best) {
                output[i] = best.rgb.r;
                output[i + 1] = best.rgb.g;
                output[i + 2] = best.rgb.b;
            }
        }
    }

    return new ImageData(output, width, height);
}
