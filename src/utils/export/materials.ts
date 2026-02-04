/**
 * Materials Calculator
 * Calculate total materials needed for a map art
 */

import type { BuildMode, BrightnessLevel } from '../../types/mapart';
import type { DitheringMode } from '../mapartProcessing';
import { imageDataToBlockStates } from './blockGeneration';

/**
 * Calculate total materials needed
 */
export function calculateMaterialCounts(
    imageData: ImageData,
    selectedPaletteItems: Record<number, string | null>,
    buildMode: BuildMode,
    threeDPrecision: number = 0,
    dithering: DitheringMode = 'none',
    useCielab: boolean = true,
    hybridStrength: number = 50,
    independentMaps: boolean = false,
    manualEdits?: Record<number, { blockId: string; brightness: BrightnessLevel; rgb: { r: number; g: number; b: number } }>,
    blockSupport: 'all' | 'needed' | 'gravity' = 'all'
): Record<string, number> {
    const blockStates = imageDataToBlockStates(
        imageData, selectedPaletteItems, buildMode, true,
        threeDPrecision, dithering, useCielab, hybridStrength, independentMaps, manualEdits, blockSupport
    );

    const counts: Record<string, number> = {};

    for (const block of blockStates) {
        if (block.blockId === 'minecraft:air') continue;
        counts[block.blockId] = (counts[block.blockId] || 0) + 1;
    }

    return counts;
}
