/**
 * Materials Calculator
 * Calculate total materials needed for a map art
 */

import type { BuildMode, BrightnessLevel } from '../../types/mapart';
import type { DitheringMode } from '../processing';
import { imageDataToBlockStates } from './blockGeneration';

/**
 * Accumulated counts of required blocks.
 * - `total` contains the absolute amount of blocks needed to build all sections.
 * - `reusable` contains the peak amount of each block needed across any individual 128x128 section.
 *   This is extremely useful for survival players building the sections sequentially, as they
 *   only need to acquire the peak quantity and can tear down / reuse blocks for subsequent sections.
 */
export type MaterialCounts = {
    total: Record<string, number>;
    reusable: Record<string, number>;
};

/**
 * Iterates through all output blocks to aggregate total quantities and peak quantities.
 *
 * @param imageData Raw input pixel data.
 * @param selectedPaletteItems Selected color indices mapped to block namespaces.
 * @param buildMode Structural target layout (2D flat vs 3D valley steps).
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
export function calculateMaterialCounts(
    imageData: ImageData,
    selectedPaletteItems: Record<number, string | null>,
    buildMode: BuildMode,
    threeDPrecision: number = 0,
    dithering: DitheringMode = 'none',
    usePerceptual: boolean = true,
    hybridStrength: number = 50,
    independentMaps: boolean = false,
    manualEdits?: Record<number, { blockId: string; brightness: BrightnessLevel; rgb: { r: number; g: number; b: number } }>,
    blockSupport: 'all' | 'needed' | 'gravity' = 'all',
    supportBlockId: string = 'minecraft:cobblestone',
    exportMode: 'full' | 'sections' = 'sections',
    precomputedPackedResults?: Uint32Array
): MaterialCounts {
    const blockStates = imageDataToBlockStates(
        imageData, selectedPaletteItems, buildMode, true,
        threeDPrecision, dithering, usePerceptual, hybridStrength, independentMaps, manualEdits, blockSupport, supportBlockId,
        exportMode, precomputedPackedResults
    );

    const counts: Record<string, number> = {};
    const sectionCounts: Record<string, Record<string, number>> = {}; // keyed by "mapX_mapZ" -> { blockId: count }

    for (let i = 0; i < blockStates.count; i++) {
        const blockId = blockStates.palette[blockStates.paletteIndices[i]];
        if (blockId === 'minecraft:air') continue;

        // Total Counts
        counts[blockId] = (counts[blockId] || 0) + 1;

        // Section Counts (Reusable Logic)
        const mapX = Math.floor(blockStates.x[i] / 128);

        // Fix for Noobline (z=0). It belongs to the first map (Section 0)
        // Map Section 0 covers z=[0, 128] effectively (128 pixels + noobline)
        const adjustedZ = Math.max(0, blockStates.z[i] - 1);
        const mapZ = Math.floor(adjustedZ / 128);

        const sectionKey = `${mapX}_${mapZ}`;

        if (!sectionCounts[sectionKey]) {
            sectionCounts[sectionKey] = {};
        }
        sectionCounts[sectionKey][blockId] = (sectionCounts[sectionKey][blockId] || 0) + 1;
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
