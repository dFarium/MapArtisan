/**
 * Block Generation
 * Generates 3D block positions from processed image data
 */

import type { BuildMode, BrightnessLevel, RGB } from '../../types/mapart';
import type { DitheringMode } from '../processing';
import {
    processMapart,
    optimizeColumnHeights,
    getValidColors,
    unpackCandidateIdx,
    unpackTone,
    unpackNeedsSupport
} from '../processing';
import type { BlockStatesBuffers } from './types';

/**
 * Transforms quantized 2D canvas pixel coordinates into a 3D block representation.
 * Computes individual heights, grounds the columns (reducing structural depth),
 * places scaffolding/nooblines, and handles block support for gravity/floating blocks.
 * 
 * Performance features:
 * 1. Accepts a flat precomputed PackedResults array to avoid re-quantization overhead.
 * 2. Compiles block outputs into flat coordinate buffers (`BlockStatesBuffers`) instead of allocating separate block objects.
 * 
 * @param imageData Raw input pixel data.
 * @param selectedPaletteItems Selected color indices mapped to block namespaces.
 * @param buildMode Structural target layout (2D flat vs 3D valley steps).
 * @param applyOptimization True to optimize structural height utilizing Smart Drop.
 * @param threeDPrecision Height optimizations slider limits.
 * @param dithering Pixel error diffusion/threshold matrix strategy.
 * @param usePerceptual Flag to compare colors in OKLab perceptual space rather than RGB.
 * @param hybridStrength Weighting multiplier for hybrid/adaptive dithering.
 * @param independentMaps Separate centering grids for independent map pieces.
 * @param manualEdits Map of indices to manual painted color overrides.
 * @param blockSupport Support block strategy (all, needed, gravity).
 * @param supportBlockId Namespace-key of the block used for scaffolding.
 * @param exportMode Export format splitting (export as whole map or split region sections).
 * @param precomputedPackedResults Optional pre-computed packed index buffer.
 */
