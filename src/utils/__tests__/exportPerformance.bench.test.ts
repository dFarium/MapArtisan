import { describe, it } from 'vitest';
import { performance } from 'perf_hooks';
import { processMapart, clearColorCache, getValidColors, optimizeColumnHeights, unpackCandidateIdx, unpackTone, unpackNeedsSupport } from '../mapartProcessing';
import { generateMapartExport } from '../export/fileExport';
import { imageDataToBlockStates } from '../export/blockGeneration';
import type { BuildMode, BrightnessLevel, RGB } from '../../types/mapart';
import type { DitheringMode } from '../mapartProcessing';

// ============================================================================
// Legacy Helpers & Constants (Baseline Representation)
// ============================================================================
const CANDIDATE_SHIFT_LEGACY = 16;
const CANDIDATE_MASK_LEGACY = 0xFF;
const TONE_SHIFT_LEGACY = 14;
const TONE_MASK_LEGACY = 0x3;
const SUPPORT_BIT_LEGACY = 13;

function packPixelLegacy(candidateIdx: number, tone: number, needsSupport: boolean): number {
    return ((candidateIdx & CANDIDATE_MASK_LEGACY) << CANDIDATE_SHIFT_LEGACY)
         | (((tone + 1) & TONE_MASK_LEGACY) << TONE_SHIFT_LEGACY)
         | (needsSupport ? (1 << SUPPORT_BIT_LEGACY) : 0);
}

function unpackCandidateIdxLegacy(packed: number): number {
    return (packed >> CANDIDATE_SHIFT_LEGACY) & CANDIDATE_MASK_LEGACY;
}

function unpackToneLegacy(packed: number): number {
    return ((packed >> TONE_SHIFT_LEGACY) & TONE_MASK_LEGACY) - 1;
}

function unpackNeedsSupportLegacy(packed: number): boolean {
    return (packed & (1 << SUPPORT_BIT_LEGACY)) !== 0;
}

/**
 * Legacy block generation simulation using per-column arrays, spreads, and the old unpacking layout.
 */
function imageDataToBlockStatesLegacy(
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
): any {
    const { width, height } = imageData;

    let packedResults: Uint32Array;
    if (precomputedPackedResults) {
        packedResults = precomputedPackedResults;
    } else {
        throw new Error("precomputedPackedResults required for legacy benchmark");
    }

    const candidates = getValidColors(selectedPaletteItems, buildMode);

    const blocksNeedingSupport = new Set<string>();
    for (const c of candidates) {
        if (c.needsSupport) {
            blocksNeedingSupport.add(c.blockId);
        }
    }

    const is2D = buildMode === '2d';

    const xList: number[] = [];
    const yList: number[] = [];
    const zList: number[] = [];
    const paletteIndicesList: number[] = [];

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

    getPaletteIndex(supportBlockId);

    const candidatePaletteIndices = new Uint32Array(candidates.length);
    for (let i = 0; i < candidates.length; i++) {
        candidatePaletteIndices[i] = getPaletteIndex(candidates[i].blockId);
    }

    for (let x = 0; x < width; x++) {
        const rawHeights = new Int32Array(height);
        const columnTones = new Int8Array(height);
        let h = 0;

        for (let y = 0; y < height; y++) {
            const linearIdx = y * width + x;
            const edit = manualEdits?.[linearIdx];
            const tone = edit
                ? (edit.brightness === 'high' ? 1 : (edit.brightness === 'low' ? -1 : 0))
                : unpackToneLegacy(packedResults[linearIdx]);

            if (!is2D) {
                h += tone;
            }
            columnTones[y] = tone;
            rawHeights[y] = h;
        }

        const finalHeights = new Int32Array(height);
        const applySD = !is2D && applyOptimization && buildMode === '3d_valley';
        const useIndependent = independentMaps && exportMode === 'sections';

        // Local column arrays for blocks (THE LEGACY SLOW PATH)
        const colX: number[] = [];
        const colY: number[] = [];
        const colZ: number[] = [];
        const colPaletteIndices: number[] = [];

        const addBlock = (bx: number, by: number, bz: number, blockId: string) => {
            colX.push(bx);
            colY.push(by);
            colZ.push(bz);
            colPaletteIndices.push(getPaletteIndex(blockId));
        };

        if (applySD) {
            if (useIndependent) {
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

                    const { path, min: minChunkY } = optimizeColumnHeights(chunkTones, 0, 1, chunkHeight, workspace);
                    const shiftY = -minChunkY;

                    for (let i = 0; i < path.length; i++) {
                        finalHeights[zStart + i] = path[i] + shiftY;
                    }

                    addBlock(x, 0 + shiftY, zStart, supportBlockId);
                    if (0 + shiftY > 0 && blockSupport === 'all') {
                        addBlock(x, shiftY - 1, zStart, supportBlockId);
                    }
                }
            } else {
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

                addBlock(x, 0 + shiftY, 0, supportBlockId);
                if (0 + shiftY > 0 && blockSupport === 'all') {
                    addBlock(x, shiftY - 1, 0, supportBlockId);
                }
            }
        } else {
            for (let i = 0; i < height; i++) {
                finalHeights[i] = rawHeights[i];
            }
            addBlock(x, 0, 0, supportBlockId);
        }

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
                const candidateIdx = unpackCandidateIdxLegacy(packedVal);
                const candidate = candidates[candidateIdx];
                if (!candidate) continue;

                blockId = candidate.blockId;
                needsSupport = unpackNeedsSupportLegacy(packedVal);
                paletteIdx = candidatePaletteIndices[candidateIdx];
            }

            if (blockId === 'minecraft:air') continue;

            const blockY = finalHeights[y];
            colX.push(x);
            colY.push(blockY);
            colZ.push(y + 1);
            colPaletteIndices.push(paletteIdx);

            if (!is2D && blockY > 0) {
                let addSupport = false;
                if (blockSupport === 'all') addSupport = true;
                else if (blockSupport === 'gravity') addSupport = needsSupport;

                if (addSupport) {
                    colX.push(x);
                    colY.push(blockY - 1);
                    colZ.push(y + 1);
                    colPaletteIndices.push(getPaletteIndex(supportBlockId));
                }
            }
        }

        xList.push(...colX);
        yList.push(...colY);
        zList.push(...colZ);
        paletteIndicesList.push(...colPaletteIndices);
    }

    let globalMinY = 0;
    const count = xList.length;
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
        x: new Int32Array(xList),
        y: new Int32Array(yList),
        z: new Int32Array(zList),
        palette,
        paletteIndices: new Uint32Array(paletteIndicesList),
        count
    };
}

