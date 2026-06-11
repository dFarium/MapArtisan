/**
 * Map Art Processing - Main Entry Point
 * 
 * This module exports the main processing functions and re-exports
 * utilities from sub-modules for backwards compatibility.
 */

import type { RGB, BrightnessLevel, MapartStats, BuildMode } from '../types/mapart';

// Re-export from sub-modules
export {
    // Color Space
    type LAB,
    rgbToLab,
    deltaE,
    clearColorCache,
    packPixel,
    unpackCandidateIdx,
    unpackTone,
    unpackNeedsSupport,

    // Dithering
    type DitheringMode,
    type FlatDitherKernel,
    buildFlatDitherKernel,
    DITHER_MATRICES,
    BAYER_4X4,
    BAYER_8X8,
    calculateLocalVariance,

    // Height Optimization
    optimizeColumnHeights,

    // Color Matching
    type ColorCandidate,
    type CandidatesSoA,
    buildCandidatesSoA,
    getValidColors,
    findClosestColorIndex,
    findTwoClosestColors
} from './processing';

// Import for internal use
import {
    clearColorCache,
    packPixel,
    unpackCandidateIdx,
    unpackTone,
    unpackNeedsSupport,
    type DitheringMode,
    type FlatDitherKernel,
    buildFlatDitherKernel,
    DITHER_MATRICES,
    BAYER_4X4,
    BAYER_8X8,
    calculateLocalVariance,
    optimizeColumnHeights,
    type SmartDropWorkspace,
    type ColorCandidate,
    buildCandidatesSoA,
    getValidColors,
    findClosestColorIndex,
    findTwoClosestColors
} from './processing';

export type { BuildMode };

// ============================================================================
// Main Processing Function
// ============================================================================

/**
 * Coordinates and runs the full image-to-mapart conversion pipeline.
 *
 * Execution flow:
 * 1. Resolves color candidates matching selection filters.
 * 2. Allocates a padded Float32Array working buffer (left/right/bottom padding) to eliminate boundary checks in error diffusion.
 * 3. Compiles a flat 1D representation of the dithering error distribution kernel.
 * 4. Loops through pixels, performing color matching, ordered/diffusion dithering, and packing results.
 * 5. Runs the "Smart Drop" height optimization algorithm to compute vertical layout offsets.
 *
 * @param imageData Raw input pixel data.
 * @param buildMode Structural target layout (2D flat vs 3D valley steps).
 * @param selectedPaletteItems Selected color indices mapped to block namespaces.
 * @param threeDPrecision Height limits/precision slider percentage.
 * @param dithering Pixel thresholding and error diffusion strategy.
 * @param usePerceptual Flag to compare colors in OKLab perceptual space rather than RGB.
 * @param hybridStrength Weighting multiplier for hybrid/adaptive dithering.
 * @param independentMaps Separate map layouts for individual centering grids.
 */
