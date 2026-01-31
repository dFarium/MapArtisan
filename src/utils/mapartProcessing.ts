import paletteData from '../data/palette_1_21_11.json' with { type: 'json' };
import { MAPART } from './constants.ts';

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

export type BuildMode = '2d' | '3d_valley';

const MAX_HEIGHT_PENALTY = MAPART.MAX_HEIGHT_PENALTY;

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

export interface MapartStats {
    minHeight: number;
    maxHeight: number;
    heightMap?: Int32Array; // Optional full height map for analysis
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
        L: MAPART.CIELAB_SCALE / 100 * (MAPART.LAB_L_FACTOR * l - MAPART.LAB_L_OFFSET) + 0.5, // Approx scaling
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
    | 'ordered'
    | 'ordered-8x8'
    | 'adaptive'
    | 'hybrid';

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

// Bayer 4x4 threshold matrix for ordered dithering (values 1-16)
const BAYER_4X4 = [
    [1, 9, 3, 11],
    [13, 5, 15, 7],
    [4, 12, 2, 10],
    [16, 8, 14, 6]
];

// Bayer 8x8 threshold matrix for ordered dithering (values 1-64)
const BAYER_8X8 = [
    [1, 49, 13, 61, 4, 52, 16, 64],
    [33, 17, 45, 29, 36, 20, 48, 32],
    [9, 57, 5, 53, 12, 60, 8, 56],
    [41, 25, 37, 21, 44, 28, 40, 24],
    [3, 51, 15, 63, 2, 50, 14, 62],
    [35, 19, 47, 31, 34, 18, 46, 30],
    [11, 59, 7, 55, 10, 58, 6, 54],
    [43, 27, 39, 23, 42, 26, 38, 22]
];

// ============================================================================
// Hybrid Dithering - Local Variance Analysis
// ============================================================================

// Hybrid variance thresholds are now calculated dynamically based on hybridStrength parameter

/**
 * Calculate local variance in a 3x3 window around a pixel.
 * Returns the sum of squared differences from the center pixel.
 */
function calculateLocalVariance(
    floatBuffer: number[][],
    x: number,
    y: number,
    width: number,
    height: number
): number {
    const centerR = floatBuffer[y][x * 3];
    const centerG = floatBuffer[y][x * 3 + 1];
    const centerB = floatBuffer[y][x * 3 + 2];

    let variance = 0;
    let count = 0;

    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;

            const nx = x + dx;
            const ny = y + dy;

            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const dr = floatBuffer[ny][nx * 3] - centerR;
                const dg = floatBuffer[ny][nx * 3 + 1] - centerG;
                const db = floatBuffer[ny][nx * 3 + 2] - centerB;
                variance += dr * dr + dg * dg + db * db;
                count++;
            }
        }
    }

    return count > 0 ? variance / count : 0;
}

// ============================================================================
// Smart Drop Optimization (Ported from Python)
// ============================================================================

/**
 * Optimizes the height profile of a column to minimize the total height range.
 * Uses a "Smart Drop" strategy that capitalizes on shadow blocks (tone -1)
 * to drop deeper when safe, recovering height for future climbs.
 */
