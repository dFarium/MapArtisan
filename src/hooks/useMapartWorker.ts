import { transfer as comlinkTransfer } from 'comlink';
import { useState, useEffect, useCallback } from 'react';
import type { MapartState, CropSettings, GridDimensions, ImageSettings } from '../store/useMapartStore';
import type { DitheringMode } from '../utils/processing';
import type { MapartStats, BrightnessLevel, RGB, BuildMode, ExportFormat } from '../types/mapart';
import type { Build3DGeometryProps } from '../utils/geometry/build3DGeometry';
import { usePreviewState } from './usePreviewState';
import { useWorkerManager } from './useWorkerManager';
import { useImagePreprocessing } from './useImagePreprocessing';

export interface UseMapartWorkerProps {
    uploadedImage: File | null;
    previewUrl: string | null;
    gridDimensions: GridDimensions;
    imageFitMode: MapartState['imageFitMode'];
    cropSettings: CropSettings;
    buildMode: BuildMode;
    selectedPaletteItems: Record<number, string | null>;
    threeDPrecision: number;
    dithering: string;
    usePerceptual: boolean;
    hybridStrength: number;
    independentMaps: boolean;
    setMapartStats: (stats: MapartStats | null) => void;
    imageSettings: ImageSettings;
    manualEdits: Record<number, { blockId: string; brightness: BrightnessLevel; rgb: RGB }>;
    blockSupport: 'all' | 'needed' | 'gravity';
    supportBlockId: string;
    exportMode: 'full' | 'sections';
    paletteVersion: string;
    exportFormat: ExportFormat;
}


/**
 * Custom React hook that interfaces with the Web Worker to perform
 * heavy image processing and mapart generation off-thread.
 *
 * It uses Comlink forRPC-like communications and optimizes data transfers
 * by using transferable ArrayBuffers to avoid structured clone overhead.
 */
