import { expose } from 'comlink';
import { processMapart, applyManualEdits, type BuildMode, type DitheringMode, type ColorCandidate } from '../utils/mapartProcessing';
import { generateMapartExport, calculateMaterialCounts } from '../utils/litematicaExport';
import type { ManualEdit, MapartStats } from '../types/mapart';

// State to cache the last base processing result
let lastBaseResult: {
    imageData: ImageData;
    toneMap: Int8Array;
    blockIndices: Int32Array;
    candidates: ColorCandidate[];
    stats: MapartStats;
    needsSupportMap: Uint8Array;
    width: number;
    height: number;
    buildMode: BuildMode;
} | null = null;

const api = {
    /**
     * Heavy processing step. Generates the base mapart from settings.
     * Caches the result to allow fast manual editing later.
     */
    processMapart: (
        imageDataBuffer: ArrayBuffer,
        width: number,
        height: number,
        buildMode: BuildMode,
        selectedPaletteItems: Record<number, string | null>,
        threeDPrecision: number,
        dithering: DitheringMode = 'none',
        useCielab: boolean = true,
        hybridStrength: number = 50,
        independentMaps: boolean = false
    ): { imageData: ArrayBuffer; stats: MapartStats; toneMap: Int8Array; needsSupportMap: Uint8Array } => {
        // Reconstruct ImageData
        const imageData = new ImageData(new Uint8ClampedArray(imageDataBuffer), width, height);

        const result = processMapart(
            imageData,
            buildMode,
            selectedPaletteItems,
            threeDPrecision,
            dithering,
            useCielab,
            hybridStrength,
            independentMaps
        );

        lastBaseResult = {
            imageData: result.imageData,
            toneMap: result.toneMap,
            blockIndices: result.blockIndices,
            candidates: result.candidates,
            stats: result.stats,
            needsSupportMap: result.needsSupportMap,
            width: result.imageData.width,
            height: result.imageData.height,
            buildMode
        };

        // Transfer the buffer back?
        // NO. The consumer ignores this result and calls applyEdits immediately.
        // Also, we need `result.imageData` in `lastBaseResult` for applyEdits.
        // If we transfer it, it gets detached.
        // So we return everything EXCEPT the buffer to save bandwidth.
        // We can return a small placeholder or nothing for imageData.

        return {
            imageData: new ArrayBuffer(0), // Dummy
            stats: result.stats,
            toneMap: result.toneMap,
            needsSupportMap: result.needsSupportMap
        };
    },

    /**
     * Light step. Applies manual edits to the cached base result.
     */
    applyEdits: (manualEdits: Record<number, ManualEdit>): { imageData: ImageData; stats: MapartStats; toneMap: Int8Array; needsSupportMap: Uint8Array } => {
        if (!lastBaseResult) {
            throw new Error("No base mapart processed yet. Call processMapart first.");
        }

        const result = applyManualEdits(
            lastBaseResult.imageData,
            lastBaseResult.toneMap,
            lastBaseResult.needsSupportMap,
            manualEdits,
            lastBaseResult.buildMode
        );

        return { imageData: result.imageData, stats: result.stats, toneMap: result.toneMap, needsSupportMap: result.needsSupportMap };
    },

    generateMapartExport: async (
        imageDataBuffer: ArrayBuffer,
        width: number,
        height: number,
        selectedPaletteItems: Record<number, string | null>,
        buildMode: BuildMode,
        filename: string,
        metadata: Record<string, unknown>,
        threeDPrecision: number,
        dithering: DitheringMode,
        useCielab: boolean,
        hybridStrength: number,
        independentMaps: boolean,
        manualEdits: Record<number, ManualEdit>,
        blockSupport: 'all' | 'needed' | 'gravity' = 'all',
        targetVersion: string = '1.21.5'
    ) => {
        // Reconstruct ImageData
        // Note: For export we likely need a clean copy or the one from cache.
        // If we pass it from main thread, we must transfer a copy.
        const imageData = new ImageData(new Uint8ClampedArray(imageDataBuffer), width, height);

        return generateMapartExport(
            imageData,
            selectedPaletteItems,
            buildMode,
            filename,
            metadata, // metadata
            threeDPrecision,
            dithering,
            useCielab,
            hybridStrength,
            independentMaps,
            manualEdits,
            blockSupport,
            targetVersion
        );
    },

    /**
     * Calculates the materials required for the mapart.
     */

    calculateMaterialCounts: async (
        imageDataBuffer: ArrayBuffer,
        width: number,
        height: number,
        selectedPaletteItems: Record<number, string | null>,
        buildMode: BuildMode,
        threeDPrecision: number,
        dithering: DitheringMode,
        useCielab: boolean,
        hybridStrength: number,
        independentMaps: boolean,
        manualEdits: Record<number, ManualEdit>,
        blockSupport: 'all' | 'needed' | 'gravity' = 'all'
    ) => {
        // Reconstruct ImageData
        const imageData = new ImageData(new Uint8ClampedArray(imageDataBuffer), width, height);

        return calculateMaterialCounts(
            imageData,
            selectedPaletteItems,
            buildMode,
            threeDPrecision,
            dithering,
            useCielab,
            hybridStrength,
            independentMaps,
            manualEdits,
            blockSupport
        );
    },

    /**
     * Get the block information at a specific coordinate.
     * Checks manual edits first, then falls back to the processed base map.
     */
    getBlockAt: (x: number, y: number, manualEdits: Record<number, ManualEdit>) => {
        if (!lastBaseResult) {
            console.warn("[Worker] getBlockAt: lastBaseResult is null");
            return null;
        }

        const { width, blockIndices, candidates } = lastBaseResult;
        // console.log(`[Worker] getBlockAt ${x},${y}. Width: ${width}, Indices len: ${blockIndices?.length}, Candidates len: ${candidates?.length}`);

        const index = y * width + x;

        // Check manual edits first
        if (manualEdits[index]) {
            return manualEdits[index];
        }

        // Fallback to base
        const candidateIndex = blockIndices[index];
        if (candidateIndex >= 0 && candidateIndex < candidates.length) {
            const c = candidates[candidateIndex];
            return {
                blockId: c.blockId,
                brightness: c.brightness,
                rgb: c.rgb
            };
        }

        return null;
    }
};

export type MapartWorkerApi = typeof api;

export const mapartWorkerApi = api;

expose(api);