export function optimizeColumnHeights(tonos: number[]): { min: number; max: number; path: number[] } {
    // 1. Reference (Classic Approach)
    const ref = [0];
    for (const t of tonos) {
        if (t === 1) ref.push(ref[ref.length - 1] + 1);
        else if (t === 0) ref.push(ref[ref.length - 1]);
        else if (t === -1) ref.push(ref[ref.length - 1] - 1);
    }

    // 2. Suffix Min (Future Lookahead)
    const n = ref.length;
    const minFuturo = new Int32Array(n);
    let currentMin = Infinity;
    for (let i = n - 1; i >= 0; i--) {
        if (ref[i] < currentMin) currentMin = ref[i];
        minFuturo[i] = currentMin;
    }

    // 3. Smart Drop Construction
    const path: number[] = []; // Starting at 0 (implicit, strictly not needed for output length=tonos.length)
    let currentOpt = 0;
    let maxOpt = 0;
    let minOpt = 0;

    // We generate the path corresponding to each tone.
    // Note: The Python script returned the *heights*. The 'path' array here will store the height AFTER each block.
    // But wait, the loop iterates `tonos`.
    for (let i = 0; i < tonos.length; i++) {
        const t = tonos[i];
        if (t === -1) {
            // Check safe drop target
            // ref[i+1] is the classic height after this step
            // minFuturo[i+1] is the lowest point the classic path ever reaches from here onwards
            const alturaSegura = ref[i + 1] - minFuturo[i + 1];

            // If we can drop deeper than just -1 (currentOpt - 1), do it.
            // We want to be as low as possible (since we are forced to go UP later).
            // But we can't go so low that we can't climb back up?
            // Actually, the logic is: "If we drop to X, will we ever be forced to go lower than X later solely due to the pattern?"
            // ref[i+1] - minFuturo[i+1] calculates the "margin" we have above the future minimum.
            // Wait, let's trace:
            // ref starts at 0.
            // If ref goes 0 -> 1 -> 2 -> 1 -> 0.
            // minFuturo at index 0 (val 0) is 0.
            // minFuturo at index 1 (val 1) is 0.
            // minFuturo at index 2 (val 2) is 0.

            // Python logic: `altura_segura = ref[i+1] - min_futuro[i+1]`
            // `if altura_segura < current_opt: current_opt = altura_segura`
            // `else: current_opt -= 1`

            // This suggests we jump DOWN to `altura_segura` if it's lower than performing a standard step.
            // Basically, reset to the lowest possible safe baseline.

            if (alturaSegura < currentOpt) {
                currentOpt = alturaSegura;
            } else {
                currentOpt -= 1;
            }
        } else if (t === 1) {
            currentOpt += 1;
        }
        // If t == 0, currentOpt stays same.

        path.push(currentOpt);

        if (currentOpt > maxOpt) maxOpt = currentOpt;
        if (currentOpt < minOpt) minOpt = currentOpt;
    }

    return { min: minOpt, max: maxOpt, path };
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
    useCielab: boolean = true,
    hybridStrength: number = 50,
    independentMaps: boolean = false,
    optimizeHeight: boolean = false // New parameter for "Safe Reset" strategy
): { imageData: ImageData; stats: MapartStats } {
    const candidates = getValidColors(selectedPaletteItems, buildMode);

    if (candidates.length === 0) {
        return { imageData, stats: { minHeight: 0, maxHeight: 0 } };
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

    // Stats tracking
    let overallMin = 0;
    let overallMax = 0;
    const colHeights = new Int32Array(width).fill(0);

    // Get dither matrix if using error diffusion
    // 'adaptive' mode uses Floyd-Steinberg with reduced error propagation
    // 'hybrid' mode uses Floyd-Steinberg with variance-based error scaling
    const effectiveDithering = (dithering === 'adaptive' || dithering === 'hybrid') ? 'floyd-steinberg' : dithering;
    const ditherMatrix = DITHER_MATRICES[effectiveDithering];
    const isErrorDiffusion = ditherMatrix !== undefined || dithering === 'hybrid';
    const baseErrorScale = dithering === 'adaptive' ? 0.85 : 1.0;
    const isHybrid = dithering === 'hybrid';
    const fsMatrix = DITHER_MATRICES['floyd-steinberg']; // For hybrid mode



    // 3d_valley_lossy removed. Using standard path.
    {
        // Standard Processing (2D or 3D Valley)

        // Tone Map for Smart Drop Optimization phase (initialized to 0)
        // Values: 1 (High), -1 (Low), 0 (Normal)
        // We use Int8Array for memory efficiency.
        const toneMap = new Int8Array(width * height);

        for (let y = 0; y < height; y++) {
            // Independent Maps: Reset column heights at row boundary
            if (independentMaps && y > 0 && y % 128 === 0) {
                colHeights.fill(0);
                // Also, preventing error diffusion across y-boundary (vertical bleeding)
                // involves clearing the relevant parts of floatBuffer or just accepting it.
                // Height reset is the critical part.
            }

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

                if (dithering === 'ordered' || dithering === 'ordered-8x8') {
                    // Ordered dithering with two-color selection
                    const twoClosest = findTwoClosestColors(target, candidates, candidateLabs, useCielab);
                    const is8x8 = dithering === 'ordered-8x8';
                    const threshold = is8x8 ? BAYER_8X8[y % 8][x % 8] : BAYER_4X4[y % 4][x % 4];
                    const maxThreshold = is8x8 ? 65 : 17;

                    if (twoClosest.second.distance > 0) {
                        const ratio = (twoClosest.first.distance * maxThreshold) / twoClosest.second.distance;
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

                // Save Tone decision for Phase 2
                if (buildMode === '3d_valley') {
                    let tone = 0;
                    if (best.brightness === 'high') tone = 1;
                    else if (best.brightness === 'low') tone = -1;
                    toneMap[y * width + x] = tone; // Store in row-major order
                }

                // Update height stats (standard/2d modes)
                if (best.brightness === 'high') colHeights[x]++;
                else if (best.brightness === 'low') colHeights[x]--;

                if (colHeights[x] > overallMax) overallMax = colHeights[x];
                if (colHeights[x] < overallMin) overallMin = colHeights[x];

                // Error diffusion - use UNCLAMPED values (like mapartcraft) for proper error propagation
                if (isErrorDiffusion) {
                    // Calculate error scale based on mode
                    let errorScale = baseErrorScale;

                    if (isHybrid) {
                        // Hybrid mode: adjust error scale based on local variance AND quantization error
                        const variance = calculateLocalVariance(floatBuffer, x, y, width, height);

                        // Calculate quantization error (how far is the chosen color from the original?)
                        const quantErrorSq = (r - best.rgb.r) ** 2 + (g - best.rgb.g) ** 2 + (b - best.rgb.b) ** 2;

                        // User-controlled thresholds based on hybridStrength (0-100)
                        // hybridStrength=0: Absolute noise reduction (minScale=0.0) -> Solid colors
                        // hybridStrength=100: full F-S (minScale=1.0)
                        const minScale = (hybridStrength / 100) * 1.0;

                        // Variance thresholds - INVERTED LOGIC relative to strength
                        // Low Strength (0) = Aggressive Noise Reduction = EXTREME Thresholds
                        // High Strength (100) = Max Detail = LOW Thresholds
                        const invStrength = 100 - hybridStrength;
                        const varianceLow = 50 + (invStrength / 100) * 950;   // Strength 100->50, Strength 0->1000
                        const varianceHigh = 500 + (invStrength / 100) * 5500; // Strength 100->500, Strength 0->6000

                        // If quantization error is high, use more dithering regardless of variance
                        // This preserves gradients like the moon detail
                        // BUT: If hybridStrength is low, we ignore this validly to force posterization (user preference)
                        const quantErrorThreshold = 1000; // ~sqrt(1000) ≈ 31 per channel difference

                        if (quantErrorSq > quantErrorThreshold) {
                            // High quantization error: boost error scale to preserve detail
                            // Scale boost by hybridStrength: 0% strength -> 0% boost (force solid), 100% strength -> full boost
                            const strengthFactor = hybridStrength / 100;
                            const boostFactor = Math.min(1.0, quantErrorSq / 5000) * strengthFactor;
                            errorScale = minScale + (1.0 - minScale) * boostFactor;
                        } else if (variance < varianceLow) {
                            // Flat area with good color match: minimal dithering
                            errorScale = minScale;
                        } else if (variance > varianceHigh) {
                            // Edge/detail: full error diffusion
                            errorScale = 1.0;
                        } else {
                            // Gradient: interpolate
                            const t = (variance - varianceLow) / (varianceHigh - varianceLow);
                            errorScale = minScale + t * (1.0 - minScale);
                        }
                    }

                    const errR = (r - best.rgb.r) * errorScale;
                    const errG = (g - best.rgb.g) * errorScale;
                    const errB = (b - best.rgb.b) * errorScale;
                    const activeMatrix = isHybrid ? fsMatrix : ditherMatrix;
                    const divisor = activeMatrix.divisor;
                    const matrix = activeMatrix.matrix;

                    for (let row = 0; row < matrix.length; row++) {
                        for (let col = 0; col < matrix[row].length; col++) {
                            const weight = matrix[row][col];
                            if (weight === 0) continue;

                            const nx = x + (col - 2);
                            const ny = y + row;

                            // Clamp to 0-255 to mimic Uint8ClampedArray behavior
                            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                // Independent Maps: Prevent error from bleeding into the next map vertical chunk
                                if (independentMaps) {
                                    const currentMapIndex = Math.floor(y / 128);
                                    const nextMapIndex = Math.floor(ny / 128);
                                    if (currentMapIndex !== nextMapIndex) continue;
                                }

                                floatBuffer[ny][nx * 3] = Math.max(0, Math.min(255, floatBuffer[ny][nx * 3] + errR * weight / divisor));
                                floatBuffer[ny][nx * 3 + 1] = Math.max(0, Math.min(255, floatBuffer[ny][nx * 3 + 1] + errG * weight / divisor));
                                floatBuffer[ny][nx * 3 + 2] = Math.max(0, Math.min(255, floatBuffer[ny][nx * 3 + 2] + errB * weight / divisor));
                            }
                        }
                    }
                }
            }
        }

        // ============================================================================
        // Phase 2: Height Optimization (Smart Drop) for 3D Valley
        // ============================================================================
        // If we are in 3d_valley mode, we now optimize the columns and recalculate stats.
        if (buildMode === '3d_valley') {
            overallMin = 0;
            overallMax = 0;

            // Process each column
            for (let x = 0; x < width; x++) {
                const columnTones: number[] = [];
                for (let y = 0; y < height; y++) {
                    columnTones.push(toneMap[y * width + x]); // Corrected indexing
                }

                // Apply Smart Drop
                const { min, max, path } = optimizeColumnHeights(columnTones);

                // Update global stats
                if (min < overallMin) overallMin = min;
                if (max > overallMax) overallMax = max;

                // Update the final height of this column (last element of path)
                // This mimics the 'colHeights' behavior expected by the stats object
                if (path.length > 0) {
                    colHeights[x] = path[path.length - 1];
                } else {
                    colHeights[x] = 0;
                }
            }
        }
    }

    // Capture full height map for analysis if needed (optional optimization?)
    // For now, let's just return the column heights array which tracks the final elevation of each column.
    // Actually, for true 3D valley mode, we want to know the height at every pixel?
    // No, standard mapart is built column by column (Z-axis is image Y).
    // The "height" is the Y-level (elevation).
    // In "3d_valley_lossy", we process column by column. The `currentHeight` variable tracks the elevation.
    // We should capture this profile.

    // Let's attach the final column elevations to stats.
    return {
        imageData: new ImageData(output, width, height),
        stats: {
            minHeight: overallMin,
            maxHeight: overallMax,
            heightMap: colHeights // This tracks the final elevation of the South-most block of each column
        }
    };
}

export function suggestDitheringMode(imageData: ImageData): { mode: DitheringMode; strength: number } {
    const { width, height, data } = imageData;
    const stride = 10; // Sample every 10th pixel for performance
    let totalVariance = 0;
    let samples = 0;
    let flatSamples = 0;

    // Create a temporary float buffer for variance calculation (only for sampled area)
    // To properly use calculateLocalVariance, we need a buffer. 
    // Since we can't easily recreate the full buffer efficiently just for sampling without cost,
    // we'll implement a simplified direct variance check here.

    for (let y = 1; y < height - 1; y += stride) {
        for (let x = 1; x < width - 1; x += stride) {
            const idx = (y * width + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            // Calculate variance with 4 neighbors (up, down, left, right)
            let localVar = 0;
            const neighbors = [
                ((y - 1) * width + x) * 4,
                ((y + 1) * width + x) * 4,
                ((y) * width + (x - 1)) * 4,
                ((y) * width + (x + 1)) * 4
            ];

            for (const nIdx of neighbors) {
                const nr = data[nIdx];
                const ng = data[nIdx + 1];
                const nb = data[nIdx + 2];
                localVar += (r - nr) ** 2 + (g - ng) ** 2 + (b - nb) ** 2;
            }

            const avgLocalVar = localVar / 4;
            totalVariance += avgLocalVar;
            if (avgLocalVar < 100) flatSamples++;
            samples++;
        }
    }

    const avgVariance = samples > 0 ? totalVariance / samples : 0;
    const flatRatio = samples > 0 ? flatSamples / samples : 0;

    // Heuristics
    // High variance -> Photo/Complex -> Dithering needed (Stucki/Floyd)
    // Low variance -> Graphic/Logo -> No dithering or simple
    // Mixed -> Hybrid

    if (flatRatio > 0.8) {
        // Mostly flat (cartoon/logo)
        return { mode: 'none', strength: 0 };
    } else if (avgVariance < 500) {
        // Moderate complexity
        return { mode: 'hybrid', strength: 50 };
    } else {
        // High complexity (photo)
        return { mode: 'stucki', strength: 100 };
    }
}
