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

const MAX_HEIGHT_PENALTY = 255 * 255 * 3 + 1;

// ============================================================================
// Caching System
// ============================================================================

// LAB cache: RGB binary -> LAB values
const labCache = new Map<number, LAB>();

// Color cache: RGB binary -> best candidate index (cleared per processMapart call)
let colorCache = new Map<number, number>();

function rgbToBinary(rgb: RGB): number {
    return (Math.round(rgb.r) << 16) + (Math.round(rgb.g) << 8) + Math.round(rgb.b);
}

function clearColorCache(): void {
    colorCache.clear();
}

// ============================================================================
// CIELAB Color Space
// ============================================================================

export interface LAB {
    L: number;
    a: number;
    b: number;
}

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
    r1 = 0.04045 >= r1 ? (r1 / 12.0) : Math.pow((r1 + 0.055) / 1.055, 2.4);
    g1 = 0.04045 >= g1 ? (g1 / 12.0) : Math.pow((g1 + 0.055) / 1.055, 2.4);
    b1 = 0.04045 >= b1 ? (b1 / 12.0) : Math.pow((b1 + 0.055) / 1.055, 2.4);

    // Linear RGB to XYZ (mapartcraft uses slightly different coefficients)
    const f = (0.43605202 * r1 + 0.3850816 * g1 + 0.14308742 * b1) / 0.964221;
    const h = 0.22249159 * r1 + 0.71688604 * g1 + 0.060621485 * b1;
    const k = (0.013929122 * r1 + 0.097097 * g1 + 0.7141855 * b1) / 0.825211;

    // XYZ to Lab
    const threshold = 0.008856452;
    const l = threshold < h ? Math.pow(h, 1 / 3) : (903.2963 * h + 16.0) / 116.0;
    const m = 500.0 * ((threshold < f ? Math.pow(f, 1 / 3) : (903.2963 * f + 16.0) / 116.0) - l);
    const n = 200.0 * (l - (threshold < k ? Math.pow(k, 1 / 3) : (903.2963 * k + 16.0) / 116.0));

    // Scale L to 0-255 range (like mapartcraft)
    const lab: LAB = {
        L: 2.55 * (116.0 * l - 16.0) + 0.5,
        a: m + 0.5,
        b: n + 0.5
    };

    labCache.set(key, lab);
    return lab;
}

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
function labDistanceSq(lab1: LAB, lab2: LAB): number {
    const dL = lab1.L - lab2.L;
    const da = lab1.a - lab2.a;
    const db = lab1.b - lab2.b;
    return dL * dL + da * da + db * db;
}

function colorDistanceSq(a: RGB, b: RGB): number {
    const dr = a.r - b.r;
    const dg = a.g - b.g;
    const db = a.b - b.b;
    return dr * dr + dg * dg + db * db;
}

// ============================================================================
// Dithering Configuration
// ============================================================================

export type DitheringMode =
    | 'none'
    | 'floyd-steinberg'
    | 'atkinson'
    | 'stucki'
    | 'burkes'
    | 'sierra-lite'
    | 'ordered';

interface DitherMatrix {
    divisor: number;
    // Matrix rows: [row0, row1, row2] where each row is [col-2, col-1, col0, col+1, col+2]
    // Position [0][2] is current pixel (always 0), error distributed to right and below
    matrix: number[][];
}