/**
 * Optimized Block Generation using TypedArrays instead of growable number arrays.
 */
function imageDataToBlockStatesTypedArray(
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
): any {
    const { width, height } = imageData;

    let packedResults: Uint32Array;
    if (precomputedPackedResults) {
        packedResults = precomputedPackedResults;
    } else {
        throw new Error("precomputedPackedResults required");
    }

    const candidates = getValidColors(selectedPaletteItems, buildMode);

    const blocksNeedingSupport = new Set<string>();
    for (const c of candidates) {
        if (c.needsSupport) {
            blocksNeedingSupport.add(c.blockId);
        }
    }

    const is2D = buildMode === '2d';

    // Preallocate buffers. Max blocks = width * height * 2 (blocks + support) + scaffolding + margin
    const maxBlocks = width * height * 2 + width * 4 + 1000;
    const xList = new Int32Array(maxBlocks);
    const yList = new Int32Array(maxBlocks);
    const zList = new Int32Array(maxBlocks);
    const paletteIndicesList = new Uint32Array(maxBlocks);
    let count = 0;

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

    getPaletteIndex(supportBlockId);

    const candidatePaletteIndices = new Uint32Array(candidates.length);
    for (let i = 0; i < candidates.length; i++) {
        candidatePaletteIndices[i] = getPaletteIndex(candidates[i].blockId);
    }

    const addBlock = (bx: number, by: number, bz: number, blockId: string) => {
        xList[count] = bx;
        yList[count] = by;
        zList[count] = bz;
        paletteIndicesList[count] = getPaletteIndex(blockId);
        count++;
    };

    for (let x = 0; x < width; x++) {
        const rawHeights = new Int32Array(height);
        const columnTones = new Int8Array(height);
        let h = 0;

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

        const finalHeights = new Int32Array(height);
        const applySD = !is2D && applyOptimization && buildMode === '3d_valley';
        const useIndependent = independentMaps && exportMode === 'sections';

        if (applySD) {
            if (useIndependent) {
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

                    const { path, min: minChunkY } = optimizeColumnHeights(chunkTones, 0, 1, chunkHeight, workspace);
                    const shiftY = -minChunkY;

                    for (let i = 0; i < path.length; i++) {
                        finalHeights[zStart + i] = path[i] + shiftY;
                    }

                    addBlock(x, 0 + shiftY, zStart, supportBlockId);
                    if (0 + shiftY > 0 && blockSupport === 'all') {
                        addBlock(x, shiftY - 1, zStart, supportBlockId);
                    }
                }
            } else {
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

                addBlock(x, 0 + shiftY, 0, supportBlockId);
                if (0 + shiftY > 0 && blockSupport === 'all') {
                    addBlock(x, shiftY - 1, 0, supportBlockId);
                }
            }
        } else {
            for (let i = 0; i < height; i++) {
                finalHeights[i] = rawHeights[i];
            }
            addBlock(x, 0, 0, supportBlockId);
        }

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

// ============================================================================
// Palette setup
// ============================================================================
const PALETTE: Record<number, string | null> = {
    1: 'minecraft:stone',
    2: 'minecraft:dirt',
    4: 'minecraft:sand',
    8: 'minecraft:oak_log',
    10: 'minecraft:cobblestone',
    17: 'minecraft:spruce_log',
    49: 'minecraft:obsidian',
};

function makeImageData(width: number, height: number): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        const idx = i * 4;
        const v = (i * 1664525 + 1013904223) & 0xFFFFFF;
        data[idx]     = (v >> 16) & 0xFF;
        data[idx + 1] = (v >> 8)  & 0xFF;
        data[idx + 2] =  v        & 0xFF;
        data[idx + 3] = 255;
    }
    const { ImageData: CanvasImageData } = require('canvas');
    return new CanvasImageData(data, width, height);
}

