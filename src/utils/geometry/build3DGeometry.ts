/**
 * build3DGeometry.ts
 *
 * Pure, framework-agnostic function that converts mapart data
 * (toneMap, imageData, supports, etc.) into typed buffer arrays
 * ready to be uploaded directly to a THREE.InstancedMesh.
 *
 * Keeping this function pure (no THREE / React dependencies)
 * allows it to be:
 *   - Unit-tested in Node.js / Vitest without jsdom or WebGL
 *   - Benchmarked in isolation
 *   - Easily moved to a Web Worker in a future iteration
 */

import { optimizeColumnHeights, unpackTone, unpackNeedsSupport, unpackCandidateIdx } from '../processing';
import { type PreviewSection, type RGB } from '../../types/mapart';

// ─────────────────────────────────────────────────────────────────────────────
// Public Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Build3DGeometryProps {
    imageData: ImageData;
    /** Packed pixel results containing tone, block index, support flag */
    packedResults: Uint32Array;
    /** "all" | "needed" | "gravity" */
    blockSupport: 'all' | 'needed' | 'gravity';
    /** Support block RGB color (r,g,b 0-255) */
    supportColor: RGB;
    /** Export mode: full vs section-based */
    exportMode?: 'full' | 'sections';
    /** Whether each 128-row chunk is a separate map */
    independentMaps?: boolean;
    /** Optional section filter */
    previewSection?: PreviewSection;
    /** Block IDs array corresponding to candidate indices */
    candidateBlocks: string[];
    /** Optional support block ID */
    supportBlockId?: string;
    /**
     * Precomputed Smart Drop height path from processMapart, column-major layout:
     * `precomputedHeightPath[x * height + y]` = optimized, normalized Y for column x, row y.
     *
     * When provided, skips the per-column `optimizeColumnHeights` call entirely
     * (saves ~60% of build3DGeometry's CPU time for 3D valley maps).
     * Falls back to live calculation when null/undefined.
     */
    precomputedHeightPath?: Int32Array | null;
}