const DITHER_MATRICES: Record<string, DitherMatrix> = {
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

// Bayer 4x4 threshold matrix for ordered dithering
const BAYER_4X4 = [
    [1, 9, 3, 11],
    [13, 5, 15, 7],
    [4, 12, 2, 10],
    [16, 8, 14, 6]
];

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

// ============================================================================
// Color Matching with Cache
// ============================================================================

interface ColorMatchResult {
    index: number;
    distance: number;
}

function findClosestColorIndex(
    target: RGB,
    candidates: ColorCandidate[],
    candidateLabs: LAB[],
    useCielab: boolean,
    skipCache: boolean = false
): ColorMatchResult {
    const key = rgbToBinary(target);

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
            // Use squared Euclidean in LAB (like mapartcraft)
            dist = labDistanceSq(targetLab, candidateLabs[i]);
        } else {
            dist = colorDistanceSq(target, candidates[i].rgb);
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
function findTwoClosestColors(
    target: RGB,
    candidates: ColorCandidate[],
    candidateLabs: LAB[],
    useCielab: boolean
): { first: ColorMatchResult; second: ColorMatchResult } {
    const targetLab = useCielab ? rgbToLab(target) : { L: 0, a: 0, b: 0 };

    let bestIndex = 0;
    let bestDist = Infinity;
    let secondIndex = 0;
    let secondDist = Infinity;

    for (let i = 0; i < candidates.length; i++) {
        let dist: number;
        if (useCielab) {
            // Use squared Euclidean in LAB (like mapartcraft)
            dist = labDistanceSq(targetLab, candidateLabs[i]);
        } else {
            dist = colorDistanceSq(target, candidates[i].rgb);
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

// ============================================================================
// Main Processing Function
// ============================================================================

export function processMapart(
    imageData: ImageData,
    buildMode: BuildMode,
    selectedPaletteItems: Record<number, string | null>,
    threeDPrecision: number,
    dithering: DitheringMode = 'none',
    useCielab: boolean = true
): ImageData {
    const candidates = getValidColors(selectedPaletteItems, buildMode);

    if (candidates.length === 0) {
        return imageData;
    }

    // Clear color cache for fresh processing
    clearColorCache();

    const { width, height, data } = imageData;

    // Create float buffer for error diffusion
    const floatBuffer: number[][] = [];
    for (let i = 0; i < height; i++) {
        floatBuffer[i] = [];
        for (let j = 0; j < width; j++) {
            const idx = (i * width + j) * 4;
            floatBuffer[i][j * 3] = data[idx];
            floatBuffer[i][j * 3 + 1] = data[idx + 1];
            floatBuffer[i][j * 3 + 2] = data[idx + 2];
        }
    }

    const output = new Uint8ClampedArray(data);

    // Height penalty for 3D lossy
    const normalizedPrecision = threeDPrecision / 100;
    let heightPenalty: number;
    if (threeDPrecision === 0) {
        heightPenalty = MAX_HEIGHT_PENALTY;
    } else {
        const PRACTICAL_MAX = useCielab ? 50 : 5000;
        heightPenalty = PRACTICAL_MAX * (1 - normalizedPrecision);
    }

    // Pre-compute LAB values for candidates
    const candidateLabs = candidates.map(c => rgbToLab(c.rgb));

    // Get dither matrix if using error diffusion
    const ditherMatrix = DITHER_MATRICES[dithering];
    const isErrorDiffusion = ditherMatrix !== undefined;

    if (buildMode === '3d_valley_lossy') {
        // Column-by-column processing for height tracking
        for (let x = 0; x < width; x++) {
            let currentHeight = 0;

            for (let y = 0; y < height; y++) {
                let r = floatBuffer[y][x * 3];
                let g = floatBuffer[y][x * 3 + 1];
                let b = floatBuffer[y][x * 3 + 2];

                const target: RGB = {
                    r: Math.max(0, Math.min(255, r)),
                    g: Math.max(0, Math.min(255, g)),
                    b: Math.max(0, Math.min(255, b))
                };

                let bestIndex = -1;

                if (dithering === 'ordered') {
                    // Ordered dithering: choose between two closest based on threshold
                    const twoClosest = findTwoClosestColors(target, candidates, candidateLabs, useCielab);
                    const threshold = BAYER_4X4[y % 4][x % 4];

                    // Only use second color if it's valid and ratio meets threshold
                    if (twoClosest.second.distance > 0) {
                        const ratio = (twoClosest.first.distance * 17) / twoClosest.second.distance;
                        bestIndex = ratio > threshold ? twoClosest.second.index : twoClosest.first.index;
                    } else {
                        bestIndex = twoClosest.first.index;
                    }
                } else {
                    // Find best with height constraints
                    const targetLab = useCielab ? rgbToLab(target) : { L: 0, a: 0, b: 0 };
                    let bestScore = Infinity;

                    for (let i = 0; i < candidates.length; i++) {
                        const candidate = candidates[i];

                        if (candidate.brightness === 'low' && currentHeight <= 0) {
                            continue;
                        }

                        let colorDist: number;
                        if (useCielab) {
                            colorDist = deltaE(targetLab, candidateLabs[i]);
                        } else {
                            colorDist = Math.sqrt(colorDistanceSq(target, candidate.rgb));
                        }

                        let heightCost = 0;
                        if (candidate.brightness === 'high' || candidate.brightness === 'low') {
                            heightCost = heightPenalty;
                        }

                        const score = colorDist + heightCost;
                        if (score < bestScore) {
                            bestScore = score;
                            bestIndex = i;
                        }
                    }
                }

                if (bestIndex >= 0) {
                    const best = candidates[bestIndex];
                    const idx = (y * width + x) * 4;
                    output[idx] = best.rgb.r;
                    output[idx + 1] = best.rgb.g;
                    output[idx + 2] = best.rgb.b;

                    // Error diffusion (column-adapted) - use UNCLAMPED values (like mapartcraft)
                    if (isErrorDiffusion) {
                        const errR = r - best.rgb.r;
                        const errG = g - best.rgb.g;
                        const errB = b - best.rgb.b;
                        const divisor = ditherMatrix.divisor;
                        const matrix = ditherMatrix.matrix;

                        // Distribute error based on matrix (clamp to 0-255 like Uint8ClampedArray)
                        for (let row = 0; row < matrix.length; row++) {
                            for (let col = 0; col < matrix[row].length; col++) {
                                const weight = matrix[row][col];
                                if (weight === 0) continue;

                                const nx = x + (col - 2);
                                const ny = y + row;

                                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                    floatBuffer[ny][nx * 3] = Math.max(0, Math.min(255, floatBuffer[ny][nx * 3] + errR * weight / divisor));
                                    floatBuffer[ny][nx * 3 + 1] = Math.max(0, Math.min(255, floatBuffer[ny][nx * 3 + 1] + errG * weight / divisor));
                                    floatBuffer[ny][nx * 3 + 2] = Math.max(0, Math.min(255, floatBuffer[ny][nx * 3 + 2] + errB * weight / divisor));
                                }
                            }
                        }
                    }

                    // Update height
                    if (best.brightness === 'high') currentHeight++;
                    else if (best.brightness === 'low') currentHeight--;
                }
            }
        }
    } else {
        // 2D or standard 3D: row-by-row processing
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let r = floatBuffer[y][x * 3];
                let g = floatBuffer[y][x * 3 + 1];
                let b = floatBuffer[y][x * 3 + 2];

                const target: RGB = {
                    r: Math.max(0, Math.min(255, r)),
                    g: Math.max(0, Math.min(255, g)),
                    b: Math.max(0, Math.min(255, b))
                };

                let bestIndex: number;

                if (dithering === 'ordered') {
                    // Ordered dithering with two-color selection
                    const twoClosest = findTwoClosestColors(target, candidates, candidateLabs, useCielab);
                    const threshold = BAYER_4X4[y % 4][x % 4];

                    if (twoClosest.second.distance > 0) {
                        const ratio = (twoClosest.first.distance * 17) / twoClosest.second.distance;
                        bestIndex = ratio > threshold ? twoClosest.second.index : twoClosest.first.index;
                    } else {
                        bestIndex = twoClosest.first.index;
                    }
                } else {
                    // Skip cache during error diffusion since accumulated error makes each pixel unique
                    const result = findClosestColorIndex(target, candidates, candidateLabs, useCielab, isErrorDiffusion);
                    bestIndex = result.index;
                }

                const best = candidates[bestIndex];
                const idx = (y * width + x) * 4;
                output[idx] = best.rgb.r;
                output[idx + 1] = best.rgb.g;
                output[idx + 2] = best.rgb.b;

                // Error diffusion - use UNCLAMPED values (like mapartcraft) for proper error propagation
                if (isErrorDiffusion) {
                    const errR = r - best.rgb.r;
                    const errG = g - best.rgb.g;
                    const errB = b - best.rgb.b;
                    const divisor = ditherMatrix.divisor;
                    const matrix = ditherMatrix.matrix;

                    for (let row = 0; row < matrix.length; row++) {
                        for (let col = 0; col < matrix[row].length; col++) {
                            const weight = matrix[row][col];
                            if (weight === 0) continue;

                            const nx = x + (col - 2);
                            const ny = y + row;

                            // Clamp to 0-255 to mimic Uint8ClampedArray behavior
                            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                floatBuffer[ny][nx * 3] = Math.max(0, Math.min(255, floatBuffer[ny][nx * 3] + errR * weight / divisor));
                                floatBuffer[ny][nx * 3 + 1] = Math.max(0, Math.min(255, floatBuffer[ny][nx * 3 + 1] + errG * weight / divisor));
                                floatBuffer[ny][nx * 3 + 2] = Math.max(0, Math.min(255, floatBuffer[ny][nx * 3 + 2] + errB * weight / divisor));
                            }
                        }
                    }
                }
            }
        }
    }

    return new ImageData(output, width, height);
}

// ============================================================================
// EXPERIMENTAL - A/B Testing Function
// Modify this function to test improvements without affecting main algorithm
// ============================================================================

export function processMapartExperimental(
    imageData: ImageData,
    buildMode: BuildMode,
    selectedPaletteItems: Record<number, string | null>,
    threeDPrecision: number,
    dithering: DitheringMode = 'none',
    useCielab: boolean = true
): ImageData {
    // For now, just call the original function
    // TODO: Add experimental improvements here
    return processMapart(imageData, buildMode, selectedPaletteItems, threeDPrecision, dithering, useCielab);
}
