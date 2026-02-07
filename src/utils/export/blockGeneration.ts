/**
 * Block Generation
 * Generates 3D block positions from processed image data
 */

import type { BuildMode, BrightnessLevel, RGB, PaletteData } from '../../types/mapart';
import type { DitheringMode } from '../mapartProcessing';
import { processMapart, optimizeColumnHeights, applyManualEdits } from '../mapartProcessing';
import paletteData from '../../data/palette.json';
import type { BlockWithCoords } from './types';

/**
 * Generate block positions from processed image data.
 * Calls processMapart internally to ensure colors match the preview exactly.
 */
export function imageDataToBlockStates(
    imageData: ImageData,
    selectedPaletteItems: Record<number, string | null>,
    buildMode: BuildMode,
    applyOptimization: boolean = true,
    threeDPrecision: number = 0,
    dithering: DitheringMode = 'none',
    useCielab: boolean = true,
    hybridStrength: number = 50,
    independentMaps: boolean = false,
    manualEdits?: Record<number, { blockId: string; brightness: BrightnessLevel; rgb: RGB }>,
    blockSupport: 'all' | 'needed' | 'gravity' = 'all',
    supportBlockId: string = 'minecraft:cobblestone',
    exportMode: 'full' | 'sections' = 'sections'
): BlockWithCoords[] {
    // Process image to get exact same colors as preview
    const { imageData: baseImageData, toneMap: baseToneMap, needsSupportMap: baseNeedsSupportMap } = processMapart(
        imageData,
        buildMode,
        selectedPaletteItems,
        threeDPrecision,
        dithering,
        useCielab,
        hybridStrength,
        exportMode === 'full' ? false : independentMaps // Force global if full map
    );

    // Apply Manual Edits
    let processedImageData = baseImageData;
    if (manualEdits && Object.keys(manualEdits).length > 0) {
        const res = applyManualEdits(baseImageData, baseToneMap, baseNeedsSupportMap, manualEdits, buildMode);
        processedImageData = res.imageData;
    }

    const { width, height, data } = processedImageData;
    const blockStates: BlockWithCoords[] = [];
    const palette = (paletteData as unknown as PaletteData).colors;

    // Build RGB lookup map
    const rgbToColor = new Map<number, { colorID: number; brightness: BrightnessLevel; blockId: string }>();
    for (const color of palette) {
        const blockId = selectedPaletteItems[color.colorID];
        if (!blockId) continue;

        for (const [brightness, rgb] of Object.entries(color.brightnessValues)) {
            const key = (rgb.r << 16) | (rgb.g << 8) | rgb.b;
            rgbToColor.set(key, {
                colorID: color.colorID,
                brightness: brightness as BrightnessLevel,
                blockId: blockId
            });
        }
    }

    // Identify blocks that need support (from palette.json)
    const blocksNeedingSupport = new Set<string>();
    for (const color of palette) {
        for (const block of color.blocks) {
            if (block.needsSupport) {
                blocksNeedingSupport.add(block.id);
            }
        }
    }

    const is2D = buildMode === '2d';
    const columnBlocks: Map<number, BlockWithCoords[]> = new Map();

    // Process each column
    for (let x = 0; x < width; x++) {
        const currentColumnBlocks: BlockWithCoords[] = [];
        const rawHeights = new Int32Array(height);
        const columnTones = new Int8Array(height);
        let h = 0;

        // 1. Collect tones and raw incremental heights
        for (let y = 0; y < height; y++) {
            const idx = (y * width + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const key = (r << 16) | (g << 8) | b;
            const colorInfo = rgbToColor.get(key);

            if (colorInfo) {
                if (!is2D) {
                    if (colorInfo.brightness === 'high') h++;
                    else if (colorInfo.brightness === 'low') h--;
                }
                columnTones[y] = colorInfo.brightness === 'high' ? 1 : (colorInfo.brightness === 'low' ? -1 : 0);
            }
            rawHeights[y] = h;
        }

        // 2. Optimization and Grounding
        const finalHeights = new Int32Array(height);
        const applySD = !is2D && applyOptimization && buildMode === '3d_valley';
        const useIndependent = independentMaps && exportMode === 'sections';

        if (applySD) {
            if (useIndependent) {
                // Ground each 128-row section independently
                const numMaps = Math.ceil(height / 128);
                for (let m = 0; m < numMaps; m++) {
                    const zStart = m * 128;
                    const zEnd = Math.min((m + 1) * 128, height);
                    const chunkTones = Array.from(columnTones.slice(zStart, zEnd));
                    const { path } = optimizeColumnHeights(chunkTones);

                    const minChunkY = Math.min(...path, 0);
                    const shiftY = -minChunkY;

                    for (let i = 0; i < path.length; i++) {
                        finalHeights[zStart + i] = path[i] + shiftY;
                    }

                    // Add Noobline for this section (at global Z = zStart)
                    currentColumnBlocks.push({
                        blockId: supportBlockId,
                        x, y: 0 + shiftY, z: zStart
                    });
                    if (0 + shiftY > 0 && blockSupport === 'all') {
                        currentColumnBlocks.push({
                            blockId: supportBlockId,
                            x, y: shiftY - 1, z: zStart
                        });
                    }
                }
            } else {
                // Ground whole column
                const tonesArray = Array.from(columnTones);
                const { path } = optimizeColumnHeights(tonesArray);
                const minPathY = Math.min(...path, 0);
                const shiftY = -minPathY;

                for (let i = 0; i < path.length; i++) {
                    finalHeights[i] = path[i] + shiftY;
                }

                // Add Global Noobline
                currentColumnBlocks.push({
                    blockId: supportBlockId,
                    x, y: 0 + shiftY, z: 0
                });
                if (0 + shiftY > 0 && blockSupport === 'all') {
                    currentColumnBlocks.push({
                        blockId: supportBlockId,
                        x, y: shiftY - 1, z: 0
                    });
                }
            }
        } else {
            // No optimization (2D or other)
            for (let i = 0; i < height; i++) {
                finalHeights[i] = rawHeights[i];
            }
            // Basic Noobline
            currentColumnBlocks.push({
                blockId: supportBlockId,
                x, y: 0, z: 0
            });
        }

        // 3. Create blocks with final heights
        for (let y = 0; y < height; y++) {
            const idx = (y * width + x) * 4;
            const key = (data[idx] << 16) | (data[idx + 1] << 8) | data[idx + 2];
            const colorInfo = rgbToColor.get(key);
            if (!colorInfo) continue;

            const blockY = finalHeights[y];
            currentColumnBlocks.push({
                blockId: colorInfo.blockId,
                x, y: blockY, z: y + 1
            });

            // Support blocks
            if (!is2D && blockY > 0) {
                let addSupport = false;
                if (blockSupport === 'all') addSupport = true;
                else if (blockSupport === 'gravity') addSupport = blocksNeedingSupport.has(colorInfo.blockId);

                if (addSupport) {
                    currentColumnBlocks.push({
                        blockId: supportBlockId,
                        x, y: blockY - 1, z: y + 1
                    });
                }
            }
        }
        columnBlocks.set(x, currentColumnBlocks);
    }

    // Flatten results
    for (const blocks of columnBlocks.values()) {
        blockStates.push(...blocks);
    }

    // Global normalization (ensure nothing below 0)
    const globalMinY = blockStates.length > 0 ? Math.min(...blockStates.map(b => b.y), 0) : 0;
    if (globalMinY < 0) {
        for (const block of blockStates) {
            block.y -= globalMinY;
        }
    }

    return blockStates;
}
