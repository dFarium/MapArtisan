import { expose } from 'comlink';
import { processMapart, applyManualEdits, type BuildMode, type DitheringMode } from '../utils/mapartProcessing';
import { generateMapartExport, calculateMaterialCounts } from '../utils/litematicaExport';
import type { ManualEdit, MapartStats } from '../types/mapart';

// State to cache the last base processing result
let lastBaseResult: {
    imageData: ImageData;
    toneMap: Int8Array;
    blockIndices: Int32Array;
    candidates: any[]; // Using any to avoid importing ColorCandidate circular dep if confusing, but better to import
    stats: MapartStats;
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
        imageData: ImageData,
        buildMode: BuildMode,
        selectedPaletteItems: Record<number, string | null>,
        threeDPrecision: number,
        dithering: DitheringMode = 'none',
        useCielab: boolean = true,
        hybridStrength: number = 50,
        independentMaps: boolean = false
    ) => {
        const result = processMapart(
            imageData,
            buildMode,
            selectedPaletteItems,
            threeDPrecision,
            dithering,
            useCielab,
            hybridStrength,
            independentMaps,
            false // _optimizeHeight (not needed for preview generally, or strictly yes for stats? "Safe Reset" affects stats?)
            // Actually processMapart defaults `_optimizeHeight` to false in signature but logic uses it?
            // Wait, viewing `processMapart` signature shows `_optimizeHeight` param.
            // In preview we usually want standard behavior.
        );

        lastBaseResult = {
            imageData: result.imageData,
            toneMap: result.toneMap,
            blockIndices: result.blockIndices,
            candidates: result.candidates,
            stats: result.stats,
            width: result.imageData.width,
            height: result.imageData.height,
            buildMode
        };

        return { imageData: result.imageData, stats: result.stats };
    },

    /**
     * Light step. Applies manual edits to the cached base result.
     */
    applyEdits: (manualEdits: Record<number, ManualEdit>) => {
        if (!lastBaseResult) {
            throw new Error("No base mapart processed yet. Call processMapart first.");
        }

        const result = applyManualEdits(
            lastBaseResult.imageData,
            lastBaseResult.toneMap,
            manualEdits,
            lastBaseResult.buildMode
        );

        return { imageData: result.imageData, stats: result.stats };
    },

    generateMapartExport,
    calculateMaterialCounts,

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
        console.log(`[Worker] getBlockAt ${x},${y}. Width: ${width}, Indices len: ${blockIndices?.length}, Candidates len: ${candidates?.length}`);

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

expose(api);
