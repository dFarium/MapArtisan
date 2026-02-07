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
    supportBlockId: string = 'minecraft:cobblestone'
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
        independentMaps
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
        const rawMapBlocks: { blockId: string; y: number; z: number }[] = [];
        let currentHeight = 0;
        const columnTones = new Int8Array(height).fill(0);
        const nooblineY = 0;

        // Process each row
        for (let y = 0; y < height; y++) {
            const idx = (y * width + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            const key = (r << 16) | (g << 8) | b;
            const colorInfo = rgbToColor.get(key);
            if (!colorInfo) continue;

            // Calculate height
            if (!is2D) {
                if (colorInfo.brightness === 'high') {
                    currentHeight++;
                    columnTones[y] = 1;
                } else if (colorInfo.brightness === 'low') {
                    currentHeight--;
                    columnTones[y] = -1;
                }
            }

            rawMapBlocks.push({
                blockId: colorInfo.blockId,
                y: currentHeight,
                z: y + 1,
            });
        }

        // Apply Smart Drop Optimization
        if (!is2D && applyOptimization && buildMode === '3d_valley') {
            const tonesArray = Array.from(columnTones);
            const { path } = optimizeColumnHeights(tonesArray);

            for (const block of rawMapBlocks) {
                const index = block.z - 1;
                if (index >= 0 && index < path.length) {
                    block.y = path[index];
                }
            }
        }

        // Calculate shift for grounding
        let shiftY = 0;
        if (!is2D && applyOptimization && rawMapBlocks.length > 0) {
            const minMapY = Math.min(...rawMapBlocks.map(b => b.y));
            const minOverallY = Math.min(minMapY, nooblineY);
            shiftY = -minOverallY;
        }

        // Add shifted blocks and supports
        for (const rawBlock of rawMapBlocks) {
            const finalY = rawBlock.y + shiftY;

            currentColumnBlocks.push({
                blockId: rawBlock.blockId,
                x: x,
                y: finalY,
                z: rawBlock.z
            });

            // Add Support Block
            if (!is2D && finalY > 0) {
                let addSupport = false;

                if (blockSupport === 'all') {
                    addSupport = true;
                } else if (blockSupport === 'needed') {
                    addSupport = false;
                } else if (blockSupport === 'gravity') {
                    addSupport = blocksNeedingSupport.has(rawBlock.blockId);
                }

                if (addSupport) {
                    currentColumnBlocks.push({
                        blockId: supportBlockId,
                        x: x,
                        y: finalY - 1,
                        z: rawBlock.z
                    });
                }
            }
        }

        // Add Noobline (Support Line)
        const finalNooblineY = is2D ? 0 : (nooblineY + shiftY);
        currentColumnBlocks.push({
            blockId: supportBlockId,
            x: x,
            y: finalNooblineY,
            z: 0,
        });

        // Support for Noobline
        if (!is2D && finalNooblineY > 0 && blockSupport === 'all') {
            currentColumnBlocks.push({
                blockId: supportBlockId,
                x: x,
                y: finalNooblineY - 1,
                z: 0,
            });
        }

        columnBlocks.set(x, currentColumnBlocks);
    }

    // Flatten columns
    for (const blocks of columnBlocks.values()) {
        blockStates.push(...blocks);
    }

    // Global normalization
    const globalMinY = Math.min(...blockStates.map(b => b.y), 0);
    if (globalMinY < 0) {
        for (const block of blockStates) {
            block.y -= globalMinY;
        }
    }

    return blockStates;
}