export function processMapart(
    imageData: ImageData,
    buildMode: BuildMode,
    selectedPaletteItems: Record<number, string | null>,
    threeDPrecision: number,
    dithering: DitheringMode = 'none',
    usePerceptual: boolean = true,
    hybridStrength: number = 50,
    independentMaps: boolean = false
): { imageData: ImageData; stats: MapartStats; packedResults: Uint32Array; candidates: ColorCandidate[]; heightPath: Int32Array | null } {
    const candidates = getValidColors(selectedPaletteItems, buildMode);

    if (candidates.length === 0) {
        return {
            imageData,
            stats: {
                minHeight: 0,
                maxHeight: 0,
                heightMap: new Int32Array(imageData.width).fill(0)
            },
            packedResults: new Uint32Array(imageData.width * imageData.height),
            candidates: [],
            heightPath: null
        };
    }

    // Clear color cache for fresh processing
    clearColorCache();

    const { width, height, data } = imageData;

    // Allocate padded Float32Array buffer:
    // Left/Right padding: 2 columns each, Bottom padding: 2 rows.
    const PADDING_LEFT = 2;
    const PADDING_RIGHT = 2;
    const PADDING_BOTTOM = 2;
    const paddedWidth = width + PADDING_LEFT + PADDING_RIGHT;
    const paddedHeight = height + PADDING_BOTTOM;

    const floatBuffer = new Float32Array(paddedWidth * paddedHeight * 3);
    for (let i = 0; i < height; i++) {
        const srcRowOffset = i * width;
        const destRowOffset = i * paddedWidth + PADDING_LEFT;
        for (let j = 0; j < width; j++) {
            const srcIdx = (srcRowOffset + j) * 4;
            const destIdx = (destRowOffset + j) * 3;
            floatBuffer[destIdx] = data[srcIdx];
            floatBuffer[destIdx + 1] = data[srcIdx + 1];
            floatBuffer[destIdx + 2] = data[srcIdx + 2];
        }
    }

    const output = new Uint8ClampedArray(data);

    // Height penalty for 3D Precision Slider
    const normalizedPrecision = threeDPrecision / 100;
    let heightPenalty = 0;

    if (buildMode === '3d_valley') {
        if (threeDPrecision < 100) {
            const PRACTICAL_MAX = usePerceptual ? 0.25 : 200000;
            heightPenalty = PRACTICAL_MAX * (1 - normalizedPrecision);
            if (threeDPrecision === 0) heightPenalty = Infinity;
        }
    }

    // Pre-compute Struct of Arrays for candidates
    const candidatesSoA = buildCandidatesSoA(candidates);

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
    const fsMatrix = DITHER_MATRICES['floyd-steinberg'];

    // Pre-compute flat dither kernel using paddedWidth
    let activeKernel: FlatDitherKernel | null = null;
    if (isErrorDiffusion) {
        const matrixToUse = isHybrid ? fsMatrix : ditherMatrix;
        activeKernel = buildFlatDitherKernel(matrixToUse, paddedWidth);
    }

    // Packed results buffer (stores candidateIndex, tone/brightness adjustments, and support flag in a single Uint32 per pixel)
    const packedResults = new Uint32Array(width * height);

    // Will be populated during the Smart Drop phase for 3D valley mode.
    // Column-major layout: heightPath[x * height + y] = normalized Y for column x, row y.
    let heightPath: Int32Array | null = null;


    {
        // Standard Processing
        for (let y = 0; y < height; y++) {
            // Independent Maps: Reset column heights at row boundary
            if (independentMaps && y > 0 && y % 128 === 0) {
                colHeights.fill(0);
            }
            const yOffset = y * paddedWidth;

            for (let x = 0; x < width; x++) {
                const linearIdx = y * width + x;
                const pixelIdx = (yOffset + (x + PADDING_LEFT)) * 3;
                const r = floatBuffer[pixelIdx];
                const g = floatBuffer[pixelIdx + 1];
                const b = floatBuffer[pixelIdx + 2];

                // Clamp inline — no object allocation
                const clampR = r < 0 ? 0 : r > 255 ? 255 : r;
                const clampG = g < 0 ? 0 : g > 255 ? 255 : g;
                const clampB = b < 0 ? 0 : b > 255 ? 255 : b;

                let bestIndex: number;

                if (dithering === 'ordered' || dithering === 'ordered-8x8') {
                    // Ordered dithering
                    const twoClosest = findTwoClosestColors(clampR, clampG, clampB, candidatesSoA, usePerceptual, heightPenalty);
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
                    const result = findClosestColorIndex(clampR, clampG, clampB, candidatesSoA, usePerceptual, isErrorDiffusion, heightPenalty);
                    bestIndex = result.index;
                }

                const best = candidates[bestIndex];
                const bestRGB = best.rgb;
                const bestBrightness = best.brightness;

                const idx = linearIdx * 4;
                output[idx] = bestRGB.r;
                output[idx + 1] = bestRGB.g;
                output[idx + 2] = bestRGB.b;
                output[idx + 3] = 255;

                // Pack block candidate, relative tone, and support requirement into packedResults
                let tone = 0;
                if (buildMode === '3d_valley') {
                    if (bestBrightness === 'high') tone = 1;
                    else if (bestBrightness === 'low') tone = -1;
                }
                packedResults[linearIdx] = packPixel(bestIndex, tone, best.needsSupport);

                // Update height stats (standard/2d modes)
                if (bestBrightness === 'high') colHeights[x]++;
                else if (bestBrightness === 'low') colHeights[x]--;

                if (colHeights[x] > overallMax) overallMax = colHeights[x];
                if (colHeights[x] < overallMin) overallMin = colHeights[x];

                // Error diffusion
                if (isErrorDiffusion) {
                    let errorScale = baseErrorScale;

                    if (isHybrid) {
                        const variance = calculateLocalVariance(floatBuffer, x, y, width, height, paddedWidth);
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
                    const kernel = activeKernel!;

                    for (let i = 0; i < kernel.count; i++) {
                        if (independentMaps) {
                            const ny = y + kernel.dy[i];
                            if (Math.floor(y / 128) !== Math.floor(ny / 128)) continue;
                        }

                        const nIdx = pixelIdx + kernel.offsets[i];
                        const w = kernel.weights[i];

                        const rVal = floatBuffer[nIdx] + errR * w;
                        floatBuffer[nIdx] = rVal < 0 ? 0 : rVal > 255 ? 255 : rVal;

                        const gVal = floatBuffer[nIdx + 1] + errG * w;
                        floatBuffer[nIdx + 1] = gVal < 0 ? 0 : gVal > 255 ? 255 : gVal;

                        const bVal = floatBuffer[nIdx + 2] + errB * w;
                        floatBuffer[nIdx + 2] = bVal < 0 ? 0 : bVal > 255 ? 255 : bVal;
                    }
                }
            }
        }

        // Reconstruct the 1D tone map for height optimization (Smart Drop).
        // Tones are unpacked using bitwise shifting from the unified packedResults.
        let toneMap: Int8Array | null = null;
        if (buildMode === '3d_valley') {
            toneMap = new Int8Array(width * height);
            for (let i = 0; i < packedResults.length; i++) {
                toneMap[i] = unpackTone(packedResults[i]);
            }
        }

        // ============================================================================
        // Phase 2: Height Optimization (Smart Drop) for 3D Valley
        // ============================================================================
        if (buildMode === '3d_valley') {
            overallMin = 0;
            overallMax = 0;
            colHeights.fill(0);

            // Pre-allocate workspace for Smart Drop to avoid GC pressure
            const workspace: SmartDropWorkspace = {
                ref: new Int32Array(height + 1),
                minFuturo: new Int32Array(height + 1),
                path: new Int32Array(height)
            };

            for (let x = 0; x < width; x++) {
                if (independentMaps) {
                    const numChunks = Math.ceil(height / 128);
                    for (let c = 0; c < numChunks; c++) {
                        const startY = c * 128;
                        const endY = Math.min((c + 1) * 128, height);
                        const chunkHeight = endY - startY;

                        // Pass direct buffer access
                        const { min, max } = optimizeColumnHeights(
                            toneMap!,
                            startY * width + x, // startIndex
                            width,              // stride (skip one row width to go down)
                            chunkHeight,        // count
                            workspace
                        );

                        if (min < overallMin) overallMin = min;
                        if (max > overallMax) overallMax = max;

                        const range = max - min;
                        if (range > colHeights[x]) colHeights[x] = range;
                    }
                } else {
                    const { min, max } = optimizeColumnHeights(
                        toneMap!,
                        x,      // startIndex (at top row, column x)
                        width,  // stride
                        height, // count
                        workspace
                    );

                    if (min < overallMin) overallMin = min;
                    if (max > overallMax) overallMax = max;
                    colHeights[x] = max - min;
                }
            }
        } // end if (buildMode === '3d_valley') — Phase 2 Smart Drop stats

        // Collect Smart Drop paths into a flat column-major buffer.
        // Layout: heightPath[x * height + y] = optimized Y for column x, row y.
        // This avoids rerunning optimizeColumnHeights in build3DGeometry.
        if (buildMode === '3d_valley') {
            heightPath = new Int32Array(width * height);

            const ws2: SmartDropWorkspace = {
                ref: new Int32Array(height + 1),
                minFuturo: new Int32Array(height + 1),
                path: new Int32Array(height)
            };

            for (let x = 0; x < width; x++) {
                if (independentMaps) {
                    const numChunks = Math.ceil(height / 128);
                    for (let c = 0; c < numChunks; c++) {
                        const startY = c * 128;
                        const endY = Math.min((c + 1) * 128, height);
                        const chunkHeight = endY - startY;

                        const { path } = optimizeColumnHeights(
                            toneMap!,
                            startY * width + x,
                            width,
                            chunkHeight,
                            ws2
                        );

                        // Normalize so minimum is 0 within each chunk
                        let minChunkY = 0;
                        for (let i = 0; i < chunkHeight; i++) {
                            if (path[i] < minChunkY) minChunkY = path[i];
                        }
                        const shift = -minChunkY;
                        for (let i = 0; i < chunkHeight; i++) {
                            heightPath[x * height + startY + i] = path[i] + shift;
                        }
                    }
                } else {
                    const { path } = optimizeColumnHeights(
                        toneMap!,
                        x,
                        width,
                        height,
                        ws2
                    );

                    // Normalize so minimum is 0
                    let minPathY = 0;
                    for (let i = 0; i < height; i++) {
                        if (path[i] < minPathY) minPathY = path[i];
                    }
                    const shift = -minPathY;
                    for (let i = 0; i < height; i++) {
                        heightPath[x * height + i] = path[i] + shift;
                    }
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
        packedResults,
        candidates,
        heightPath: heightPath ?? null
    };
}

// ============================================================================
// Apply Manual Edits
// ============================================================================

/**
 * Super lightweight operations that overlays painted color corrections
 * directly onto a cloned copy of the quantized base image.
 * 
 * This avoids reprocessing the entire source image, keeping paint strokes instantaneous.
 * Re-runs vertical height profiles immediately after applying the modifications.
 */
export function applyManualEdits(
    baseImageData: ImageData,
    basePackedResults: Uint32Array,
    manualEdits: Record<number, { blockId: string; brightness: BrightnessLevel; rgb: RGB; needsSupport?: boolean }>,
    buildMode: BuildMode,
    candidates?: ColorCandidate[]
): { imageData: ImageData; stats: MapartStats; packedResults: Uint32Array } {
    const { width, height, data } = baseImageData;

    // Clone data to avoid mutating base
    const newData = new Uint8ClampedArray(data);
    const newPackedResults = new Uint32Array(basePackedResults);

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

        const packed = newPackedResults[index];
        let tone = 0;
        if (buildMode === '3d_valley') {
            if (edit.brightness === 'high') tone = 1;
            else if (edit.brightness === 'low') tone = -1;
        }

        let needsSupport = false;
        if (edit.needsSupport !== undefined) {
            needsSupport = edit.needsSupport;
        } else {
            needsSupport = unpackNeedsSupport(packed);
        }

        let candidateIdx = unpackCandidateIdx(packed);
        if (candidates) {
            const matchIdx = candidates.findIndex(c => c.blockId === edit.blockId && c.brightness === edit.brightness);
            if (matchIdx !== -1) {
                candidateIdx = matchIdx;
            }
        }
        newPackedResults[index] = packPixel(candidateIdx, tone, needsSupport);
    }

    // Recalculate Height Stats
    let overallMin = 0;
    let overallMax = 0;
    const colHeights = new Int32Array(width).fill(0);

    let toneMap: Int8Array | null = null;
    if (buildMode === '3d_valley') {
        toneMap = new Int8Array(width * height);
        for (let i = 0; i < newPackedResults.length; i++) {
            toneMap[i] = unpackTone(newPackedResults[i]);
        }
    }

    if (buildMode === '3d_valley' && toneMap) {
        const workspace: SmartDropWorkspace = {
            ref: new Int32Array(height + 1),
            minFuturo: new Int32Array(height + 1),
            path: new Int32Array(height)
        };

        for (let x = 0; x < width; x++) {
            // Run height optimization using shared workspace buffers to avoid GC pressure
            const { min, max } = optimizeColumnHeights(
                toneMap,
                x,      // startIndex
                width,  // stride
                height, // count
                workspace
            );

            if (min < overallMin) overallMin = min;
            if (max > overallMax) overallMax = max;
            colHeights[x] = max - min;
        }
    }

    return {
        imageData: new ImageData(newData, width, height),
        stats: {
            minHeight: overallMin,
            maxHeight: overallMax,
            heightMap: colHeights
        },
        packedResults: newPackedResults
    };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Evaluates source image color variance standard deviation (by sampling a subset of pixels)
 * to suggest the optimal dithering mode and diffusion strength.
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

    if (stdDev < 20) {
        return { mode: 'ordered', strength: 50 };
    } else if (stdDev < 50) {
        return { mode: 'floyd-steinberg', strength: 50 };
    } else {
        return { mode: 'hybrid', strength: 75 };
    }
}