export interface InstanceGeometry {
    /** Flat Float32Array of XYZ positions, 3 floats per instance */
    positions: Float32Array;
    /** Flat Float32Array of RGB colors (0-1), 3 floats per instance */
    colors: Float32Array;
    /** Number of instances (valid entries in positions/colors) */
    count: number;
    /**
     * Texture index per instance (index into uniqueTextureIds).
     * -1 means no texture available → fall back to solid color.
     */
    textureIds: Int16Array;
    /**
     * Ordered list of unique block IDs referenced by textureIds.
     * E.g. ['minecraft:stone', 'minecraft:dirt', '__support__']
     */
    uniqueTextureIds: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds flat Float32Array buffers (positions + colors) for an InstancedMesh.
 *
 * Replaces the previous approach of:
 *   1. Allocating `blocks[]` — one JS object per block
 *   2. Calling `setMatrixAt / setColorAt` per-block in a useEffect loop
 *
 * With:
 *   1. Two typed arrays written in a single pass
 *   2. Ready for direct attribute upload: `mesh.instanceColor = new InstancedBufferAttribute(colors, 3)`
 *
 * @returns InstanceGeometry with pre-allocated Float32Arrays
 */
export function build3DGeometry(params: Build3DGeometryProps): InstanceGeometry {
    const {
        imageData,
        packedResults,
        blockSupport,
        supportColor,
        exportMode,
        independentMaps,
        previewSection,
        candidateBlocks,
        supportBlockId,
        precomputedHeightPath,
    } = params;

    const { width, height, data } = imageData;

    // ── Texture ID registry ────────────────────────────────────────────────
    // We build a compact list of unique block IDs encountered, and assign each
    // instance a short index into that list. -1 = no texture (solid color fallback).
    const textureIdRegistry = new Map<string, number>();
    const uniqueTextureIds: string[] = [];

    const registerTexture = (blockId: string): number => {
        let idx = textureIdRegistry.get(blockId);
        if (idx === undefined) {
            idx = uniqueTextureIds.length;
            uniqueTextureIds.push(blockId);
            textureIdRegistry.set(blockId, idx);
        }
        return idx;
    };

    // ── Pre-register support texture index if available ──────────────────────
    const supportTextureIdx = supportBlockId ? registerTexture(supportBlockId) : -1;

    // ── Upper-bound allocation ─────────────────────────────────────────────
    // Worst case: every pixel + a support block below it = 2× pixels.
    // We track `count` and slice at the end.
    const maxInstances = width * height * 2 + width; // +width for noobline column
    const positions = new Float32Array(maxInstances * 3);
    const colors = new Float32Array(maxInstances * 3);
    const textureIds = new Int16Array(maxInstances).fill(-1);
    let count = 0;

    // Normalised support color (0-1)
    const sr = supportColor.r / 255;
    const sg = supportColor.g / 255;
    const sb = supportColor.b / 255;

    // Pre-compute yOffsets to avoid multiplications in the hot inner loops
    const yOffsets = new Int32Array(height);
    for (let y = 0; y < height; y++) {
        yOffsets[y] = y * width;
    }

    // ── Per-column loop ────────────────────────────────────────────────────
    for (let x = 0; x < width; x++) {
        // Section X filter
        if (previewSection) {
            const sectionMinX = previewSection.x * 128;
            const sectionMaxX = sectionMinX + 128;
            if (x < sectionMinX || x >= sectionMaxX) continue;
        }

        // ── Path computation ───────────────────────────────────────────────
        // Fast path: use the precomputed column-major height path from the worker,
        // which already ran optimizeColumnHeights during processMapart.
        // Slow path: recompute from tones (used when no precomputed path is available).
        const path = new Int32Array(height);
        let globalShiftY = 0; // cached for noobline (avoids duplicate call)
        const sectionBaselines: Record<number, number> = {};
        const useIndependentSD = independentMaps && exportMode === 'sections';

        if (precomputedHeightPath) {
            // Zero-cost read from the precomputed buffer (column-major: x * height + y)
            const colBase = x * height;
            if (useIndependentSD) {
                const numMaps = Math.ceil(height / 128);
                for (let m = 0; m < numMaps; m++) {
                    const zStart = m * 128;
                    const zEnd = Math.min((m + 1) * 128, height);
                    const firstTone = unpackTone(packedResults[yOffsets[zStart] + x]);
                    sectionBaselines[m] = precomputedHeightPath[colBase + zStart] - firstTone;
                    for (let i = zStart; i < zEnd; i++) {
                        path[i] = precomputedHeightPath[colBase + i];
                    }
                }
            } else {
                const firstTone = unpackTone(packedResults[x]); // yOffsets[0] is 0
                globalShiftY = precomputedHeightPath[colBase + 0] - firstTone;
                for (let i = 0; i < height; i++) {
                    path[i] = precomputedHeightPath[colBase + i];
                }
            }
        } else {
            // Collect tones for this column (fallback: no precomputed path available)
            const tones = new Int8Array(height);
            for (let y = 0; y < height; y++) {
                tones[y] = unpackTone(packedResults[yOffsets[y] + x]);
            }

            if (useIndependentSD) {
                const numMaps = Math.ceil(height / 128);
                for (let m = 0; m < numMaps; m++) {
                    const zStart = m * 128;
                    const zEnd = Math.min((m + 1) * 128, height);
                    const { path: mapPath, min: minChunkY } = optimizeColumnHeights(tones.slice(zStart, zEnd));
                    const shiftY = -minChunkY;
                    sectionBaselines[m] = shiftY;
                    for (let i = 0; i < mapPath.length; i++) {
                        path[zStart + i] = mapPath[i] + shiftY;
                    }
                }
            } else {
                const { path: globalPath, min: minPathY } = optimizeColumnHeights(tones);
                globalShiftY = -minPathY;
                for (let i = 0; i < globalPath.length; i++) {
                    path[i] = globalPath[i] + globalShiftY;
                }
            }
        }

        // ── Row loop (y = -1 is the noobline) ─────────────────────────────
        for (let y = -1; y < height; y++) {
            let isNoobline = false;

            if (exportMode === 'sections' && previewSection) {
                const sectionMinY = previewSection.y * 128;
                const sectionMaxY = sectionMinY + 128;
                const nooblineY = sectionMinY - 1;
                if (y < sectionMinY || y >= sectionMaxY) {
                    if (y === nooblineY) {
                        isNoobline = true;
                    } else {
                        continue;
                    }
                }
            } else if (y === -1) {
                isNoobline = true;
            }

            // ── Block height (Y world coordinate) ─────────────────────────
            let blockY: number;
            if (isNoobline) {
                if (independentMaps) {
                    const m = previewSection
                        ? previewSection.y
                        : (y === -1 ? 0 : Math.floor(y / 128));
                    blockY = sectionBaselines[m] ?? 0;
                } else {
                    blockY = y === -1 ? globalShiftY : path[y];
                }
            } else {
                blockY = path[y];
            }

            // ── World position ─────────────────────────────────────────────
            let worldX: number, worldZ: number;
            if (previewSection) {
                worldX = x - (previewSection.x * 128 + 63.5);
                worldZ = y - (previewSection.y * 128 + 63.5);
            } else {
                worldX = x - (width - 1) / 2;
                worldZ = y - (height - 1) / 2;
            }

            // ── Write block ────────────────────────────────────────────────
            {
                const base = count * 3;
                positions[base] = worldX;
                positions[base + 1] = blockY;
                positions[base + 2] = worldZ;

                if (isNoobline) {
                    colors[base] = sr;
                    colors[base + 1] = sg;
                    colors[base + 2] = sb;
                    textureIds[count] = supportTextureIdx;
                } else {
                    const pxIdx = (yOffsets[y] + x) * 4;
                    colors[base] = data[pxIdx] / 255;
                    colors[base + 1] = data[pxIdx + 1] / 255;
                    colors[base + 2] = data[pxIdx + 2] / 255;

                    // Look up texture precisely using the unpacked candidate index
                    const linearIdx = yOffsets[y] + x;
                    const packedVal = packedResults[linearIdx];
                    const candidateIdx = unpackCandidateIdx(packedVal);
                    const blockId = candidateBlocks[candidateIdx];
                    if (blockId && blockId !== 'minecraft:air') {
                        textureIds[count] = registerTexture(blockId);
                    }
                }
                count++;
            }

            // ── Optional support block ─────────────────────────────────────
            if (blockY > 0) {
                let addSupport = false;
                if (blockSupport === 'all') {
                    addSupport = true;
                } else if (blockSupport === 'gravity' && packedResults) {
                    const linearIdx = y >= 0 ? yOffsets[y] + x : 0;
                    addSupport = unpackNeedsSupport(packedResults[linearIdx]);
                }

                if (addSupport) {
                    const base = count * 3;
                    positions[base] = worldX;
                    positions[base + 1] = blockY - 1;
                    positions[base + 2] = worldZ;
                    colors[base] = sr;
                    colors[base + 1] = sg;
                    colors[base + 2] = sb;
                    textureIds[count] = supportTextureIdx;
                    count++;
                }
            }
        }
    }

    // Return views into the pre-allocated buffers (no copy needed)
    return {
        positions: positions.subarray(0, count * 3),
        colors: colors.subarray(0, count * 3),
        textureIds: textureIds.subarray(0, count),
        uniqueTextureIds,
        count,
    };
}