export function imageDataToBlockStates(
    imageData: ImageData,
    selectedPaletteItems: Record<number, string | null>,
    buildMode: BuildMode,
    applyOptimization: boolean = true,
    threeDPrecision: number = 0,
    dithering: DitheringMode = 'none',
    usePerceptual: boolean = true,
    hybridStrength: number = 50,
    independentMaps: boolean = false,
    manualEdits?: Record<number, { blockId: string; brightness: BrightnessLevel; rgb: RGB }>,
    blockSupport: 'all' | 'needed' | 'gravity' = 'all',
    supportBlockId: string = 'minecraft:cobblestone',
    exportMode: 'full' | 'sections' = 'sections',
    precomputedPackedResults?: Uint32Array
): BlockStatesBuffers {
    const { width, height } = imageData;

    // Use cached results if available; otherwise, run full mapart processing
    let packedResults: Uint32Array;
    if (precomputedPackedResults) {
        packedResults = precomputedPackedResults;
    } else {
        const { packedResults: basePackedResults } = processMapart(
            imageData,
            buildMode,
            selectedPaletteItems,
            threeDPrecision,
            dithering,
            usePerceptual,
            hybridStrength,
            exportMode === 'full' ? false : independentMaps // Force global if full map
        );
        packedResults = basePackedResults;
    }

    // Build the candidates list from palette setup
    const candidates = getValidColors(selectedPaletteItems, buildMode);

    // Identify blocks that need support from candidates
    const blocksNeedingSupport = new Set<string>();
    for (const c of candidates) {
        if (c.needsSupport) {
            blocksNeedingSupport.add(c.blockId);
        }
    }

    const is2D = buildMode === '2d';

    // Pre-allocated flat buffers for maximum performance (avoids JS array resize overhead)
    const maxBlocks = width * height * 2 + width * 4 + 1000;
    const xList = new Int32Array(maxBlocks);
    const yList = new Int32Array(maxBlocks);
    const zList = new Int32Array(maxBlocks);
    const paletteIndicesList = new Uint32Array(maxBlocks);
    let count = 0;

    // Local block palette mapping
    const palette: string[] = ['minecraft:air'];
    const paletteIndexMap = new Map<string, number>();
    paletteIndexMap.set('minecraft:air', 0);

    const getPaletteIndex = (blockId: string): number => {
        let idx = paletteIndexMap.get(blockId);
        if (idx === undefined) {
            idx = palette.length;
            palette.push(blockId);
            paletteIndexMap.set(blockId, idx);
        }
        return idx;
    };

    // Pre-initialize support block ID in the local palette
    getPaletteIndex(supportBlockId);

    // Build a quick candidate-to-palette index mapping table
    const candidatePaletteIndices = new Uint32Array(candidates.length);
    for (let i = 0; i < candidates.length; i++) {
        candidatePaletteIndices[i] = getPaletteIndex(candidates[i].blockId);
    }

    // Process each column
    for (let x = 0; x < width; x++) {
        const rawHeights = new Int32Array(height);
        const columnTones = new Int8Array(height);
        let h = 0;

        // 1. Collect tones and raw incremental heights
        for (let y = 0; y < height; y++) {
            const linearIdx = y * width + x;
            const edit = manualEdits?.[linearIdx];
            const tone = edit
                ? (edit.brightness === 'high' ? 1 : (edit.brightness === 'low' ? -1 : 0))
                : unpackTone(packedResults[linearIdx]);

            if (!is2D) {
                h += tone;
            }
            columnTones[y] = tone;
            rawHeights[y] = h;
        }

        // 2. Optimization and Grounding
        const finalHeights = new Int32Array(height);
        const applySD = !is2D && applyOptimization && buildMode === '3d_valley';
        const useIndependent = independentMaps && exportMode === 'sections';

        const addBlock = (bx: number, by: number, bz: number, blockId: string) => {
            xList[count] = bx;
            yList[count] = by;
            zList[count] = bz;
            paletteIndicesList[count] = getPaletteIndex(blockId);
            count++;
        };

        if (applySD) {
            if (useIndependent) {
                // Ground each 128-row section independently
                const numMaps = Math.ceil(height / 128);
                const workspace = {
                    ref: new Int32Array(129),
                    minFuturo: new Int32Array(129),
                    path: new Int32Array(128)
                };

                for (let m = 0; m < numMaps; m++) {
                    const zStart = m * 128;
                    const zEnd = Math.min((m + 1) * 128, height);
                    const chunkHeight = zEnd - zStart;

                    const chunkTones = new Int8Array(chunkHeight);
                    for (let i = 0; i < chunkHeight; i++) {
                        chunkTones[i] = columnTones[zStart + i];
                    }

                    // Run optimization with chunkTones
                    const { path, min: minChunkY } = optimizeColumnHeights(chunkTones, 0, 1, chunkHeight, workspace);
                    const shiftY = -minChunkY;

                    for (let i = 0; i < path.length; i++) {
                        finalHeights[zStart + i] = path[i] + shiftY;
                    }

                    // Add Noobline for this section (at global Z = zStart)
                    addBlock(x, 0 + shiftY, zStart, supportBlockId);
                    if (0 + shiftY > 0 && blockSupport === 'all') {
                        addBlock(x, shiftY - 1, zStart, supportBlockId);
                    }
                }
            } else {
                // Ground whole column
                const workspace = {
                    ref: new Int32Array(height + 1),
                    minFuturo: new Int32Array(height + 1),
                    path: new Int32Array(height)
                };
                const { path, min: minPathY } = optimizeColumnHeights(columnTones, 0, 1, height, workspace);
                const shiftY = -minPathY;

                for (let i = 0; i < path.length; i++) {
                    finalHeights[i] = path[i] + shiftY;
                }

                // Add Global Noobline
                addBlock(x, 0 + shiftY, 0, supportBlockId);
                if (0 + shiftY > 0 && blockSupport === 'all') {
                    addBlock(x, shiftY - 1, 0, supportBlockId);
                }
            }
        } else {
            // No optimization (2D or other)
            for (let i = 0; i < height; i++) {
                finalHeights[i] = rawHeights[i];
            }
            // Basic Noobline
            addBlock(x, 0, 0, supportBlockId);
        }

        // 3. Create blocks with final heights
        for (let y = 0; y < height; y++) {
            const linearIdx = y * width + x;
            let blockId: string;
            let needsSupport: boolean;
            let paletteIdx: number;

            const edit = manualEdits?.[linearIdx];
            if (edit) {
                blockId = edit.blockId;
                needsSupport = blocksNeedingSupport.has(edit.blockId);
                paletteIdx = getPaletteIndex(blockId);
            } else {
                const packedVal = packedResults[linearIdx];
                const candidateIdx = unpackCandidateIdx(packedVal);
                const candidate = candidates[candidateIdx];
                if (!candidate) continue;

                blockId = candidate.blockId;
                needsSupport = unpackNeedsSupport(packedVal);
                paletteIdx = candidatePaletteIndices[candidateIdx];
            }

            if (blockId === 'minecraft:air') continue;

            const blockY = finalHeights[y];
            xList[count] = x;
            yList[count] = blockY;
            zList[count] = y + 1;
            paletteIndicesList[count] = paletteIdx;
            count++;

            // Support blocks
            if (!is2D && blockY > 0) {
                let addSupport = false;
                if (blockSupport === 'all') addSupport = true;
                else if (blockSupport === 'gravity') addSupport = needsSupport;

                if (addSupport) {
                    xList[count] = x;
                    yList[count] = blockY - 1;
                    zList[count] = y + 1;
                    paletteIndicesList[count] = getPaletteIndex(supportBlockId);
                    count++;
                }
            }
        }
    }

    // Global normalization (ensure nothing below 0)
    let globalMinY = 0;
    for (let i = 0; i < count; i++) {
        if (yList[i] < globalMinY) {
            globalMinY = yList[i];
        }
    }

    if (globalMinY < 0) {
        for (let i = 0; i < count; i++) {
            yList[i] -= globalMinY;
        }
    }

    return {
        x: xList.subarray(0, count),
        y: yList.subarray(0, count),
        z: zList.subarray(0, count),
        palette,
        paletteIndices: paletteIndicesList.subarray(0, count),
        count
    };
}
