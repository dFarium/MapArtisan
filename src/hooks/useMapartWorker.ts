import { wrap, type Remote, transfer as comlinkTransfer } from 'comlink';
import { useState, useRef, useEffect, useCallback } from 'react';
import type { MapartWorkerApi } from '../workers/mapart.worker';
import type { MapartState, CropSettings, GridDimensions, ImageSettings } from '../store/useMapartStore';
import type { DitheringMode } from '../utils/mapartProcessing';
import type { MapartStats, BrightnessLevel, RGB, BuildMode } from '../types/mapart';

interface UseMapartWorkerProps {
    uploadedImage: File | null;
    previewUrl: string | null;
    gridDimensions: GridDimensions;
    imageFitMode: MapartState['imageFitMode'];
    cropSettings: CropSettings;
    buildMode: BuildMode;
    selectedPaletteItems: Record<number, string | null>;
    threeDPrecision: number;
    dithering: string;
    useCielab: boolean;
    hybridStrength: number;
    independentMaps: boolean;
    setMapartStats: (stats: MapartStats | null) => void;
    imageSettings: ImageSettings;
    manualEdits: Record<number, { blockId: string; brightness: BrightnessLevel; rgb: RGB }>;
    blockSupport: 'all' | 'needed' | 'gravity';
    supportBlockId: string;
    exportMode: 'full' | 'sections';
    paletteVersion: string;
}


