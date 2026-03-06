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

import { optimizeColumnHeights } from '../../../utils/mapartProcessing';
import type { PreviewSection } from '../../../types/mapart';

// ─────────────────────────────────────────────────────────────────────────────
// Public Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BlockColorRGB {
    r: number; // 0-255
    g: number; // 0-255
    b: number; // 0-255
}

export interface GeometryParams {
    /** Pixel-quantized image (RGBA, width×height) */
    imageData: ImageData;
    /** Tone map: -1 = low, 0 = normal, 1 = high. May be null for 2D mode. */
    toneMap?: Int8Array | null;
    /** "all" | "needed" | "gravity" */
    blockSupport: 'all' | 'needed' | 'gravity';
    /** Support block RGB color (r,g,b 0-255) */
    supportColor: BlockColorRGB;
    /** Export mode: full vs section-based */
    exportMode?: 'full' | 'sections';
    /** Whether each 128-row chunk is a separate map */
    independentMaps?: boolean;
    /** Optional section filter */
    previewSection?: PreviewSection;
    /** Gravity-based support bitmap (1 = needs support) */
    needsSupportMap?: Uint8Array | null;
    /**
     * Maps an RGB hex string (e.g. '#6d9930') to the selected block ID for that color.
     * Build this from selectedPaletteItems + palette color values on the caller side.
     * When provided, enables per-block texture assignment in the output.
     */
    blockIdMap?: Record<string, string>;
    /** Block ID used for support/noobline blocks (e.g. 'minecraft:cobblestone') */
    supportBlockId?: string;
}

/** Output buffers ready for GPU upload */
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
export function build3DGeometry(params: GeometryParams): InstanceGeometry {
    const {
        imageData,
        toneMap,
        blockSupport,
        supportColor,
        exportMode,
        independentMaps,
        previewSection,
        needsSupportMap,
        blockIdMap,
        supportBlockId,
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

    // Resolve the support block texture index once
    const supportTextureIdx = supportBlockId ? registerTexture(supportBlockId) : -1;

    // ── RGB-hex → textureIdx lookup (built from blockIdMap) ──────────────────
    // blockIdMap maps '#rrggbb' → blockId. We pre-register all textures and
    // build a fast Map for O(1) lookup inside the pixel loop.
    const rgbToTextureIdx = new Map<number, number>(); // packed RGB (24-bit) → textureIdx
    if (blockIdMap) {
        for (const [hex, blockId] of Object.entries(blockIdMap)) {
            // hex is '#rrggbb'
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            const packed = (r << 16) | (g << 8) | b;
            rgbToTextureIdx.set(packed, registerTexture(blockId));
        }
    }

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

    // ── Per-column loop ────────────────────────────────────────────────────
    for (let x = 0; x < width; x++) {
        // Section X filter
        if (previewSection) {
            const sectionMinX = previewSection.x * 128;
            const sectionMaxX = sectionMinX + 128;
            if (x < sectionMinX || x >= sectionMaxX) continue;
        }

        // Collect tones for this column
        const tones: number[] = new Array(height);
        for (let y = 0; y < height; y++) {
            tones[y] = toneMap ? toneMap[y * width + x] : 0;
        }

        // ── Path computation ───────────────────────────────────────────────
        const path = new Int32Array(height);
        let globalShiftY = 0; // cached for noobline (avoids duplicate call)
        const sectionBaselines: Record<number, number> = {};
        const useIndependentSD = independentMaps && exportMode === 'sections';

        if (useIndependentSD) {
            const numMaps = Math.ceil(height / 128);
            for (let m = 0; m < numMaps; m++) {
                const zStart = m * 128;
                const zEnd = Math.min((m + 1) * 128, height);
                const { path: mapPath } = optimizeColumnHeights(tones.slice(zStart, zEnd));
                const minChunkY = Math.min(...mapPath, 0);
                const shiftY = -minChunkY;
                sectionBaselines[m] = shiftY;
                for (let i = 0; i < mapPath.length; i++) {
                    path[zStart + i] = mapPath[i] + shiftY;
                }
            }
        } else {
            const { path: globalPath } = optimizeColumnHeights(tones);
            const minPathY = Math.min(...globalPath, 0);
            globalShiftY = -minPathY;
            for (let i = 0; i < globalPath.length; i++) {
                path[i] = globalPath[i] + globalShiftY;
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
                    const pxIdx = (y * width + x) * 4;
                    colors[base] = data[pxIdx] / 255;
                    colors[base + 1] = data[pxIdx + 1] / 255;
                    colors[base + 2] = data[pxIdx + 2] / 255;

                    // Look up texture by the pixel's exact quantized RGB
                    if (rgbToTextureIdx.size > 0) {
                        const packed = (data[pxIdx] << 16) | (data[pxIdx + 1] << 8) | data[pxIdx + 2];
                        textureIds[count] = rgbToTextureIdx.get(packed) ?? -1;
                    }
                }
                count++;
            }

            // ── Optional support block ─────────────────────────────────────
            if (blockY > 0) {
                let addSupport = false;
                if (blockSupport === 'all') {
                    addSupport = true;
                } else if (blockSupport === 'gravity' && needsSupportMap) {
                    const linearIdx = y >= 0 ? y * width + x : 0;
                    addSupport = needsSupportMap[linearIdx] === 1;
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