export const useMapartWorker = ({
    previewUrl,
    gridDimensions,
    imageFitMode,
    cropSettings,
    buildMode,
    selectedPaletteItems,
    threeDPrecision,
    dithering,
    usePerceptual,
    hybridStrength,
    independentMaps,
    setMapartStats,
    imageSettings,
    manualEdits,
    blockSupport,
    supportBlockId,
    exportMode,
    paletteVersion,
    exportFormat,
}: UseMapartWorkerProps) => {
    // Worker lifecycle management
    const { workerApiRef, isProcessingRef, workerImageVersionRef } = useWorkerManager();
    
    // Consolidated preview state management
    const {
        scaledPreviewUrl, setScaledPreviewUrl,
        originalTransformedUrl, setOriginalTransformedUrl,
        previewImageData, setPreviewImageData,
        sourceImageVersion, incrementSourceImageVersion,
        clearAll: clearPreviewState
    } = usePreviewState();

    const mapartResolution = {
        width: 128 * gridDimensions.x,
        height: 128 * gridDimensions.y
    };

    // Image preprocessing
    const { sourceImageDataRef } = useImagePreprocessing({
        previewUrl,
        mapartResolution,
        imageFitMode,
        cropSettings,
        imageSettings,
        previewState: {
            setScaledPreviewUrl,
            setOriginalTransformedUrl,
            incrementSourceImageVersion,
        },
    });

    const [isProcessing, setIsProcessing] = useState(false);
    const [packedResults, setPackedResults] = useState<Uint32Array | null>(null);
    const [heightPath, setHeightPath] = useState<Int32Array | null>(null);
    const [prevPreviewUrl, setPrevPreviewUrl] = useState<string | null>(null);

    if (previewUrl !== prevPreviewUrl) {
        setPrevPreviewUrl(previewUrl);
        if (!previewUrl) {
            clearPreviewState();
            setPackedResults(null);
            setHeightPath(null);
        }
    }

    /**
     * Helper to asynchronously convert an ImageData object into a Blob URL
     * for rendering in the standard DOM img tags without clogging main-thread execution.
     */
    const imageDataToBlobUrl = async (imageData: ImageData): Promise<string> => {
        const canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get canvas context');
        ctx.putImageData(imageData, 0, 0);

        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(URL.createObjectURL(blob));
                } else {
                    reject(new Error('Failed to create blob'));
                }
            }, 'image/png');
        });
    };

    // 2a. Heavy Processing (Debounced processing when settings/image version change)
    useEffect(() => {
        if (!sourceImageDataRef.current || !workerApiRef.current) return;

        // 50ms debounce helps prevent overlapping requests while dragging sliders
        const DEBOUNCE_MS = 50;

        const timerId = setTimeout(() => {
            const hasSelection = Object.values(selectedPaletteItems).some(v => v !== null);
            if (!hasSelection) return;

            const active = true;

            const process = async (retryWithBuffer = false) => {
                const startTime = performance.now();
                isProcessingRef.current = true;
                setIsProcessing(true);

                try {
                    const api = workerApiRef.current;
                    if (!api) return;

                    const currentVersion = sourceImageVersion;
                    const needsBuffer = retryWithBuffer || (workerImageVersionRef.current !== currentVersion);

                    let bufferToSend: ArrayBuffer | null = null;
                    if (needsBuffer && sourceImageDataRef.current) {
                        // Slice a copy to keep image data available locally for color picking,
                        // and transfer this temporary copy to the worker to eliminate clone cost.
                        bufferToSend = sourceImageDataRef.current.data.buffer.slice(0);
                    }

                    const result = await api.processMapart(
                        bufferToSend ? comlinkTransfer(bufferToSend, [bufferToSend]) : null,
                        sourceImageDataRef.current!.width,
                        sourceImageDataRef.current!.height,
                        currentVersion,
                        buildMode,
                        selectedPaletteItems,
                        threeDPrecision,
                        dithering as DitheringMode,
                        usePerceptual,
                        hybridStrength,
                        independentMaps
                    );

                    if (!active) return;

                    // If the worker has dropped the cache because it restarted, retry sending the buffer
                    if (result.error === 'CACHE_MISS') {
                        console.warn("[useMapartWorker] Worker cache miss, retrying with buffer...");
                        return process(true);
                    }

                    // Discard results from older concurrent processes
                    if (result.version !== currentVersion) {
                        return;
                    }

                    workerImageVersionRef.current = currentVersion;

                    // Apply the current user's manual pixel edits to this newly computed base
                    const editsResult = await api.applyEdits(manualEdits);

                    if (!active) return;
                    if (editsResult.version !== currentVersion) return;

                    const processedData = editsResult.imageData;
                    const finalStats = editsResult.stats;
                    const finalPackedResults = editsResult.packedResults;

                    // Capture heightPath from the base processing result (not edits, which don't change heights)
                    const finalHeightPath = result.heightPath ?? null;

                    const canvas = document.createElement('canvas');
                    canvas.width = mapartResolution.width;
                    canvas.height = mapartResolution.height;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.putImageData(processedData, 0, 0);
                        const blobUrl = await imageDataToBlobUrl(processedData);
                        setScaledPreviewUrl(blobUrl);
                        setPreviewImageData(processedData);
                        setMapartStats(finalStats);
                        setPackedResults(finalPackedResults);
                        setHeightPath(finalHeightPath);
                    }

                    const endTime = performance.now();
                    console.log(`[useMapartWorker] E2E Mapart generation (v${currentVersion}) complete in ${(endTime - startTime).toFixed(1)}ms`);

                } catch (_err) {
                    if (active) console.error("Heavy processing failed", _err);
                } finally {
                    if (active) {
                        setIsProcessing(false);
                        isProcessingRef.current = false;
                    }
                }
            };

            process();
        }, DEBOUNCE_MS);


        return () => {
            clearTimeout(timerId);
            // Keeping the worker alive preserves the cached processing result (lastBaseResult)
            // inside the worker's thread memory. This completely skips quantization on simple edits.
        };
    }, [
        sourceImageVersion, buildMode, selectedPaletteItems, threeDPrecision, dithering,
        usePerceptual, hybridStrength, independentMaps, mapartResolution.width,
        mapartResolution.height, setMapartStats, manualEdits
    ]);

    // 2b. Light Processing (Manual Edits only)
    useEffect(() => {
        if (!workerApiRef.current || isProcessingRef.current) return;

        let active = true;

        const applyEditsVideo = async () => {
            try {
                const currentVersion = sourceImageVersion;
                // Only run light processing if the worker has the correct base version cached
                if (workerImageVersionRef.current !== currentVersion) return;

                const api = workerApiRef.current!;
                const result = await api.applyEdits(manualEdits);

                if (!active) return;
                // Concurrency check
                if (result.version !== currentVersion) return;

                const { imageData: processedData, stats: finalStats, packedResults: finalPackedResults } = result;

                const canvas = document.createElement('canvas');
                canvas.width = mapartResolution.width;
                canvas.height = mapartResolution.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.putImageData(processedData, 0, 0);
                    const blobUrl = await imageDataToBlobUrl(processedData);
                    setScaledPreviewUrl(blobUrl);
                    setPreviewImageData(processedData);
                    setMapartStats(finalStats);
                    setPackedResults(finalPackedResults);
                }
            } catch (e) {
                console.error("Light processing failed", e);
            }
        };

        applyEditsVideo();
        return () => { active = false; };
    }, [manualEdits, mapartResolution.width, mapartResolution.height, setMapartStats, sourceImageVersion]);

    const [isExporting, setIsExporting] = useState(false);

    const calculateMaterials = useCallback(async () => {
        if (!sourceImageDataRef.current || !workerApiRef.current) return null;

        try {
            const api = workerApiRef.current;
            const currentVersion = sourceImageVersion;
            const needsBuffer = workerImageVersionRef.current !== currentVersion;

            const bufferToSend = needsBuffer ? sourceImageDataRef.current.data.buffer.slice(0) : null;

            const counts = await api.calculateMaterialCounts(
                bufferToSend ? comlinkTransfer(bufferToSend, [bufferToSend]) : null,
                sourceImageDataRef.current.width,
                sourceImageDataRef.current.height,
                currentVersion,
                selectedPaletteItems,
                buildMode,
                threeDPrecision,
                dithering as DitheringMode,
                usePerceptual,
                hybridStrength,
                independentMaps,
                manualEdits,
                blockSupport,
                supportBlockId,
                exportMode
            );
            return counts;
        } catch (err) {
            console.error("Material calculation failed:", err);
            return null;
        }
    }, [selectedPaletteItems, buildMode, threeDPrecision, dithering, usePerceptual, hybridStrength, independentMaps, manualEdits, blockSupport, supportBlockId, sourceImageVersion, exportMode]);

    const exportMapart = useCallback(async (
        filename: string,
        metadata: Record<string, unknown>
    ) => {
        if (!sourceImageDataRef.current || !workerApiRef.current || isExporting) return;

        setIsExporting(true);
        try {
            const api = workerApiRef.current;
            const currentVersion = sourceImageVersion;
            const needsBuffer = workerImageVersionRef.current !== currentVersion;

            const bufferToSend = needsBuffer ? sourceImageDataRef.current.data.buffer.slice(0) : null;

            const result = await api.generateMapartExport(
                bufferToSend ? comlinkTransfer(bufferToSend, [bufferToSend]) : null,
                sourceImageDataRef.current.width,
                sourceImageDataRef.current.height,
                currentVersion,
                selectedPaletteItems,
                buildMode,
                filename,
                metadata,
                threeDPrecision,
                dithering as DitheringMode,
                usePerceptual,
                hybridStrength,
                independentMaps,
                manualEdits,
                blockSupport,
                supportBlockId,
                exportMode,
                paletteVersion,
                exportFormat
            );

            const { triggerDownload } = await import('../utils/export');
            triggerDownload(result.blob, result.filename);
        } catch (err) {
            console.error("Export failed:", err);
        } finally {
            setIsExporting(false);
        }
    }, [selectedPaletteItems, buildMode, threeDPrecision, dithering, usePerceptual, hybridStrength, independentMaps, manualEdits, blockSupport, supportBlockId, exportMode, paletteVersion, isExporting, sourceImageVersion, exportFormat]);

    const pickBlock = async (x: number, y: number) => {
        if (!workerApiRef.current) return null;
        try {
            return await workerApiRef.current.getBlockAt(x, y, manualEdits);
        } catch (e) {
            console.error(e);
            return null;
        }
    };

    /**
     * Runs `build3DGeometry` in the worker thread and returns the typed-array
     * result via zero-copy Transferable buffers.
     *
     * `packedResults` is structured-cloned to the worker (it stays alive in
     * the hook's state for other consumers such as the export pipeline).
     */
    const build3DGeometryAsync = useCallback(async (
        props: Build3DGeometryProps
    ): Promise<{
        positions: Float32Array;
        colors: Float32Array;
        textureIds: Int16Array;
        uniqueTextureIds: string[];
        count: number;
    } | null> => {
        const api = workerApiRef.current;
        if (!api) return null;
        try {
            return await api.build3DGeometryInWorker(props);
        } catch (e) {
            console.error('[useMapartWorker] build3DGeometryAsync failed', e);
            return null;
        }
    }, []);

    return {
        isProcessing,
        isExporting,
        scaledPreviewUrl,
        previewImageData,
        packedResults,
        heightPath,
        originalTransformedUrl,
        mapartResolution,
        exportMapart,
        calculateMaterials,
        pickBlock,
        build3DGeometryAsync
    };
};
