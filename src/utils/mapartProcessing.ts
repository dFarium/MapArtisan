import paletteData from '../data/palette.json';
import { MAPART } from './constants.ts';
import type { RGB, BrightnessLevel, MapartStats, BuildMode } from '../types/mapart';

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

export type { BuildMode };


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
    for (let i = 0; i < tonos.length; i++) {
        const t = tonos[i];
        if (t === -1) {
            // Check safe drop target
            const alturaSegura = ref[i + 1] - minFuturo[i + 1];
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
        } else if (buildMode === 'staircase') {
            levels = ['high'];
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
    skipCache: boolean = false,
    heightPenalty: number = 0
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

        // Apply 3D Precision Penalty
        // If block is not flat (normal) and we have a penalty, add it to distance.
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
function findTwoClosestColors(
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
            // Use squared Euclidean in LAB (like mapartcraft)
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
    _optimizeHeight: boolean = false
): { imageData: ImageData; stats: MapartStats; toneMap: Int8Array; blockIndices: Int32Array; candidates: ColorCandidate[] } {
    const candidates = getValidColors(selectedPaletteItems, buildMode);

    if (candidates.length === 0) {
        return {
            imageData,
            stats: {
                minHeight: 0,
                maxHeight: 0,
                heightMap: new Int32Array(imageData.width).fill(0)
            },
            toneMap: new Int8Array(imageData.width * imageData.height),
            blockIndices: new Int32Array(imageData.width * imageData.height),
            candidates: []
        };
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
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            // Alpha ignored

            // Just load RGB, ignore Alpha
            // If alpha is 0, RGB is usually 0,0,0
            floatBuffer[i][j * 3] = r;
            floatBuffer[i][j * 3 + 1] = g;
            floatBuffer[i][j * 3 + 2] = b;
        }
    }

    const output = new Uint8ClampedArray(data);

    // Height penalty for 3D Precision Slider
    const normalizedPrecision = threeDPrecision / 100;
    let heightPenalty = 0;

    if (buildMode === '3d_valley') {
        if (threeDPrecision < 100) {
            const PRACTICAL_MAX = useCielab ? 10000 : 200000;
            heightPenalty = PRACTICAL_MAX * (1 - normalizedPrecision);
            // Make 0% absolute refusal
            if (threeDPrecision === 0) heightPenalty = Infinity;
        }
    }

    // Pre-compute LAB values for candidates
    const candidateLabs = candidates.map(c => rgbToLab(c.rgb));

    // Stats tracking
    let overallMin = 0;
    let overallMax = 0;
    const colHeights = new Int32Array(width).fill(0);

    // Get dither matrix if using error diffusion
    const effectiveDithering = (dithering === 'adaptive' || dithering === 'hybrid') ? 'floyd-steinberg' : dithering;
    const ditherMatrix = DITHER_MATRICES[effectiveDithering];
    const isErrorDiffusion = ditherMatrix !== undefined || dithering === 'hybrid';
    const baseErrorScale = dithering === 'adaptive' ? 0.85 : 1.0;
    const isHybrid = dithering === 'hybrid';
    const fsMatrix = DITHER_MATRICES['floyd-steinberg']; // For hybrid mode

    // Tone Map for Smart Drop Optimization phase
    const toneMap = new Int8Array(width * height);

    // Block Indices Map (for Picker)
    const blockIndices = new Int32Array(width * height);

    {
        // Standard Processing
        for (let y = 0; y < height; y++) {
            // Independent Maps: Reset column heights at row boundary
            if (independentMaps && y > 0 && y % 128 === 0) {
                colHeights.fill(0);
            }

            for (let x = 0; x < width; x++) {

                // (Alpha handling removed, processing all pixels)

                let r = floatBuffer[y][x * 3];
                let g = floatBuffer[y][x * 3 + 1];
                let b = floatBuffer[y][x * 3 + 2];

                const target: RGB = {
                    r: Math.max(0, Math.min(255, r)),
                    g: Math.max(0, Math.min(255, g)),
                    b: Math.max(0, Math.min(255, b))
                };

                let bestRGB: RGB;
                let bestBrightness: BrightnessLevel;
                let bestIndex: number;

                if (dithering === 'ordered' || dithering === 'ordered-8x8') {
                    // Ordered dithering
                    const twoClosest = findTwoClosestColors(target, candidates, candidateLabs, useCielab, heightPenalty);
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
                    // Error diffusion / None
                    const result = findClosestColorIndex(target, candidates, candidateLabs, useCielab, isErrorDiffusion, heightPenalty);
                    bestIndex = result.index;
                }

                const best = candidates[bestIndex];
                bestRGB = best.rgb;
                bestBrightness = best.brightness;

                const idx = (y * width + x) * 4;
                output[idx] = bestRGB.r;
                output[idx + 1] = bestRGB.g;
                output[idx + 2] = bestRGB.b;
                output[idx + 3] = 255; // Force opacity

                // Save Block Index
                blockIndices[y * width + x] = bestIndex;

                // Save Tone decision for Phase 2
                if (buildMode === '3d_valley') {
                    let tone = 0;
                    if (bestBrightness === 'high') tone = 1;
                    else if (bestBrightness === 'low') tone = -1;
                    toneMap[y * width + x] = tone; // Store in row-major order
                }

                // Update height stats (standard/2d modes)
                if (bestBrightness === 'high') colHeights[x]++;
                else if (bestBrightness === 'low') colHeights[x]--;

                if (colHeights[x] > overallMax) overallMax = colHeights[x];
                if (colHeights[x] < overallMin) overallMin = colHeights[x];

                // Error diffusion
                if (isErrorDiffusion) {
                    let errorScale = baseErrorScale;

                    if (isHybrid) {
                        const variance = calculateLocalVariance(floatBuffer, x, y, width, height);
                        const quantErrorSq = (r - bestRGB.r) ** 2 + (g - bestRGB.g) ** 2 + (b - bestRGB.b) ** 2;
                        const minScale = (hybridStrength / 100) * 1.0;
                        const invStrength = 100 - hybridStrength;
                        const varianceLow = 50 + (invStrength / 100) * 950;
                        const varianceHigh = 500 + (invStrength / 100) * 5500;
                        const quantErrorThreshold = 1000;

                        if (quantErrorSq > quantErrorThreshold) {
                            const strengthFactor = hybridStrength / 100;
                            const boostFactor = Math.min(1.0, quantErrorSq / 5000) * strengthFactor;
                            errorScale = minScale + (1.0 - minScale) * boostFactor;
                        } else if (variance < varianceLow) {
                            errorScale = minScale;
                        } else if (variance > varianceHigh) {
                            errorScale = 1.0;
                        } else {
                            const t = (variance - varianceLow) / (varianceHigh - varianceLow);
                            errorScale = minScale + t * (1.0 - minScale);
                        }
                    }

                    const errR = (r - bestRGB.r) * errorScale;
                    const errG = (g - bestRGB.g) * errorScale;
                    const errB = (b - bestRGB.b) * errorScale;
                    const activeMatrix = isHybrid ? fsMatrix : ditherMatrix;
                    const divisor = activeMatrix.divisor;
                    const matrix = activeMatrix.matrix;

                    for (let row = 0; row < matrix.length; row++) {
                        for (let col = 0; col < matrix[row].length; col++) {
                            const weight = matrix[row][col];
                            if (weight === 0) continue;

                            const nx = x + (col - 2);
                            const ny = y + row;

                            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
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
        if (buildMode === '3d_valley') {
            overallMin = 0;
            overallMax = 0;
            // We need to store height map for 3D preview
            // Since 3D mode can have independent maps, we should probably store the height relative to each column's start
            // processed by optimizeColumnHeights.

            // Reset colHeights to be used for 3D height map
            colHeights.fill(0);

            // Process each column
            for (let x = 0; x < width; x++) {
                const columnTones = [];
                for (let y = 0; y < height; y++) {
                    columnTones.push(toneMap[y * width + x]); // Extract tone from flat array
                }

                // Split into chunks if independentMaps
                if (independentMaps) {
                    const numChunks = Math.ceil(height / 128);
                    for (let c = 0; c < numChunks; c++) {
                        const startY = c * 128;
                        const endY = Math.min((c + 1) * 128, height);
                        const chunkTones = columnTones.slice(startY, endY);
                        // Optimize this chunk
                        const { min, max } = optimizeColumnHeights(chunkTones);

                        if (min < overallMin) overallMin = min;
                        if (max > overallMax) overallMax = max;

                        // Fill colHeights for 3D preview?
                        // The path returned is 0-based relative to start of optimization.
                        // We can't easily represent full 3D terrain with just colHeights (1 value per x).
                        // 3D terrain needs height per pixel (x,y).
                        // colHeights in 2D mode is just "how high is the stack".
                        // in 3D valley, Y change per pixel.
                        // We need a full 2D array for height map if we want to visualize it properly?
                        // stats.heightMap is Int32Array(width).
                        // Let's repurpose it or add a new field if needed.
                        // For now, let's just store the "max height" of the column in colHeights for the graph?
                        // Or maybe we don't update colHeights for 3D valley in stats and relying on something else?
                        // Actually, the current graph expects "Blocks Required" (height range).
                        // So max - min is the range.

                        const range = max - min;
                        // For independent maps, we might want the max range of any chunk in the column?
                        // or just the last one? 
                        // Let's store the Accumulative Range for standard stats display.
                        if (range > colHeights[x]) colHeights[x] = range;
                    }
                } else {
                    // Full column optimization
                    const { min, max } = optimizeColumnHeights(columnTones);
                    if (min < overallMin) overallMin = min;
                    if (max > overallMax) overallMax = max;
                    colHeights[x] = max - min;
                }
            }
        }
    }

    return {
        imageData: new ImageData(output, width, height),
        stats: {
            minHeight: overallMin,
            maxHeight: overallMax,
            heightMap: colHeights
        },
        toneMap,
        blockIndices,
        candidates
    };
}

/**
 * Applies manual edits to the existing image data and updates stats.
 * This is a lighter operation than full reprocessing.
 */
export function applyManualEdits(
    baseImageData: ImageData,
    baseToneMap: Int8Array,
    manualEdits: Record<number, { blockId: string; brightness: BrightnessLevel; rgb: RGB }>,
    buildMode: BuildMode
): { imageData: ImageData; stats: MapartStats; toneMap: Int8Array } {
    const { width, height, data } = baseImageData;

    // Clone data to avoid mutating base
    const newData = new Uint8ClampedArray(data);
    const newToneMap = new Int8Array(baseToneMap); // Copy tone map

    // Apply edits
    for (const [indexStr, edit] of Object.entries(manualEdits)) {
        const index = Number(indexStr);
        const x = index % width;
        const y = Math.floor(index / width);

        if (x >= width || y >= height) continue;

        const idx = index * 4;
        newData[idx] = edit.rgb.r;
        newData[idx + 1] = edit.rgb.g;
        newData[idx + 2] = edit.rgb.b;
        newData[idx + 3] = 255;

        // Update Tone Map for this pixel
        if (buildMode === '3d_valley' || buildMode === 'staircase') {
            let tone = 0;
            if (edit.brightness === 'high') tone = 1;
            else if (edit.brightness === 'low') tone = -1;
            newToneMap[index] = tone;
        }
    }

    // Recalculate Height Stats (Required because tones changed)
    let overallMin = 0;
    let overallMax = 0;
    // We need to update the heightMap (colHeights) as well for the graph to update
    const colHeights = new Int32Array(width).fill(0);

    if (buildMode === '3d_valley' || buildMode === 'staircase') {

        // Optimize each column again with new tones
        for (let x = 0; x < width; x++) {
            const columnTones = [];
            for (let y = 0; y < height; y++) {
                columnTones.push(newToneMap[y * width + x]);
            }
            const { min, max } = optimizeColumnHeights(columnTones);
            if (min < overallMin) overallMin = min;
            if (max > overallMax) overallMax = max;
            colHeights[x] = max - min;
        }
    } else {
        // Re-scan 2D heights if we were in 2D mode (manual edits might change brightness)
        // But 2D mode manual edits on brightness don't change height (flat).
        // Actually, if user changes brightness manually, it might imply a block change.
        // In 2D mode, brightness is forced to 'normal'.
        // So manual edits shouldn't affect height in 2D really.
        // But let's be safe and just zero it or keep it consistent.
    }

    return {
        imageData: new ImageData(newData, width, height),
        stats: {
            minHeight: overallMin,
            maxHeight: overallMax,
            heightMap: colHeights
        },
        toneMap: newToneMap
    };
}


/**
 * Suggests a dithering mode based on image characteristics.
 */
export function suggestDitheringMode(imageData: ImageData): { mode: DitheringMode; strength: number } {
    const { width, height, data } = imageData;
    const pixelCount = width * height;

    // Calculate simple variance of the image
    let sumGray = 0;
    let sumGraySq = 0;

    // Sample a subset of pixels for performance
    const step = Math.max(1, Math.floor(pixelCount / 1000));
    let samples = 0;

    for (let i = 0; i < pixelCount; i += step) {
        const idx = i * 4;
        const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        sumGray += gray;
        sumGraySq += gray * gray;
        samples++;
    }

    const mean = sumGray / samples;
    const variance = (sumGraySq / samples) - (mean * mean);
    const stdDev = Math.sqrt(variance);

    // Heuristic:
    // Low variance -> Flat image (e.g. cartoon) -> ordered dither works well or none
    // High variance -> Detailed photo -> Hybrid or Adaptive

    if (stdDev < 20) {
        return { mode: 'ordered', strength: 50 };
    } else if (stdDev < 50) {
        return { mode: 'floyd-steinberg', strength: 50 };
    } else {
        return { mode: 'hybrid', strength: 75 };
    }
}
