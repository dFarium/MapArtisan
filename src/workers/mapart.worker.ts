import { expose, transfer } from 'comlink';
import { processMapart, applyManualEdits, type BuildMode, type DitheringMode, type ColorCandidate } from '../utils/mapartProcessing';
import { generateMapartExport, calculateMaterialCounts } from '../utils/litematicaExport';
import type { ManualEdit, MapartStats } from '../types/mapart';

// State to cache the last base processing result
// State to cache the last base processing result
let lastBaseResult: {
    sourceImage: ImageData; // Raw unprocessed image
    processedImage: ImageData; // Output image (quantized)
    toneMap: Int8Array;
    blockIndices: Int32Array;
    candidates: ColorCandidate[];
    stats: MapartStats;
    needsSupportMap: Uint8Array;
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
    ): { error?: 'CACHE_MISS'; version: number; stats?: MapartStats; toneMap?: Int8Array; needsSupportMap?: Uint8Array } => {

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
            toneMap: result.toneMap,
            blockIndices: result.blockIndices,
            candidates: result.candidates,
            stats: result.stats,
            needsSupportMap: result.needsSupportMap,
            width: result.imageData.width,
            height: result.imageData.height,
            buildMode,
            sourceVersion: version
        };

        // Transfer large arrays to avoid cloning, but we MUST return a CLONE 
        // if we intend to keep it in our cache (lastBaseResult), otherwise it detaches here!
        const toneMapClone = result.toneMap.slice(0);
        const needsSupportMapClone = result.needsSupportMap.slice(0);

        return transfer(
            {
                version,
                stats: result.stats,
                toneMap: toneMapClone,
                needsSupportMap: needsSupportMapClone
            },
            [toneMapClone.buffer, needsSupportMapClone.buffer]
        );
    },

    /**
     * Light step. Applies manual edits to the cached base result.
     */
    applyEdits: (manualEdits: Record<number, ManualEdit>): { version: number; imageData: ImageData; stats: MapartStats; toneMap: Int8Array; needsSupportMap: Uint8Array } => {
        if (!lastBaseResult) {
            throw new Error("No base mapart processed yet. Call processMapart first.");
        }

        const result = applyManualEdits(
            lastBaseResult.processedImage,
            lastBaseResult.toneMap,
            lastBaseResult.needsSupportMap,
            manualEdits,
            lastBaseResult.buildMode
        );

        // Here we can transfer directly because applyManualEdits created fresh buffers for result.
        return transfer(
            {
                version: lastBaseResult.sourceVersion,
                imageData: result.imageData,
                stats: result.stats,
                toneMap: result.toneMap,
                needsSupportMap: result.needsSupportMap
            },
            [result.imageData.data.buffer, result.toneMap.buffer, result.needsSupportMap.buffer]
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
        targetVersion: string = '1.21.5'
    ) => {
        let imageData: ImageData;
        if (imageDataBuffer) {
            imageData = new ImageData(new Uint8ClampedArray(imageDataBuffer), width, height);
            console.log(`[Worker] Export: Image cache updated (v${version})`);
        } else if (lastBaseResult) {
            imageData = lastBaseResult.sourceImage;
            console.log(`[Worker] Export: Using cached image (v${version})`);
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
            targetVersion
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
        blockSupport: 'all' | 'needed' | 'gravity' = 'all'
    ) => {
        let imageData: ImageData;
        if (imageDataBuffer) {
            imageData = new ImageData(new Uint8ClampedArray(imageDataBuffer), width, height);
        } else if (lastBaseResult) {
            imageData = lastBaseResult.sourceImage;
            console.log(`[Worker] Materials: Using cached image (v${version})`);
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