export const useMapartWorker = ({
    previewUrl,
    gridDimensions,
    imageFitMode,
    cropSettings,
    buildMode,
    selectedPaletteItems,
    threeDPrecision,
    dithering,
    useCielab,
    hybridStrength,
    independentMaps,
    setMapartStats,
    imageSettings,
    manualEdits,
    blockSupport,
    supportBlockId,
    exportMode,
    paletteVersion,
}: UseMapartWorkerProps) => {
    const workerRef = useRef<Worker | null>(null);
    const workerApiRef = useRef<Remote<MapartWorkerApi> | null>(null);
    const sourceImageDataRef = useRef<ImageData | null>(null);

    const isProcessingRef = useRef(false);
    const workerImageVersionRef = useRef(-1);
    const [isProcessing, setIsProcessing] = useState(false);
    const [scaledPreviewUrl, setScaledPreviewUrl] = useState<string | null>(null);
    const [previewImageData, setPreviewImageData] = useState<ImageData | null>(null);
    const [originalTransformedUrl, setOriginalTransformedUrl] = useState<string | null>(null);
    const [toneMap, setToneMap] = useState<Int8Array | null>(null);
    const [needsSupportMap, setNeedsSupportMap] = useState<Uint8Array | null>(null);
    const [sourceImageVersion, setSourceImageVersion] = useState(0);

    const mapartResolution = {
        width: 128 * gridDimensions.x,
        height: 128 * gridDimensions.y
    };

    // Helper: Convert ImageData to Blob URL (async, non-blocking)
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

    // Initialize worker
    const initWorker = useCallback(() => {
        if (workerRef.current) workerRef.current.terminate();
        workerRef.current = new Worker(new URL('../workers/mapart.worker.ts', import.meta.url), {
            type: 'module'
        });
        workerApiRef.current = wrap<MapartWorkerApi>(workerRef.current);
        isProcessingRef.current = false;
        workerImageVersionRef.current = -1;
    }, []);

    useEffect(() => {
        initWorker();
        return () => {
            workerRef.current?.terminate();
        };
    }, [initWorker]);

    // 1. Prepare Image
    useEffect(() => {
        if (!previewUrl) {
            setScaledPreviewUrl(null);
            setOriginalTransformedUrl(null);
            sourceImageDataRef.current = null;
            return;
        }

        console.log('[useMapartWorker] Prepare Image effect triggered', { previewUrl });
        const img = new Image();
        img.onload = async () => {
            console.log('[useMapartWorker] Image loaded', { width: img.width, height: img.height });
            const canvas = document.createElement('canvas');
            canvas.width = mapartResolution.width;
            canvas.height = mapartResolution.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return;

            const filterString = `brightness(${100 + imageSettings.brightness}%) contrast(${100 + imageSettings.contrast}%) saturate(${imageSettings.saturation}%)`;
            ctx.filter = filterString;
            ctx.imageSmoothingEnabled = false;

            if (imageFitMode === 'adjust') {
                ctx.drawImage(img, 0, 0, mapartResolution.width, mapartResolution.height);

                // High res original for display
                const targetAspect = mapartResolution.width / mapartResolution.height;
                const highResWidth = Math.min(img.width, 2048);
                const highResHeight = highResWidth / targetAspect;

                const highResCanvas = document.createElement('canvas');
                highResCanvas.width = highResWidth;
                highResCanvas.height = highResHeight;
                const highResCtx = highResCanvas.getContext('2d');
                if (highResCtx) {
                    highResCtx.filter = filterString;
                    highResCtx.drawImage(img, 0, 0, highResWidth, highResHeight);
                }
                setOriginalTransformedUrl(highResCanvas.toDataURL('image/jpeg', 0.9));

            } else {
                const { zoom, offsetX, offsetY } = cropSettings;
                const imgAspect = img.width / img.height;
                const canvasAspect = mapartResolution.width / mapartResolution.height;

                let baseWidth, baseHeight;
                if (imgAspect > canvasAspect) {
                    baseHeight = img.height;
                    baseWidth = img.height * canvasAspect;
                } else {
                    baseWidth = img.width;
                    baseHeight = img.width / canvasAspect;
                }

                const zoomedWidth = baseWidth / zoom;
                const zoomedHeight = baseHeight / zoom;

                const maxOffsetX = (img.width - zoomedWidth) / 2;
                const maxOffsetY = (img.height - zoomedHeight) / 2;
                const finalOffsetX = (img.width - zoomedWidth) / 2 + offsetX * maxOffsetX;
                const finalOffsetY = (img.height - zoomedHeight) / 2 + offsetY * maxOffsetY;

                const ctxImg = canvas.getContext('2d');
                if (ctxImg) {
                    ctxImg.drawImage(
                        img,
                        finalOffsetX, finalOffsetY, zoomedWidth, zoomedHeight,
                        0, 0, mapartResolution.width, mapartResolution.height
                    );
                }

                // High res original logic
                const highResCanvas = document.createElement('canvas');
                highResCanvas.width = zoomedWidth;
                highResCanvas.height = zoomedHeight;
                const highResCtx = highResCanvas.getContext('2d');
                if (highResCtx) {
                    highResCtx.filter = filterString;
                    highResCtx.drawImage(
                        img,
                        finalOffsetX, finalOffsetY, zoomedWidth, zoomedHeight,
                        0, 0, zoomedWidth, zoomedHeight
                    );
                }
                setOriginalTransformedUrl(highResCanvas.toDataURL('image/jpeg', 0.9));
            }

            sourceImageDataRef.current = ctx.getImageData(0, 0, mapartResolution.width, mapartResolution.height);
            setScaledPreviewUrl(canvas.toDataURL('image/png'));
            setSourceImageVersion(v => v + 1);
        };
        img.src = previewUrl;
    }, [previewUrl, mapartResolution.width, mapartResolution.height, imageFitMode, cropSettings, imageSettings]);

    // 2a. Heavy Processing (Settings Change)
    useEffect(() => {
        if (!sourceImageDataRef.current || !workerApiRef.current) return;

        // Debounce time in ms
        const DEBOUNCE_MS = 100;

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
                        // Use slice(0) to keep a copy in main for other uses (pickBlock, calculations)
                        // but then TRANSFER the copy to avoid the Comlink/Structured Clone cost.
                        bufferToSend = sourceImageDataRef.current.data.buffer.slice(0);
                    }

                    console.log(`[useMapartWorker] Requesting heavy processing (v${currentVersion}, buffer: ${!!bufferToSend})...`);

                    const result = await api.processMapart(
                        bufferToSend ? comlinkTransfer(bufferToSend, [bufferToSend]) : null,
                        sourceImageDataRef.current!.width,
                        sourceImageDataRef.current!.height,
                        currentVersion,
                        buildMode,
                        selectedPaletteItems,
                        threeDPrecision,
                        dithering as DitheringMode,
                        useCielab,
                        hybridStrength,
                        independentMaps
                    );

                    if (!active) return;

                    if (result.error === 'CACHE_MISS') {
                        console.warn("[useMapartWorker] Worker cache miss, retrying with buffer...");
                        return process(true);
                    }

                    // Concurrency check
                    if (result.version !== currentVersion) {
                        console.log(`[useMapartWorker] Discarding outdated heavy result (got v${result.version}, current v${currentVersion})`);
                        return;
                    }

                    workerImageVersionRef.current = currentVersion;

                    // Apply current edits to that new base
                    const editsResult = await api.applyEdits(manualEdits);

                    if (!active) return;
                    if (editsResult.version !== currentVersion) return;

                    const processedData = editsResult.imageData;
                    const finalStats = editsResult.stats;
                    const finalToneMap = editsResult.toneMap;
                    const finalNeedsSupportMap = editsResult.needsSupportMap;

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
                        setToneMap(finalToneMap);
                        setNeedsSupportMap(finalNeedsSupportMap);
                    }

                    const endTime = performance.now();
                    console.log(`[useMapartWorker] Heavy processing (v${currentVersion}) complete in ${(endTime - startTime).toFixed(1)}ms`);

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
            // Checks if it is currently processing to cancel it
            if (isProcessingRef.current) {
                console.log("Cancelling previous processing worker...");
                initWorker();
            }
        };
    }, [
        sourceImageVersion, buildMode, selectedPaletteItems, threeDPrecision, dithering,
        useCielab, hybridStrength, independentMaps, initWorker, mapartResolution.width,
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

                const { imageData: processedData, stats: finalStats, toneMap: finalToneMap, needsSupportMap: finalNeedsSupportMap } = result;

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
                    setToneMap(finalToneMap);
                    setNeedsSupportMap(finalNeedsSupportMap);
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
                useCielab,
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
    }, [selectedPaletteItems, buildMode, threeDPrecision, dithering, useCielab, hybridStrength, independentMaps, manualEdits, blockSupport, supportBlockId, sourceImageVersion, exportMode]);

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
                useCielab,
                hybridStrength,
                independentMaps,
                manualEdits,
                blockSupport,
                supportBlockId,
                exportMode,
                paletteVersion
            );

            const { triggerDownload } = await import('../utils/litematicaExport');
            triggerDownload(result.blob, result.filename);
        } catch (err) {
            console.error("Export failed:", err);
        } finally {
            setIsExporting(false);
        }
    }, [selectedPaletteItems, buildMode, threeDPrecision, dithering, useCielab, hybridStrength, independentMaps, manualEdits, blockSupport, supportBlockId, exportMode, paletteVersion, isExporting, sourceImageVersion]);

    const pickBlock = async (x: number, y: number) => {
        if (!workerApiRef.current) return null;
        try {
            return await workerApiRef.current.getBlockAt(x, y, manualEdits);
        } catch (e) {
            console.error(e);
            return null;
        }
    };

    return {
        isProcessing,
        isExporting,
        scaledPreviewUrl,
        previewImageData,
        toneMap,
        needsSupportMap,
        originalTransformedUrl,
        mapartResolution,
        exportMapart,
        calculateMaterials,
        pickBlock
    };
};
