import { expose, transfer } from 'comlink';
import { processMapart, applyManualEdits, unpackCandidateIdx, type BuildMode, type DitheringMode, type ColorCandidate } from '../utils/mapartProcessing';
import { generateMapartExport, calculateMaterialCounts } from '../utils/litematicaExport';
import type { ManualEdit, MapartStats } from '../types/mapart';
import { build3DGeometry, type Build3DGeometryProps } from '../components/builder/3d/build3DGeometry';

/**
 * In-memory thread state caching the results of the last base color quantization.
 * 
 * By caching the base result:
 * 1. We avoid reprocessing the entire image when applying light manual pixel edits.
 * 2. We avoid recalculating material counts from scratch during export requests.
 */
let lastBaseResult: {
    sourceImage: ImageData;   // Original user uploaded image (preprocessed filters applied)
    processedImage: ImageData;  // Quantized output image containing pixel color candidates
    packedResults: Uint32Array; // Unified pixel result buffer (candidate index, tone, support flags)
    candidates: ColorCandidate[]; // Valid color list generated from active palette
    stats: MapartStats;        // Global layout dimension statistics
    width: number;
    height: number;
    buildMode: BuildMode;
    sourceVersion: number;
} | null = null;

const api = {
    /**
     * Performs color matching, error diffusion, and height profile calculations.
     * Caches the results in thread memory to accelerate subsequent paint actions.
     * 
     * @param imageDataBuffer Transferable buffer of the preprocessed image data.
     * @param width Width of the image.
     * @param height Height of the image.
     * @param version Unique version timestamp tracking image state.
     * @param buildMode Target layout configuration (2D flat vs 3D valley).
     * @param selectedPaletteItems Palette selection mapping IDs to minecraft blocks.
     * @param threeDPrecision Height optimizations slider limits.
     * @param dithering Pixel error diffusion/threshold matrix strategy.
     * @param useCielab Flag to compare colors using CIELAB distance instead of RGB.
     * @param hybridStrength Weighting factor for hybrid/adaptive dithering.
     * @param independentMaps Separate centering grids for multi-map setups.
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
     * Lightweight operation that overlays a map of manual pixel overrides
     * directly onto the quantized base, re-calculating stats immediately.
     * 
     * @param manualEdits Map of indices to manual painted color overrides.
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

    /**
     * Generates a fully packaged Litematica structure.
     * Uses precomputed packed results if cached version matches settings.
     */
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
     * Calculates the exact block counts required to assemble this schematic.
     * Returns total counts and reusable section counts.
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
     * Retrieves the block representation at a selected pixel index.
     */
    getBlockAt: (x: number, y: number, manualEdits: Record<number, ManualEdit>) => {
        if (!lastBaseResult) {
            console.warn("[Worker] getBlockAt: lastBaseResult is null");
            return null;
        }

        const { width, packedResults, candidates } = lastBaseResult;
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
    },

    /**
     * Runs `build3DGeometry` entirely off the main thread and returns the
     * resulting typed arrays as Transferable buffers (zero-copy).
     *
     * The caller must NOT use the passed-in `packedResults` buffer after this
     * call if it was transferred — pass a `.slice()` copy if the caller needs
     * to retain it.
     *
     * @param props All parameters for build3DGeometry. `packedResults` (if provided)
     *              will be sent by-value (structured clone) unless the caller
     *              explicitly transfers it beforehand.
     * @returns InstanceGeometry with positions, colors, and textureIds as
     *          Transferable Float32Array / Int16Array buffers.
     */
    build3DGeometryInWorker: (props: Build3DGeometryProps): {
        positions: Float32Array;
        colors: Float32Array;
        textureIds: Int16Array;
        uniqueTextureIds: string[];
        count: number;
    } => {
        const result = build3DGeometry(props);

        // Slice to exact size before transferring (subarray views share the original
        // over-allocated buffer, which would transfer the full allocation unnecessarily)
        const positions = result.positions.slice();
        const colors = result.colors.slice();
        const textureIds = result.textureIds.slice();

        return transfer(
            {
                positions,
                colors,
                textureIds,
                uniqueTextureIds: result.uniqueTextureIds,
                count: result.count,
            },
            [positions.buffer, colors.buffer, textureIds.buffer]
        );
    }
};

export type MapartWorkerApi = typeof api;

export const mapartWorkerApi = api;

expose(api);
