import { expose, transfer } from 'comlink';
import { processMapart, applyManualEdits, unpackCandidateIdx, type BuildMode, type DitheringMode, type ColorCandidate } from '../utils/mapartProcessing';
import { generateMapartExport, calculateMaterialCounts } from '../utils/litematicaExport';
import type { ManualEdit, MapartStats } from '../types/mapart';

// State to cache the last base processing result
// State to cache the last base processing result
let lastBaseResult: {
    sourceImage: ImageData; // Raw unprocessed image
    processedImage: ImageData; // Output image (quantized)
    packedResults: Uint32Array;
    candidates: ColorCandidate[];
    stats: MapartStats;
    width: number;
    height: number;
    buildMode: BuildMode;
    sourceVersion: number;
} | null = null;

const api = {
    /**
     * Heavy processing step. Generates the base mapart from settings.
     * Caches the result to allow fast manual editing later.
     */
    processMapart: (
        imageDataBuffer: ArrayBuffer | null,
        width: number,
        height: number,
        version: number,
        buildMode: BuildMode,
        selectedPaletteItems: Record<number, string | null>,
        threeDPrecision: number,
        dithering: DitheringMode = 'none',
        useCielab: boolean = true,
        hybridStrength: number = 50,
        independentMaps: boolean = false
    ): { error?: 'CACHE_MISS'; version: number; stats?: MapartStats; packedResults?: Uint32Array } => {

        let sourceImage: ImageData;

        if (imageDataBuffer) {
            // New image data provided, update cache
            sourceImage = new ImageData(new Uint8ClampedArray(imageDataBuffer), width, height);
            console.log(`[Worker] Source Image Updated. Version: ${version}`);
        } else {
            // No buffer provided, check cache
            if (!lastBaseResult || !lastBaseResult.sourceImage) {
                console.warn(`[Worker] Cache miss: No cached source available for version ${version}`);
                return { error: 'CACHE_MISS', version };
            }
            sourceImage = lastBaseResult.sourceImage;
            console.log(`[Worker] Using cached Source Image for version ${version}`);
        }

        const result = processMapart(
            sourceImage,
            buildMode,
            selectedPaletteItems,
            threeDPrecision,
            dithering,
            useCielab,
            hybridStrength,
            independentMaps
        );

        lastBaseResult = {
            sourceImage,
            processedImage: result.imageData,
            packedResults: result.packedResults,
            candidates: result.candidates,
            stats: result.stats,
            width: result.imageData.width,
            height: result.imageData.height,
            buildMode,
            sourceVersion: version
        };

        // Transfer large arrays to avoid cloning, but we MUST return a CLONE 
        // if we intend to keep it in our cache (lastBaseResult), otherwise it detaches here!
        const packedResultsClone = result.packedResults.slice(0);

        return transfer(
            {
                version,
                stats: result.stats,
                packedResults: packedResultsClone
            },
            [packedResultsClone.buffer]
        );
    },

    /**
     * Light step. Applies manual edits to the cached base result.
     */
    applyEdits: (manualEdits: Record<number, ManualEdit>): { version: number; imageData: ImageData; stats: MapartStats; packedResults: Uint32Array } => {
        if (!lastBaseResult) {
            throw new Error("No base mapart processed yet. Call processMapart first.");
        }

        const result = applyManualEdits(
            lastBaseResult.processedImage,
            lastBaseResult.packedResults,
            manualEdits,
            lastBaseResult.buildMode
        );

        // Here we can transfer directly because applyManualEdits created fresh buffers for result.
        return transfer(
            {
                version: lastBaseResult.sourceVersion,
                imageData: result.imageData,
                stats: result.stats,
                packedResults: result.packedResults
            },
            [result.imageData.data.buffer, result.packedResults.buffer]
        );
    },

    generateMapartExport: async (
        imageDataBuffer: ArrayBuffer | null,
        width: number,
        height: number,
        version: number,
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
        supportBlockId: string = 'minecraft:cobblestone',
        exportMode: 'full' | 'sections' = 'sections',
        targetVersion: string = '1.21.5'
    ) => {
        let imageData: ImageData;
        let precomputedPackedResults: Uint32Array | undefined = undefined;

        if (imageDataBuffer) {
            imageData = new ImageData(new Uint8ClampedArray(imageDataBuffer), width, height);
            console.log(`[Worker] Export: Image cache updated (v${version})`);
        } else if (lastBaseResult) {
            imageData = lastBaseResult.sourceImage;
            if (lastBaseResult.sourceVersion === version && lastBaseResult.buildMode === buildMode) {
                precomputedPackedResults = lastBaseResult.packedResults;
                console.log(`[Worker] Export: Using cached precomputed packedResults (v${version})`);
            } else {
                console.log(`[Worker] Export: Cache version mismatch or not matching config (cached v${lastBaseResult.sourceVersion}, requested v${version}). Re-processing.`);
            }
        } else {
            throw new Error("Export failed: No image data provided and no cache available.");
        }

        return generateMapartExport(
            imageData,
            selectedPaletteItems,
            buildMode,
            filename,
            metadata,
            threeDPrecision,
            dithering,
            useCielab,
            hybridStrength,
            independentMaps,
            manualEdits,
            blockSupport,
            supportBlockId,
            exportMode,
            targetVersion,
            precomputedPackedResults
        );
    },

    /**
     * Calculates the materials required for the mapart.
     */

    calculateMaterialCounts: async (
        imageDataBuffer: ArrayBuffer | null,
        width: number,
        height: number,
        version: number,
        selectedPaletteItems: Record<number, string | null>,
        buildMode: BuildMode,
        threeDPrecision: number,
        dithering: DitheringMode,
        useCielab: boolean,
        hybridStrength: number,
        independentMaps: boolean,
        manualEdits: Record<number, ManualEdit>,
        blockSupport: 'all' | 'needed' | 'gravity' = 'all',
        supportBlockId: string = 'minecraft:cobblestone',
        exportMode: 'full' | 'sections' = 'sections'
    ) => {
        let imageData: ImageData;
        let precomputedPackedResults: Uint32Array | undefined = undefined;

        if (imageDataBuffer) {
            imageData = new ImageData(new Uint8ClampedArray(imageDataBuffer), width, height);
        } else if (lastBaseResult) {
            imageData = lastBaseResult.sourceImage;
            if (lastBaseResult.sourceVersion === version && lastBaseResult.buildMode === buildMode) {
                precomputedPackedResults = lastBaseResult.packedResults;
                console.log(`[Worker] Materials: Using cached precomputed packedResults (v${version})`);
            } else {
                console.log(`[Worker] Materials: Cache version mismatch or not matching config (cached v${lastBaseResult.sourceVersion}, requested v${version}). Re-processing.`);
            }
        } else {
            throw new Error(`Material calculation failed: No image data provided and no cache available (v${version}).`);
        }

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
            blockSupport,
            supportBlockId,
            exportMode,
            precomputedPackedResults
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

        const { width, packedResults, candidates } = lastBaseResult;
        // console.log(`[Worker] getBlockAt ${x},${y}. Width: ${width}, Candidates len: ${candidates?.length}`);

        const index = y * width + x;

        // Check manual edits first
        if (manualEdits[index]) {
            return manualEdits[index];
        }

        // Fallback to base
        const candidateIndex = unpackCandidateIdx(packedResults[index]);
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