// Bench runner
function runBench(iters: number, fn: () => void): number {
    const times: number[] = [];
    // Warm up
    fn();
    for (let i = 0; i < iters; i++) {
        const t0 = performance.now();
        fn();
        times.push(performance.now() - t0);
    }
    return times.reduce((a, b) => a + b, 0) / times.length;
}

describe('Schematic Export Performance Benchmarks', () => {
    it('measures E2E export compilation for 512x512 (4x4 maps) - Side-by-Side Comparison', async () => {
        const img = makeImageData(512, 512);

        // Precompute packed results for clean isolation of block generation.
        // For NEW:
        clearColorCache();
        const processResultNew = processMapart(img, '3d_valley', PALETTE, 50, 'floyd-steinberg', true, 50, false);
        const packedResultsNew = processResultNew.packedResults;

        // For LEGACY, we translate the new packed array to the legacy layout
        const packedResultsLegacy = new Uint32Array(512 * 512);
        const { unpackCandidateIdx, unpackTone, unpackNeedsSupport } = await import('../processing/colorSpace');
        for (let i = 0; i < packedResultsNew.length; i++) {
            const val = packedResultsNew[i];
            const candidateIdx = unpackCandidateIdx(val);
            const tone = unpackTone(val);
            const needsSupport = unpackNeedsSupport(val);
            packedResultsLegacy[i] = packPixelLegacy(candidateIdx, tone, needsSupport);
        }

        // ============================================================================
        // 1. Unpacking Micro-benchmarks
        // ============================================================================
        const unpackIters = 30;
        let sink = 0;
        const tUnpackLegacy = runBench(unpackIters, () => {
            for (let i = 0; i < packedResultsLegacy.length; i++) {
                sink += unpackCandidateIdxLegacy(packedResultsLegacy[i]);
            }
        });
        const tUnpackNew = runBench(unpackIters, () => {
            for (let i = 0; i < packedResultsNew.length; i++) {
                sink += unpackCandidateIdx(packedResultsNew[i]);
            }
        });
        const pctUnpackImprovement = ((tUnpackLegacy - tUnpackNew) / tUnpackLegacy) * 100;

        // ============================================================================
        // 2. Block Generation Benchmarks
        // ============================================================================
        const blockGenIters = 20;
        const tBlockGenLegacy = runBench(blockGenIters, () => {
            imageDataToBlockStatesLegacy(
                img, PALETTE, '3d_valley', true,
                50, 'floyd-steinberg', true, 50, false, undefined, 'all', 'minecraft:cobblestone',
                'sections', packedResultsLegacy
            );
        });

        const tBlockGenNew = runBench(blockGenIters, () => {
            imageDataToBlockStates(
                img, PALETTE, '3d_valley', true,
                50, 'floyd-steinberg', true, 50, false, undefined, 'all', 'minecraft:cobblestone',
                'sections', packedResultsNew
            );
        });

        const tBlockGenTypedArray = runBench(blockGenIters, () => {
            imageDataToBlockStatesTypedArray(
                img, PALETTE, '3d_valley', true,
                50, 'floyd-steinberg', true, 50, false, undefined, 'all', 'minecraft:cobblestone',
                'sections', packedResultsNew
            );
        });
        
        const pctBlockGenImprovement = ((tBlockGenLegacy - tBlockGenNew) / tBlockGenLegacy) * 100;
        const pctBlockGenTypedArrayImprovement = ((tBlockGenLegacy - tBlockGenTypedArray) / tBlockGenLegacy) * 100;

        // ============================================================================
        // 3. Complete Processing + Block Gen Pipeline
        // ============================================================================
        const pipelineIters = 10;
        
        const tPipelineLegacy = runBench(pipelineIters, () => {
            clearColorCache();
            const processResult = processMapart(img, '3d_valley', PALETTE, 50, 'floyd-steinberg', true, 50, false);
            // Simulate the O(W x H) loop that was removed
            const simulatedToneMap = new Int8Array(512 * 512);
            for (let i = 0; i < processResult.packedResults.length; i++) {
                simulatedToneMap[i] = unpackToneLegacy(packedResultsLegacy[i]);
            }
            imageDataToBlockStatesLegacy(
                img, PALETTE, '3d_valley', true,
                50, 'floyd-steinberg', true, 50, false, undefined, 'all', 'minecraft:cobblestone',
                'sections', packedResultsLegacy
            );
        });

        const tPipelineNew = runBench(pipelineIters, () => {
            clearColorCache();
            const processResult = processMapart(img, '3d_valley', PALETTE, 50, 'floyd-steinberg', true, 50, false);
            imageDataToBlockStates(
                img, PALETTE, '3d_valley', true,
                50, 'floyd-steinberg', true, 50, false, undefined, 'all', 'minecraft:cobblestone',
                'sections', processResult.packedResults
            );
        });

        const tPipelineTypedArray = runBench(pipelineIters, () => {
            clearColorCache();
            const processResult = processMapart(img, '3d_valley', PALETTE, 50, 'floyd-steinberg', true, 50, false);
            imageDataToBlockStatesTypedArray(
                img, PALETTE, '3d_valley', true,
                50, 'floyd-steinberg', true, 50, false, undefined, 'all', 'minecraft:cobblestone',
                'sections', processResult.packedResults
            );
        });

        const pctPipelineImprovement = ((tPipelineLegacy - tPipelineNew) / tPipelineLegacy) * 100;
        const pctPipelineTypedArrayImprovement = ((tPipelineLegacy - tPipelineTypedArray) / tPipelineLegacy) * 100;

        console.log('\n================================================================');
        console.log('       HOTPATH CUMULATIVE OPTIMIZATIONS BENCHMARK RESULTS       ');
        console.log('================================================================');
        console.log(`- Image Size:       512x512 pixels (262,656 total blocks)`);
        console.log(`- Iterations:       Unpacking (${unpackIters}), Block Gen (${blockGenIters}), Pipeline (${pipelineIters})`);
        console.log('----------------------------------------------------------------');
        console.log(`1. Candidate Index Unpacking (Bit-Layout):`);
        console.log(`   - Legacy (16-bit shift & mask):  ${tUnpackLegacy.toFixed(3)} ms`);
        console.log(`   - Optimized (Direct mask):       ${tUnpackNew.toFixed(3)} ms`);
        console.log(`   └ % Improvement:                 ${pctUnpackImprovement.toFixed(2)}%`);
        console.log('----------------------------------------------------------------');
        console.log(`2. Block Generation (Spreads & Column Arrays vs. Preallocated TypedArrays):`);
        console.log(`   - Legacy (Local arrays + spread): ${tBlockGenLegacy.toFixed(2)} ms`);
        console.log(`   - Optimized 1 (Global growable): ${tBlockGenNew.toFixed(2)} ms (${pctBlockGenImprovement.toFixed(2)}% vs Legacy)`);
        console.log(`   - Optimized 2 (TypedArrays):     ${tBlockGenTypedArray.toFixed(2)} ms`);
        console.log(`   └ % Improvement (TypedArray):    ${pctBlockGenTypedArrayImprovement.toFixed(2)}%`);
        console.log('----------------------------------------------------------------');
        console.log(`3. Complete Processing + Block Gen Pipeline:`);
        console.log(`   - Legacy Pipeline:               ${tPipelineLegacy.toFixed(2)} ms`);
        console.log(`   - Optimized 1 (Global growable): ${tPipelineNew.toFixed(2)} ms (${pctPipelineImprovement.toFixed(2)}% vs Legacy)`);
        console.log(`   - Optimized 2 (TypedArrays):     ${tPipelineTypedArray.toFixed(2)} ms`);
        console.log(`   └ % Improvement (TypedArray):    ${pctPipelineTypedArrayImprovement.toFixed(2)}%`);
        console.log('================================================================\n');

        // Prevent dead-code elimination of sink
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        sink;
    }, 30000);
});
