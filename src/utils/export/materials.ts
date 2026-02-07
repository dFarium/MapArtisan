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
export type MaterialCounts = {
    total: Record<string, number>;
    reusable: Record<string, number>;
};

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
    blockSupport: 'all' | 'needed' | 'gravity' = 'all',
    supportBlockId: string = 'minecraft:cobblestone'
): MaterialCounts { // Changed return type
    const blockStates = imageDataToBlockStates(
        imageData, selectedPaletteItems, buildMode, true,
        threeDPrecision, dithering, useCielab, hybridStrength, independentMaps, manualEdits, blockSupport, supportBlockId
    );

    const counts: Record<string, number> = {};
    const sectionCounts: Record<string, Record<string, number>> = {}; // keyed by "mapX_mapZ" -> { blockId: count }

    for (const block of blockStates) {
        if (block.blockId === 'minecraft:air') continue;

        // Total Counts
        counts[block.blockId] = (counts[block.blockId] || 0) + 1;

        // Section Counts (Reusable Logic)
        const mapX = Math.floor(block.x / 128);

        // Fix for Noobline (z=0). It belongs to the first map (Section 0)
        // Map Section 0 covers z=[0, 128] effectively (128 pixels + noobline)
        const adjustedZ = Math.max(0, block.z - 1);
        const mapZ = Math.floor(adjustedZ / 128);

        const sectionKey = `${mapX}_${mapZ}`;

        if (!sectionCounts[sectionKey]) {
            sectionCounts[sectionKey] = {};
        }
        sectionCounts[sectionKey][block.blockId] = (sectionCounts[sectionKey][block.blockId] || 0) + 1;
    }

    // Calculate Reusable Counts (Max of each block across all sections)
    const reusable: Record<string, number> = {};

    // First, find all unique block IDs present
    const allBlockIds = new Set<string>(Object.keys(counts));

    for (const blockId of allBlockIds) {
        let maxCount = 0;
        for (const key in sectionCounts) {
            const countInSection = sectionCounts[key][blockId] || 0;
            if (countInSection > maxCount) {
                maxCount = countInSection;
            }
        }
        reusable[blockId] = maxCount;
    }

    return { total: counts, reusable };
}
